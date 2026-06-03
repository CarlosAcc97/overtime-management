import { db } from '../../config/database.js';
import { overtimeRecords, overtimeTypes, users, costCenters, alertLogs, approvals } from '../../db/schema.js';
import { eq, and, or, gte, lte, ne, notInArray, inArray, desc, sql } from 'drizzle-orm';
import { createError } from '../../middleware/errorHandler.js';
import { calcHours, daysFromToday, timesOverlap } from '../../utils/dateHelpers.js';
import { calculateAlertLevel, saveAlertLog, getConfigValue } from '../../services/alert.service.js';
import { STATUS, ALERT_LEVELS, ROLES } from '../../config/constants.js';
import { logAudit } from '../../middleware/auditLogger.js';
import { notifyRetained } from '../../services/notification.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = [STATUS.PENDIENTE, STATUS.APROBADO, STATUS.ACLARACION_SOLICITADA, STATUS.RETENIDO];

/**
 * Obtiene el factor de cálculo desde la tabla overtime_types por código
 */
const getFactorByOvertimeType = async (code) => {
  const [row] = await db
    .select({ factor: overtimeTypes.factor })
    .from(overtimeTypes)
    .where(and(eq(overtimeTypes.code, code), eq(overtimeTypes.isActive, true)))
    .limit(1);
  if (!row) throw createError(`Tipo de hora extra no válido o inactivo: "${code}"`, 400);
  return row.factor;
};

/**
 * Enriquece un registro con datos del funcionario y centro de costo
 */
const enrichRecord = async (record) => {
  const [user] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, employeeId: users.employeeId })
    .from(users).where(eq(users.id, record.userId)).limit(1);
  const [cc] = record.costCenterId
    ? await db.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.id, record.costCenterId)).limit(1)
    : [null];
  return { ...record, user: user || null, costCenter: cc || null };
};

// ─── Validar solapamiento de horario ─────────────────────────────────────────
const checkTimeOverlap = async (userId, date, startTime, endTime, excludeId = null) => {
  const conditions = [
    eq(overtimeRecords.userId, userId),
    eq(overtimeRecords.date, date),
    notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]),
  ];
  if (excludeId) conditions.push(ne(overtimeRecords.id, excludeId));

  const existing = await db.select({
    id: overtimeRecords.id,
    startTime: overtimeRecords.startTime,
    endTime: overtimeRecords.endTime,
    status: overtimeRecords.status,
  }).from(overtimeRecords).where(and(...conditions));

  return existing.find(r => timesOverlap(r.startTime, r.endTime, startTime, endTime)) || null;
};

// ─── Operaciones CRUD ─────────────────────────────────────────────────────────
export const findAll = async ({ userId, role, page = 1, limit = 20, status, dateFrom, dateTo } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (role === ROLES.FUNCIONARIO) {
    conditions.push(eq(overtimeRecords.userId, userId));
  } else if (role === ROLES.JEFATURA) {
    // Jefatura ve a su equipo directo
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, userId));
    const teamIds = [userId, ...team.map(u => u.id)];
    const orConditions = teamIds.map(id => eq(overtimeRecords.userId, id));
    if (orConditions.length) conditions.push(or(...orConditions));
  }
  // Administrador ve todos (sin filtro de usuario)

  if (status) conditions.push(eq(overtimeRecords.status, status));
  if (dateFrom) conditions.push(gte(overtimeRecords.date, dateFrom));
  if (dateTo) conditions.push(lte(overtimeRecords.date, dateTo));

  const where = conditions.length ? and(...conditions) : undefined;

  // Consultas secuenciales — libsql/Turso no soporta concurrencia (no Promise.all)
  const rows = await db.select().from(overtimeRecords).where(where)
    .orderBy(desc(overtimeRecords.date), desc(overtimeRecords.createdAt))
    .limit(limit).offset(offset);
  const countResult = await db.select({ count: sql`count(*)` }).from(overtimeRecords).where(where);

  const enriched = [];
  for (const row of rows) {
    enriched.push(await enrichRecord(row));
  }
  return { data: enriched, total: Number(countResult[0]?.count ?? 0), page, limit };
};

export const findById = async (id) => {
  const [record] = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(id))).limit(1);
  if (!record) throw createError('Registro no encontrado', 404);
  return enrichRecord(record);
};

export const checkAccess = (record, requester) => {
  if (requester.role === ROLES.ADMINISTRADOR) return true;
  if (requester.role === ROLES.JEFATURA) return true; // jefatura ve registros de su equipo (validado en findAll)
  if (requester.role === ROLES.FUNCIONARIO && record.userId !== requester.id)
    throw createError('Sin acceso a este registro', 403);
};

