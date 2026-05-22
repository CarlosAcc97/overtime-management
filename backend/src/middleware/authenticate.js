import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { db } from '../config/database.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token de acceso requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, authConfig.accessSecret);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        supervisorId: users.supervisorId,
        departmentId: users.departmentId,
        costCenterId: users.costCenterId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Usuario inactivo o no encontrado' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};
