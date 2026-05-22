import { ROLES } from '../config/constants.js';

/**
 * Middleware de autorización por roles.
 * Uso: authorize('administrador') o authorize(['jefatura', 'administrador'])
 */
export const authorize = (...allowedRoles) => {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción',
      });
    }
    next();
  };
};

/**
 * Solo administradores
 */
export const onlyAdmin = authorize(ROLES.ADMINISTRADOR);

/**
 * Jefatura o administrador
 */
export const onlyJefaturaOrAdmin = authorize(ROLES.JEFATURA, ROLES.ADMINISTRADOR);

/**
 * Cualquier usuario autenticado
 */
export const anyRole = authorize(ROLES.FUNCIONARIO, ROLES.JEFATURA, ROLES.ADMINISTRADOR);
