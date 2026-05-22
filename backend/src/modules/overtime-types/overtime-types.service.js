import { db } from '../../config/database.js';
import { overtimeTypes } from '../../db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import { createError } from '../../middleware/errorHandler.js';

export const findAll = async ({ search, isActive } = {}) => {
  const conditions = [];
  if (search) conditions.push(like(overtimeTypes.name, `%${search}%`));
  if (isActive !== undefined) conditions.push(eq(overtimeTypes.isActive, isActive !== 'false'));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(overtimeTypes).where(where).orderBy(overtimeTypes.sortOrder, overtimeTypes.code);
};

export const findById = async (id) => {
  const [ot] = await db.select().from(overtimeTypes).where(eq(overtimeTypes.id, parseInt(id))).limit(1);
  if (!ot) throw createError('Tipo de hora extra no encontrado', 404);
  return ot;
};

export const findByCode = async (code) => {
  const [ot] = await db.select().from(overtimeTypes).where(eq(overtimeTypes.code, code)).limit(1);
  return ot || null;
};

export const create = async (data) => {
  const existing = await findByCode(data.code);
  if (existing) throw createError(`Ya existe un tipo de hora extra con el código "${data.code}"`, 409);

  const [ot] = await db.insert(overtimeTypes).values({
    code: data.code.toLowerCase().replace(/\s+/g, '_'),
    name: data.name,
    factor: data.factor,
    description: data.description || null,
    sortOrder: data.sortOrder ?? 0,
    isActive: true,
  }).returning();
  return ot;
};

export const update = async (id, data) => {
  const existing = await findById(id);

  // Si cambia el código, verificar que no esté en uso
  if (data.code && data.code !== existing.code) {
    const dup = await findByCode(data.code);
    if (dup) throw createError(`Ya existe un tipo de hora extra con el código "${data.code}"`, 409);
  }

  const [ot] = await db.update(overtimeTypes).set({
    code: data.code ? data.code.toLowerCase().replace(/\s+/g, '_') : existing.code,
    name: data.name ?? existing.name,
    factor: data.factor !== undefined ? data.factor : existing.factor,
    description: data.description !== undefined ? data.description : existing.description,
    sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeTypes.id, parseInt(id))).returning();
  return ot;
};

export const toggleActive = async (id) => {
  const existing = await findById(id);
  const [ot] = await db.update(overtimeTypes).set({
    isActive: !existing.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeTypes.id, parseInt(id))).returning();
  return ot;
};
