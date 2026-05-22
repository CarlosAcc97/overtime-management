/**
 * Formatea un número como pesos chilenos (CLP)
 */
export const formatCLP = (amount) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount ?? 0);

/**
 * Formatea horas decimales a texto legible (ej: 1.5 → "1h 30m")
 */
export const formatHours = (decimal) => {
  if (decimal == null) return '—';
  const total = Math.round(decimal * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/**
 * Formatea horas como decimal con 2 decimales (ej: 1.5 → "1,50 hrs")
 */
export const formatHoursDecimal = (decimal) => {
  if (decimal == null) return '—';
  return `${Number(decimal).toFixed(2).replace('.', ',')} hrs`;
};

/**
 * Convierte "HH:MM" a texto legible
 */
export const formatTime = (timeStr) => timeStr || '—';

/**
 * Etiqueta del rol en español
 */
export const formatRole = (role) => {
  const labels = {
    funcionario: 'Funcionario',
    jefatura: 'Jefatura',
    administrador: 'Administrador',
  };
  return labels[role] || role;
};

/**
 * Etiqueta del tipo de hora extra por código
 * Fallback para cuando no tenemos el nombre completo del tipo
 */
export const formatOvertimeType = (code) => {
  const labels = {
    extra: 'Horas extras',
    super_extra: 'Horas super extras',
    especial: 'Horas especiales',
  };
  return labels[code] || code || '—';
};

/**
 * Etiqueta del estado de registro
 */
export const formatStatus = (status) => {
  const labels = {
    PENDIENTE: 'Pendiente',
    APROBADO: 'Aprobado',
    RECHAZADO: 'Rechazado',
    ACLARACION_SOLICITADA: 'Aclaración solicitada',
    ANULADO: 'Anulado',
    RETENIDO: 'Retenido',
  };
  return labels[status] || status;
};

/**
 * Nivel de alerta en texto
 */
export const formatAlertLevel = (level) => {
  const labels = { 0: 'Normal', 1: 'Informativa', 2: 'Advertencia', 3: 'Crítica' };
  return labels[level] ?? 'Normal';
};

/**
 * Iniciales del nombre completo
 */
export const getInitials = (firstName, lastName) => {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return `${f}${l}`;
};