/**
 * Crear registro de horas extras.
 * Solo administrador. Selecciona el funcionario (userId en body).
 */
export const create = async (data, requester, ip) => {
  const { userId, date, startTime, endTime, overtimeType, costCenterId } = data;

  // ── Verificar que el funcionario existe y está activo ──
  const [employee] = await db.select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!employee || !employee.isActive) throw createError('Funcionario no encontrado o inactivo', 404);

  // ── Regla: sin fechas futuras ──
  const daysAgo = daysFromToday(date);
  if (daysAgo < 0) throw createError('No se puede registrar horas extras en fechas futuras', 400);

  // ── Regla: máx 30 días atrás ──
  if (daysAgo > 30) throw createError('Solo se pueden registrar horas de los últimos 30 días', 400);

  // ── Calcular horas ──
  const hoursCalculated = calcHours(startTime, endTime);
  if (hoursCalculated <= 0) throw createError('La hora de término debe ser posterior a la de inicio', 400);

  // ── Factor según tipo de hora extra ──
  const factor = await getFactorByOvertimeType(overtimeType);

  // ── Verificar solapamiento (por el funcionario, no el admin) ──
  const overlap = await checkTimeOverlap(userId, date, startTime, endTime);
  if (overlap) {
    throw createError(
      `Ya existe un registro entre ${overlap.startTime} y ${overlap.endTime} en esa fecha para este funcionario. Los horarios no pueden solaparse.`,
      409
    );
  }

  // ── Calcular nivel de alerta para el funcionario ──
  const alertResult = await calculateAlertLevel(userId, date, hoursCalculated);
  const { alertLevel, requiresDoubleValidation, weeklyHours, monthlyHours } = alertResult;

  // ── Determinar estado inicial ──
  // Si el registro es CRÍTICO → RETENIDO (límite mensual superado)
  // Si las horas son menores al mínimo configurado → APROBADO automáticamente
  // De lo contrario → PENDIENTE (requiere aprobación de jefatura)
  const minMinutes = await getConfigValue('min_minutes_for_approval', 15);
  const minutesCalculated = Math.round(hoursCalculated * 60);
  const isAutoApproved = alertLevel !== ALERT_LEVELS.CRITICA && minutesCalculated < minMinutes;
  const status = alertLevel === ALERT_LEVELS.CRITICA
    ? STATUS.RETENIDO
    : isAutoApproved
      ? STATUS.APROBADO
      : STATUS.PENDIENTE;

  const [record] = await db.insert(overtimeRecords).values({
    userId,
    createdById: requester.id,
    date,
    startTime,
    endTime,
    hoursCalculated,
    overtimeType,
    factor,
    costCenterId,
    // activityDescription y excessJustification: los completa la jefatura al aprobar
    status,
    alertLevel,
    requiresDoubleValidation,
  }).returning();

  // ── Guardar log de alerta ──
  if (alertLevel > ALERT_LEVELS.NORMAL) {
    await saveAlertLog({
      overtimeRecordId: record.id,
      userId,
      alertLevel,
      hoursDay: hoursCalculated,
      weeklyAccumulated: weeklyHours,
      monthlyAccumulated: monthlyHours,
      justification: excessJustification,
    });
  }

  // ── Notificar si RETENIDO ──
  if (status === STATUS.RETENIDO) {
    const [adminUser] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, ROLES.ADMINISTRADOR), eq(users.isActive, true))).limit(1);
    if (adminUser) await notifyRetained({ record, adminId: adminUser.id }).catch(() => {});
  }

  await logAudit({
    userId: requester.id,
    action: 'overtime.create',
    entityType: 'overtime_record',
    entityId: record.id,
    newValues: { userId, date, hoursCalculated, overtimeType, factor, status, alertLevel },
    req: { ip },
  });

  return enrichRecord(record);
};

/**
 * Actualizar registro (solo admin, solo en estados editables)
 */
