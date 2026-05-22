import { db } from '../../config/database.js';
import { costCenters } from '../../db/schema.js';
import { eq, like, and } from 'drizzle-orm';
import { createError } from '../../middleware/errorHandler.js';

export const findAll = async ({ search, isActive } = {}) => {
  const conditions = [];
  if (search) conditions.push(like(costCenters.name, `%${search}%`));
  if (isActive !== undefined) conditions.push(eq(costCenters.isActive, isActive !== 'false'));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(costCenters).where(where).orderBy(costCenters.code);
};

export const findById = async (id) => {
  const [cc] = await db.select().from(costCenters).where(eq(costCenters.id, parseInt(id))).limit(1);
  if (!cc) throw createError('Centro de costo no encontrado', 404);
  return cc;
};

export const create = async (data) => {
  const [cc] = await db.insert(costCenters).values({
    code: data.code.toUpperCase(),
    name: data.name,
    description: data.description || null,
    isActive: true,
  }).returning();
  return cc;
};

export const update = async (id, data) => {
  const existing = await findById(id);
  const [cc] = await db.update(costCenters).set({
    code: data.code ? data.code.toUpperCase() : existing.code,
    name: data.name ?? existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(costCenters.id, parseInt(id))).returning();
  return cc;
};

export const toggleActive = async (id) => {
  const existing = await findById(id);
  const [cc] = await db.update(costCenters).set({
    isActive: !existing.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(costCenters.id, parseInt(id))).returning();
  return cc;
};
