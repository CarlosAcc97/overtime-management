/**
 * Respuesta de éxito estandarizada
 */
export const ok = (res, data, message = 'OK', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

/**
 * Respuesta de creación
 */
export const created = (res, data, message = 'Recurso creado correctamente') => {
  return res.status(201).json({ success: true, message, data });
};

/**
 * Respuesta paginada
 */
export const paginated = (res, data, pagination) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
};

/**
 * Error de cliente (400-499)
 */
export const clientError = (res, message, statusCode = 400, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

/**
 * Error de servidor (500+)
 */
export const serverError = (res, message = 'Error interno del servidor') => {
  return res.status(500).json({ success: false, message });
};
