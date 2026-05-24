import { db } from '../config/database.js';
import { overtimeRecords, alertLogs, systemConfig, users } from '../db/schema.js';
import { eq, and, gte, lte, ne, sql } from 'drizzle-orm';
import { ALERT_LEVELS, STATUS } from '../config/constants.js';
import { getWeekRange, getMonthRange } from '../utils/dateHelpers.js';

/**
 * Obtiene el valor de configuración del sistema como número
 */
export const getConfigValue = async (key, defaultValue) => {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return row ? parseFloat(row.value) : defaultValue;
};

/**
 * Calcula las horas acumuladas de un funcionario en la semana ISO
 */
export const getWeeklyHours = async (userId, dateStr, excludeId = null) => {
  const { start, end } = getWeekRange(dateStr);
  const conditions = [
    eq(overtimeRecords.userId, userId),
    gte(overtimeRecords.date, start),
    lte(overtimeRecords.date, end),
    ne(overtimeRecords.status, STATUS.RECHAZADO),
    ne(overtimeRecords.status, STATUS.ANULADO),
  ];
  if (excludeId) conditions.push(ne(overtimeRecords.id, excludeId));

  const rows = await db.select({ h: overtimeRecords.hoursCalculated })
    .from(overtimeRecords)
    .where(and(...conditions));

  return rows.reduce((sum, r) => sum + (r.h || 0), 0);
};

/**
 * Calcula las horas acumuladas de un funcionario en el mes
 */
export const getMonthlyHours = async (userId, dateStr, excludeId = null) => {
  const { start, end } = getMonthRange(dateStr);
  const conditions = [
    eq(overtimeRecords.userId, userId),
    gte(overtimeRecords.date, start),
    lte(overtimeRecords.date, end),
    ne(overtimeRecords.status, STATUS.RECHAZADO),
    ne(overtimeRecords.status, STATUS.ANULADO),
  ];
  if (excludeId) conditions.push(ne(overtimeRecords.id, excludeId));

  const rows = await db.select({ h: overtimeRecords.hoursCalculated })
    .from(overtimeRecords)
    .where(and(...conditions));

  return rows.reduce((sum, r) => sum + (r.h || 0), 0);
};

/**
 * Calcula el nivel de alerta para un registro nuevo/editado.
 *
 * NIVEL 0: normal
 * NIVEL 1: horas del día > max_daily_hours_soft (amarillo)
 * NIVEL 2: horas del día > max_daily_hours_warning O acumulado semanal > max_weekly (rojo)
 * NIVEL 3: acumulado mensual + estas horas > max_monthly → RETENIDO
 *
 * @returns { alertLevel, requiresDoubleValidation, weeklyHours, monthlyHours }
 */
export const calculateAlertLevel = async (userId, dateStr, hoursCalculated, excludeId = null) => {
  const [maxDailySoft, maxDailyWarning, maxWeekly, maxMonthly] = await Promise.all([
    getConfigValue('max_daily_hours_soft', 2),
    getConfigValue('max_daily_hours_warning', 3),
    getConfigValue('max_weekly_hours', 12),
    getConfigValue('max_monthly_hours', 40),
  ]);

  const weeklyHours = await getWeeklyHours(userId, dateStr, excludeId);
  const monthlyHours = await getMonthlyHours(userId, dateStr, excludeId);
  const newWeekly = weeklyHours + hoursCalculated;
  const newMonthly = monthlyHours + hoursCalculated;

  let alertLevel = ALERT_LEVELS.NORMAL;

  if (newMonthly > maxMonthly) {
    alertLevel = ALERT_LEVELS.CRITICA;
  } else if (hoursCalculated > maxDailyWarning || newWeekly > maxWeekly) {
    alertLevel = ALERT_LEVELS.ADVERTENCIA;
  } else if (hoursCalculated > maxDailySoft) {
    alertLevel = ALERT_LEVELS.INFORMATIVA;
  }

  return {
    alertLevel,
    requiresDoubleValidation: false,
    weeklyHours: newWeekly,
    monthlyHours: newMonthly,
    thresholds: { maxDailySoft, maxDailyWarning, maxWeekly, maxMonthly },
  };
};

/**
 * Persiste el log de alerta en la base de datos
 */
export const saveAlertLog = async ({ overtimeRecordId, userId, alertLevel, hoursDay, weeklyAccumulated, monthlyAccumulated, justification }) => {
  if (alertLevel === ALERT_LEVELS.NORMAL) return;

  await db.insert(alertLogs).values({
    overtimeRecordId,
    userId,
    alertLevel,
    hoursDay,
    weeklyAccumulated,
    monthlyAccumulated,
    justification: justification || null,
  });
};
