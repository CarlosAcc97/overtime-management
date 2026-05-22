import api from './api.js';

/**
 * Descarga el Excel directamente disparando el link en el browser.
 * Params: { dateFrom, dateTo, status, userId }
 */
export const downloadExcel = (params = {}) => {
  const token = localStorage.getItem('accessToken');
  const query = new URLSearchParams();
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo)   query.set('dateTo',   params.dateTo);
  if (params.status)   query.set('status',   params.status);
  if (params.userId)   query.set('userId',   params.userId);

  // Construir URL con token en header no es posible via window.location,
  // así que usamos un <a> con Blob desde axios
  return api.get('/reports/excel', {
    params,
    responseType: 'blob',
    headers: { Authorization: `Bearer ${token}` },
  });
};

/**
 * Resumen por empleado en JSON (para tabla + PDF print).
 */
export const getSummary = async (params = {}) => {
  const { data } = await api.get('/reports/summary', { params });
  return data.data;
};

/**
 * Detalle diario de un funcionario (para modal calendario).
 * @param {number} userId
 * @param {object} filters - { dateFrom?, dateTo? }
 */
export const getEmployeeDetail = async (userId, filters = {}) => {
  const params = { userId };
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo)   params.dateTo   = filters.dateTo;
  const { data } = await api.get('/reports/employee-detail', { params });
  return data.data;
};

/**
 * Lista de departamentos activos (para selector de filtros).
 */
export const getDepartments = async () => {
  const { data } = await api.get('/reports/departments');
  return data.data.departments;
};
