import { db } from '../config/database.js';
import { auditLogs } from '../db/schema.js';

/**
 * Registra una acción en el log de auditoría.
 */
export const logAudit = async ({ userId, action, entityType, entityId, oldValues, newValues, req }) => {
  try {
    await db.insert(auditLogs).values({
      userId: userId ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      oldValues: oldValues ? JSON.stringify(oldValues) : null,
      newValues: newValues ? JSON.stringify(newValues) : null,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  } catch (err) {
    // Auditoría nunca debe romper el flujo principal
    console.error('[AUDIT ERROR]', err.message);
  }
};

/**
 * Middleware express que registra automáticamente acciones de autenticación.
 * Para acciones de negocio, llamar logAudit directamente desde el servicio.
 */
export const auditMiddleware = (action, entityType) => async (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      logAudit({
        userId: req.user?.id,
        action,
        entityType,
        entityId: req.params?.id ? parseInt(req.params.id) : null,
        req,
      }).catch(() => {});
    }
  });
  next();
};