export const update = async (id, data, requester, ip) => {
  const existing = await findById(id);

  if (existing.status !== STATUS.PENDIENTE && existing.status !== STATUS.ACLARACION_SOLICITADA) {
    throw createError(`Solo se pueden editar registros en estado PENDIENTE o ACLARACIÓN_SOLICITADA. Estado actual: ${existing.status}`, 409);
  }

  const { date, startTime, endTime, overtimeType, costCenterId } = data;

  // Al actualizar, el funcionario (userId) no cambia
  const targetUserId = existing.userId;

  const hoursCalculated = calcHours(startTime, endTime);
  if (hoursCalculated <= 0) throw createError('La hora de término debe ser posterior a la de inicio', 400);

  const daysAgo = daysFromToday(date);
  if (daysAgo < 0) throw createError('No se puede registrar horas extras en fechas futuras', 400);

  const overlap = await checkTimeOverlap(targetUserId, date, startTime, endTime, parseInt(id));
  if (overlap) throw createError(`Solapamiento de horario con registro existente (${overlap.startTime}–${overlap.endTime})`, 409);

  const factor = await getFactorByOvertimeType(overtimeType);
  const alertResult = await calculateAlertLevel(targetUserId, date, hoursCalculated, parseInt(id));
  const { alertLevel, requiresDoubleValidation, weeklyHours, monthlyHours } = alertResult;

  const newStatus = alertLevel === ALERT_LEVELS.CRITICA ? STATUS.RETENIDO : STATUS.PENDIENTE;

  await db.update(overtimeRecords).set({
    date, startTime, endTime, hoursCalculated, overtimeType, factor, costCenterId,
    // Preservar activityDescription y excessJustification existentes al editar datos base
    activityDescription: existing.activityDescription,
    excessJustification: existing.excessJustification,
    status: newStatus, alertLevel, requiresDoubleValidation,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeRecords.id, parseInt(id)));

  if (alertLevel > ALERT_LEVELS.NORMAL) {
    await saveAlertLog({ overtimeRecordId: parseInt(id), userId: targetUserId, alertLevel, hoursDay: hoursCalculated, weeklyAccumulated: weeklyHours, monthlyAccumulated: monthlyHours });
  }

  await logAudit({ userId: requester.id, action: 'overtime.update', entityType: 'overtime_record', entityId: parseInt(id), oldValues: { status: existing.status }, newValues: { status: newStatus, alertLevel }, req: { ip } });
  return findById(id);
};

/**
 * Anular registro
 * - Funcionario: puede anular sus propios PENDIENTE
 * - Jefatura/Admin: pueden anular cualquier estado no terminal
 */
export const cancel = async (id, cancellationReason, requester, ip) => {
  const existing = await findById(id);
  checkAccess(existing, requester);

  if ([STATUS.ANULADO, STATUS.RECHAZADO].includes(existing.status)) {
    throw createError(`El registro ya está ${existing.status.toLowerCase()}`, 409);
  }
  if (existing.status === STATUS.APROBADO && requester.role === ROLES.FUNCIONARIO) {
    throw createError('Un registro aprobado solo puede ser anulado por la jefatura o administrador', 403);
  }
  if (requester.role === ROLES.FUNCIONARIO && existing.userId !== requester.id) {
    throw createError('No tienes acceso a este registro', 403);
  }

  await db.update(overtimeRecords).set({
    status: STATUS.ANULADO,
    cancellationReason,
    cancelledBy: requester.id,
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeRecords.id, parseInt(id)));

  await logAudit({ userId: requester.id, action: 'overtime.cancel', entityType: 'overtime_record', entityId: parseInt(id), oldValues: { status: existing.status }, newValues: { status: STATUS.ANULADO, cancellationReason }, req: { ip } });
  return findById(id);
};

/**
 * Verifica límites de alerta para un funcionario.
 * Usado por el frontend en tiempo real mientras se llena el formulario.
 */
export const checkLimits = async (userId, date, hours, excludeId = null) => {
  return calculateAlertLevel(userId, date, hours, excludeId);
};

/**
 * Elimina permanentemente un registro individual (solo si está ANULADO).
 * Solo puede ejecutarlo un administrador.
 */
export const deleteRecord = async (id, requesterId, ip) => {
  const [record] = await db.select().from(overtimeRecords)
    .where(eq(overtimeRecords.id, parseInt(id))).limit(1);

  if (!record) throw createError('Registro no encontrado', 404);
  if (record.status !== STATUS.ANULADO) {
    throw createError('Solo se pueden eliminar permanentemente registros con estado ANULADO', 409);
  }

  await db.delete(approvals).where(eq(approvals.overtimeRecordId, record.id));
  await db.delete(alertLogs).where(eq(alertLogs.overtimeRecordId, record.id));
  await db.delete(overtimeRecords).where(eq(overtimeRecords.id, record.id));

  await logAudit({
    userId: requesterId,
    action: 'overtime.delete_permanent',
    entityType: 'overtime_record',
    entityId: record.id,
    oldValues: { status: record.status, date: record.date, userId: record.userId },
    newValues: { deleted: true },
    req: { ip },
  });

  return { deleted: true, id: record.id };
};

