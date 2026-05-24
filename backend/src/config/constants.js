// ─── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = {
  FUNCIONARIO: 'funcionario',
  JEFATURA: 'jefatura',
  ADMINISTRADOR: 'administrador',
};

// ─── Estados de registros ─────────────────────────────────────────────────────
export const STATUS = {
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  ACLARACION_SOLICITADA: 'ACLARACION_SOLICITADA',
  ANULADO: 'ANULADO',
  RETENIDO: 'RETENIDO',
};

// ─── Tipos de hora extra (codes) ─────────────────────────────────────────────
// Los factores y nombres viven en la tabla overtime_types (módulo mantenedor)
export const OVERTIME_TYPE_CODES = {
  EXTRA: 'extra',           // Horas extras (1.5x) — días hábiles
  SUPER_EXTRA: 'super_extra', // Horas super extras (2.0x) — sábados
  ESPECIAL: 'especial',     // Horas especiales (2.5x) — domingos/festivos/condiciones especiales
};

// ─── Niveles de alerta ────────────────────────────────────────────────────────
export const ALERT_LEVELS = {
  NORMAL: 0,
  INFORMATIVA: 1,   // amarillo: supera tope diario suave
  ADVERTENCIA: 2,   // rojo: supera tope diario fuerte o límite semanal
  CRITICA: 3,       // bloqueante: supera límite mensual → RETENIDO
};

// ─── Acciones de aprobación ───────────────────────────────────────────────────
export const APPROVAL_ACTIONS = {
  APROBAR: 'APROBAR',
  RECHAZAR: 'RECHAZAR',
  SOLICITAR_ACLARACION: 'SOLICITAR_ACLARACION',
};

// ─── Tipos de notificación ────────────────────────────────────────────────────
export const NOTIFICATION_TYPES = {
  APROBACION: 'APROBACION',
  RECHAZO: 'RECHAZO',
  ACLARACION: 'ACLARACION',
  ALERTA: 'ALERTA',
  RETENIDO: 'RETENIDO',
};

// ─── Configuración por defecto del sistema ────────────────────────────────────
// Los factores ya NO están aquí — viven en la tabla overtime_types
export const DEFAULT_CONFIG = {
  max_daily_hours_soft: '2',          // tope diario nivel 1 (alerta amarilla)
  max_daily_hours_warning: '3',       // tope diario nivel 2 (alerta roja)
  max_weekly_hours: '12',             // tope semanal (Art. 31 CT Chile)
  max_monthly_hours: '40',            // tope mensual → estado RETENIDO
  default_hourly_rate: '5000',        // valor hora base en CLP (para proyecciones)
  pending_alert_hours: '48',          // alerta si pendiente > N horas
  min_minutes_for_approval: '15',     // mínimo de minutos para requerir aprobación de jefatura
};

// ─── Zona horaria del sistema ─────────────────────────────────────────────────
export const TIMEZONE = 'America/Santiago';
