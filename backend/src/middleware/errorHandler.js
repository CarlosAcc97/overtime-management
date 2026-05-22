import { ZodError } from 'zod';

export const errorHandler = (err, req, res, next) => {
  // Errores de validación Zod
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(422).json({
      success: false,
      message: 'Error de validación',
      errors,
    });
  }

  // Errores de restricción de SQLite (unique, FK, etc.)
  if (err.message?.includes('UNIQUE constraint failed')) {
    const field = err.message.split('.').pop();
    return res.status(409).json({
      success: false,
      message: `Ya existe un registro con ese ${field}`,
    });
  }

  if (err.message?.includes('FOREIGN KEY constraint failed')) {
    return res.status(409).json({
      success: false,
      message: 'Referencia a registro inexistente',
    });
  }

  // Error genérico
  console.error('[ERROR]', err);
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * Helper para lanzar errores HTTP desde servicios/controladores
 */
export const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