/**
 * Cuenta los registros en estado ANULADO.
 */
export const countCancelled = async () => {
  const [result] = await db
    .select({ count: sql`count(*)` })
    .from(overtimeRecords)
    .where(eq(overtimeRecords.status, STATUS.ANULADO));
  return { count: Number(result?.count ?? 0) };
};

/**
 * Elimina permanentemente todos los registros ANULADO y sus datos relacionados.
 * Solo puede ejecutarlo un administrador.
 */
export const purgeCancelled = async (requesterId, ip) => {
  // Obtener IDs de los registros a eliminar
  const toDelete = await db
    .select({ id: overtimeRecords.id })
    .from(overtimeRecords)
    .where(eq(overtimeRecords.status, STATUS.ANULADO));

  const ids = toDelete.map(r => r.id);
  if (ids.length === 0) return { deleted: 0 };

  // Eliminar tablas relacionadas primero (respeto de FK)
  await db.delete(approvals).where(inArray(approvals.overtimeRecordId, ids));
  await db.delete(alertLogs).where(inArray(alertLogs.overtimeRecordId, ids));
  await db.delete(overtimeRecords).where(inArray(overtimeRecords.id, ids));

  await logAudit({
    userId: requesterId,
    action: 'overtime.purge_cancelled',
    entityType: 'overtime_record',
    entityId: null,
    oldValues: { count: ids.length, ids },
    newValues: { status: 'DELETED_PERMANENTLY' },
    req: { ip },
  });

  return { deleted: ids.length };
};

/**
 * Encuentra registros duplicados: mismo funcionario, misma fecha, mismo horario,
 * estados activos (excluye RECHAZADO y ANULADO).
 * Retorna grupos con todos los registros duplicados y sus datos.
 */
export const findDuplicates = async () => {
  // Paso 1: encontrar grupos con más de un registro idéntico
  const groups = await db.select({
    userId:    overtimeRecords.userId,
    date:      overtimeRecords.date,
    startTime: overtimeRecords.startTime,
    endTime:   overtimeRecords.endTime,
    count:     sql`count(*) as cnt`,
  }).from(overtimeRecords)
    .where(notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]))
    .groupBy(overtimeRecords.userId, overtimeRecords.date, overtimeRecords.startTime, overtimeRecords.endTime)
    .having(sql`count(*) > 1`);

  if (groups.length === 0) return [];

  // Paso 2: para cada grupo, obtener los registros concretos con nombre del funcionario
  const result = [];
  for (const g of groups) {
    const records = await db.select({
      id:              overtimeRecords.id,
      date:            overtimeRecords.date,
      startTime:       overtimeRecords.startTime,
      endTime:         overtimeRecords.endTime,
      hoursCalculated: overtimeRecords.hoursCalculated,
      overtimeType:    overtimeRecords.overtimeType,
      status:          overtimeRecords.status,
      createdAt:       overtimeRecords.createdAt,
    }).from(overtimeRecords)
      .where(and(
        eq(overtimeRecords.userId, g.userId),
        eq(overtimeRecords.date, g.date),
        eq(overtimeRecords.startTime, g.startTime),
        eq(overtimeRecords.endTime, g.endTime),
        notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]),
      ))
      .orderBy(overtimeRecords.createdAt);

    const [user] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName, employeeId: users.employeeId,
    }).from(users).where(eq(users.id, g.userId)).limit(1);

    result.push({
      userId:    g.userId,
      userName:  user ? `${user.firstName} ${user.lastName}` : `ID ${g.userId}`,
      employeeId: user?.employeeId,
      date:      g.date,
      startTime: g.startTime,
      endTime:   g.endTime,
      count:     Number(g.count),
      records,
    });
  }

  return result;
};

export const getStats = async (userId) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [pendingCount] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
    .where(and(eq(overtimeRecords.userId, userId), eq(overtimeRecords.status, STATUS.PENDIENTE)));
  const [monthHours] = await db.select({ total: sql`COALESCE(SUM(hours_calculated), 0)` }).from(overtimeRecords)
    .where(and(eq(overtimeRecords.userId, userId), gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO])));

  return {
    pendingCount: Number(pendingCount?.count ?? 0),
    monthHours: parseFloat(monthHours?.total ?? 0),
  };
};
