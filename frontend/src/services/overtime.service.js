import api from './api.js';

export const getOvertimeRecords = async (params = {}) => {
  const { data } = await api.get('/overtime', { params });
  return data;
};

export const getOvertimeById = async (id) => {
  const { data } = await api.get(`/overtime/${id}`);
  return data.data.record;
};

export const createOvertime = async (payload) => {
  const { data } = await api.post('/overtime', payload);
  return data.data.record;
};

export const updateOvertime = async (id, payload) => {
  const { data } = await api.put(`/overtime/${id}`, payload);
  return data.data.record;
};

export const cancelOvertime = async (id, cancellationReason) => {
  const { data } = await api.patch(`/overtime/${id}/cancel`, { cancellationReason });
  return data.data.record;
};

/**
 * Verifica límites de alerta para un funcionario dado.
 * @param {object} params - { userId, date, hours, excludeId? }
 */
export const checkLimits = async (params) => {
  const { data } = await api.get('/overtime/check-limits', { params });
  return data.data;
};

export const getMyStats = async () => {
  const { data } = await api.get('/overtime/my-stats');
  return data.data;
};

// ─── Tipos de hora extra ──────────────────────────────────────────────────────

export const getOvertimeTypes = async (params = {}) => {
  const { data } = await api.get('/overtime-types', { params });
  return data.data.overtimeTypes;
};

export const createOvertimeType = async (payload) => {
  const { data } = await api.post('/overtime-types', payload);
  return data.data.overtimeType;
};

export const updateOvertimeType = async (id, payload) => {
  const { data } = await api.put(`/overtime-types/${id}`, payload);
  return data.data.overtimeType;
};

export const toggleOvertimeType = async (id) => {
  const { data } = await api.patch(`/overtime-types/${id}/toggle`);
  return data.data.overtimeType;
};

export const deleteOvertimeRecord = async (id) => {
  const { data } = await api.delete(`/overtime/${id}`);
  return data.data;
};

// ─── Mantenimiento de datos ───────────────────────────────────────────────────

export const getCancelledCount = async () => {
  const { data } = await api.get('/overtime/cancelled-count');
  return data.data; // { count }
};

export const purgeCancelledRecords = async () => {
  const { data } = await api.delete('/overtime/purge-cancelled');
  return data.data; // { deleted }
};

// ─── Carga masiva ─────────────────────────────────────────────────────────────

/** Descarga la plantilla Excel de carga masiva como blob */
export const downloadBulkTemplate = async () => {
  const response = await api.get('/overtime/template', { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `plantilla-horas-extras-${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Sube un archivo Excel con registros de horas extras */
export const uploadBulkFile = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/overtime/bulk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { success, message, data: { created, skipped, total, results } }
};
