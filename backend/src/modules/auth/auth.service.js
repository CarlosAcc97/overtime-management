import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { authConfig } from '../../config/auth.js';
import { createError } from '../../middleware/errorHandler.js';

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
};

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { sub: userId, role },
    authConfig.accessSecret,
    { expiresIn: authConfig.accessExpiresIn }
  );
  const refreshToken = jwt.sign(
    { sub: userId },
    authConfig.refreshSecret,
    { expiresIn: authConfig.refreshExpiresIn }
  );
  return { accessToken, refreshToken };
};

export const login = async (email, password) => {
  const [user] = await db
    .select({ ...USER_SELECT, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) throw createError('Credenciales inválidas', 401);
  if (!user.isActive) throw createError('Tu cuenta está inactiva. Contacta al administrador.', 403);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw createError('Credenciales inválidas', 401);

  const { accessToken, refreshToken } = generateTokens(user.id, user.role);

  // Persistir refresh token en DB (permite revocación)
  await db.update(users).set({ refreshToken }).where(eq(users.id, user.id));

  const { passwordHash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
};

export const refreshTokens = async (token) => {
  if (!token) throw createError('Refresh token requerido', 401);

  let payload;
  try {
    payload = jwt.verify(token, authConfig.refreshSecret);
  } catch {
    throw createError('Refresh token inválido o expirado', 401);
  }

  const [user] = await db
    .select({ ...USER_SELECT, refreshToken: users.refreshToken })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user || user.refreshToken !== token) {
    throw createError('Refresh token revocado o inválido', 401);
  }
  if (!user.isActive) throw createError('Usuario inactivo', 403);

  const { accessToken, refreshToken: newRefresh } = generateTokens(user.id, user.role);
  await db.update(users).set({ refreshToken: newRefresh }).where(eq(users.id, user.id));

  const { refreshToken: _rt, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken: newRefresh };
};

export const logout = async (userId) => {
  await db.update(users).set({ refreshToken: null }).where(eq(users.id, userId));
};

export const getMe = async (userId) => {
  const [user] = await db.select(USER_SELECT).from(users).where(eq(users.id, userId)).limit(1);
  return user;
};
