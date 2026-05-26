import bcrypt from 'bcryptjs';
import { db } from '../../config/database.js';
import { users, departments, costCenters } from '../../db/schema.js';
import { eq, like, and, or, ne, sql } from 'drizzle-orm';
import { authConfig } from '../../config/auth.js';
import { createError } from '../../middleware/errorHandler.js';
import { ROLES } from '../../config/constants.js';

const USER_SELECT = {
  id: users.id,
  employeeId: users.employeeId,
  rut: users.rut,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  role: users.role,
  supervisorId: users.supervisorId,
  departmentId: users.departmentId,
  costCenterId: users.costCenterId,
  hourlyRate: users.hourlyRate,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export const findAll = async ({ search, role, departmentId, isActive, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`),
        like(users.email, `%${search}%`),
        like(users.employeeId, `%${search}%`),
        like(users.rut, `%${search}%`),
      )
    );
  }
  if (role) conditions.push(eq(users.role, role));
  if (departmentId) conditions.push(eq(users.departmentId, parseInt(departmentId)));
  if (isActive !== undefined) conditions.push(eq(users.isActive, isActive === 'true'));

  const where = conditions.length ? and(...conditions) : undefined;

  // Consultas secuenciales — libsql/Turso no soporta concurrencia (no Promise.all)
  const rows = await db.select(USER_SELECT).from(users).where(where).limit(limit).offset(offset).orderBy(users.lastName, users.firstName);
  const [{ count }] = await db.select({ count: sql`count(*)` }).from(users).where(where);

  // Enriquecer con nombres — consultas secuenciales (libsql no soporta concurrencia)
  const enriched = [];
  for (const u of rows) {
    const extra = {};
    if (u.departmentId) {
      const [dep] = await db.select({ name: departments.name, code: departments.code }).from(departments).where(eq(departments.id, u.departmentId)).limit(1);
      extra.department = dep || null;
    }
    if (u.costCenterId) {
      const [cc] = await db.select({ name: costCenters.name, code: costCenters.code }).from(costCenters).where(eq(costCenters.id, u.costCenterId)).limit(1);
      extra.costCenter = cc || null;
    }
    if (u.supervisorId) {
      const [sup] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, u.supervisorId)).limit(1);
      extra.supervisor = sup || null;
    }
    enriched.push({ ...u, ...extra });
  }

  return { data: enriched, total: Number(count), page, limit };
};

export const findById = async (id) => {
  const [user] = await db.select(USER_SELECT).from(users).where(eq(users.id, parseInt(id))).limit(1);
  if (!user) throw createError('Usuario no encontrado', 404);

  const extras = {};
  if (user.departmentId) {
    const [dep] = await db.select().from(departments).where(eq(departments.id, user.departmentId)).limit(1);
    extras.department = dep;
  }
  if (user.costCenterId) {
    const [cc] = await db.select().from(costCenters).where(eq(costCenters.id, user.costCenterId)).limit(1);
    extras.costCenter = cc;
  }
  if (user.supervisorId) {
    const [sup] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.id, user.supervisorId)).limit(1);
    extras.supervisor = sup;
  }

  // Subordinados directos
  const subordinates = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
    .from(users).where(and(eq(users.supervisorId, parseInt(id)), eq(users.isActive, true)));
  extras.subordinates = subordinates;

  return { ...user, ...extras };
};

export const findTeam = async (supervisorId) => {
  return db.select(USER_SELECT).from(users)
    .where(and(eq(users.supervisorId, parseInt(supervisorId)), eq(users.isActive, true)))
    .orderBy(users.lastName, users.firstName);
};

export const create = async (data) => {
  const passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds);
  const [user] = await db.insert(users).values({
    employeeId: data.employeeId || null,
    rut: data.rut || null,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase().trim(),
    passwordHash,
    role: data.role,
    supervisorId: data.supervisorId || null,
    departmentId: data.departmentId || null,
    costCenterId: data.costCenterId || null,
    hourlyRate: data.hourlyRate || 5000,
    isActive: true,
  }).returning({ id: users.id });

  return findById(user.id);
};

export const update = async (id, data) => {
  const [existing] = await db.select().from(users).where(eq(users.id, parseInt(id))).limit(1);
  if (!existing) throw createError('Usuario no encontrado', 404);

  const updateData = {
    firstName: data.firstName ?? existing.firstName,
    lastName: data.lastName ?? existing.lastName,
    email: data.email ? data.email.toLowerCase().trim() : existing.email,
    role: data.role ?? existing.role,
    supervisorId: data.supervisorId !== undefined ? (data.supervisorId || null) : existing.supervisorId,
    departmentId: data.departmentId !== undefined ? (data.departmentId || null) : existing.departmentId,
    costCenterId: data.costCenterId !== undefined ? (data.costCenterId || null) : existing.costCenterId,
    hourlyRate: data.hourlyRate !== undefined ? data.hourlyRate : existing.hourlyRate,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    rut: data.rut !== undefined ? data.rut : existing.rut,
    employeeId: data.employeeId !== undefined ? data.employeeId : existing.employeeId,
    updatedAt: new Date().toISOString(),
  };

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds);
  }

  await db.update(users).set(updateData).where(eq(users.id, parseInt(id)));
  return findById(id);
};

export const toggleActive = async (id, isActive) => {
  const [existing] = await db.select().from(users).where(eq(users.id, parseInt(id))).limit(1);
  if (!existing) throw createError('Usuario no encontrado', 404);
  await db.update(users).set({ isActive, updatedAt: new Date().toISOString() }).where(eq(users.id, parseInt(id)));
  return findById(id);
};

export const changeMyPassword = async (userId, currentPassword, newPassword) => {
  const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw createError('Usuario no encontrado', 404);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw createError('La contraseña actual es incorrecta', 400);

  const hash = await bcrypt.hash(newPassword, authConfig.bcryptRounds);
  await db.update(users).set({ passwordHash: hash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));
};

export const findSupervisors = async () => {
  return db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role })
    .from(users)
    .where(and(
      or(eq(users.role, ROLES.JEFATURA), eq(users.role, ROLES.ADMINISTRADOR)),
      eq(users.isActive, true)
    ))
    .orderBy(users.lastName, users.firstName);
};
