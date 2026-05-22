import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { TIMEZONE } from '../config/constants.js';

/**
 * Fecha/hora actual en zona horaria de Santiago
 */
export const nowInSantiago = () => toZonedTime(new Date(), TIMEZONE);

/**
 * Formatea una fecha en zona horaria Santiago
 */
export const formatSantiago = (date, fmt = 'dd/MM/yyyy HH:mm') =>
  formatInTimeZone(date, TIMEZONE, fmt, { locale: es });

/**
 * Calcula horas entre dos strings de tiempo "HH:MM"
 * Retorna decimal (ej: 1.5 para 1h 30min)
 */
export const calcHours = (startTime, endTime) => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return 0;
  return Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
};

/**
 * Rango ISO de la semana (lunes a domingo) de una fecha dada
 */
export const getWeekRange = (dateStr) => {
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return {
    start: formatInTimeZone(start, TIMEZONE, 'yyyy-MM-dd'),
    end: formatInTimeZone(end, TIMEZONE, 'yyyy-MM-dd'),
  };
};

/**
 * Rango ISO del mes de una fecha dada
 */
export const getMonthRange = (dateStr) => {
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return {
    start: formatInTimeZone(start, TIMEZONE, 'yyyy-MM-dd'),
    end: formatInTimeZone(end, TIMEZONE, 'yyyy-MM-dd'),
  };
};

/**
 * Verifica si dos rangos de tiempo se superponen
 */
export const timesOverlap = (start1, end1, start2, end2) => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const s1 = toMin(start1), e1 = toMin(end1);
  const s2 = toMin(start2), e2 = toMin(end2);
  return s1 < e2 && s2 < e1;
};

/**
 * Número de días entre fecha y hoy (en Santiago)
 * Positivo = fecha pasada, Negativo = fecha futura
 */
export const daysFromToday = (dateStr) => {
  const today = nowInSantiago();
  const target = parseISO(dateStr);
  const todayStr = formatInTimeZone(today, TIMEZONE, 'yyyy-MM-dd');
  const todayDate = parseISO(todayStr);
  return Math.round((todayDate - target) / (1000 * 60 * 60 * 24));
};
