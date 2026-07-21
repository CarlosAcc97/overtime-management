import { db } from '../../config/database.js';
import { overtimeRecords, approvals, users, costCenters, overtimeTypes } from '../../db/schema.js';
import { eq, and, or, inArray, notInArray, desc, isNull, isNotNull, sql } from 'drizzle-orm';
import { createError } from '../../middleware/errorHandler.js';
import { STATUS, ROLES, APPROVAL_ACTIONS, ALERT_LEVELS } from '../../config/constants.js';
import { logAudit } from '../../middleware/auditLogger.js';

// ─── Enriquece un registro con relaciones ─────────────────────────────────────
const enrichRecord = async (record) => {
  const [employee] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, employeeId: users.employeeId, role: users.role })
    .from(users).where(eq(users.id, record.userId)).limit(1);

  const [cc] = record.costCenterId
    ? await db.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.id, record.costCenterId)).limit(1)
    : [null];

  const [ot] = await db
    .select({ code: overtimeTypes.code, name: overtimeTypes.name, factor: overtimeTypes.factor })
    .from(overtimeTypes).where(eq(overtimeTypes.code, record.overtimeType)).limit(1);

  // Historial de aprobaciones de este registro
  const approvalList = await db
    .select({
      id: approvals.id,
      approverId: approvals.approverId,
      approvalLevel: approvals.approvalLevel,
      action: approvals.action,
      comment: approvals.comment,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .where(eq(approvals.overtimeRecordId, record.id))
    .orderBy(approvals.createdAt);

  // Enriquecer aprobaciones con nombre del aprobador
  const enrichedApprovals = await Promise.all(approvalList.map(async (a) => {
    const [approver] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, role: users.role })
      .from(users).where(eq(users.id, a.approverId)).limit(1);
    return { ...a, approver: approver || null };
  }));

  return {
    ...record,
    user: employee || null,
    costCenter: cc || null,
    overtimeTypeInfo: ot || null,
    approvalHistory: enrichedApprovals,
  };
};

/**
 * Verifica que una jefatura puede actuar sobre un registro
 * (el funcionario debe ser su subordinado directo)
 */
const checkJefaturaCanApprove = async (record, requester) => {
  if (requester.role === ROLES.ADMINISTRADOR) return; // admin puede todo

  const [subordinate] = await db
    .select({ id: users.id, supervisorId: users.supervisorId })
    .from(users)
    .where(and(eq(users.id, record.userId), eq(users.supervisorId, requester.id)))
    .limit(1);

  if (!subordinate) {
    throw createError('No tienes permisos para gestionar este registro — el funcionario no es tu subordinado', 403);
  }
};

// ─── Bandeja: registros pendientes de acción ──────────────────────────────────
export const getPendingForApproval = async (requester, { page = 1, limit = 20, dateFrom, dateTo, search } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (requester.role === ROLES.JEFATURA) {
    // Jefatura ve registros PENDIENTE de sus subordinados directos
    // que aún no han sido aprobados en su nivel (firstApprovalBy IS NULL)
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, requester.id));
    const teamIds = team.map(u => u.id);
    if (teamIds.length === 0) return { data: [], total: 0, page, limit };

    conditions.push(
      inArray(overtimeRecords.userId, teamIds),
      inArray(overtimeRecords.status, [STATUS.PENDIENTE, STATUS.RETENIDO]),
      isNull(overtimeRecords.firstApprovalBy), // no first-approved yet
    );
  } else if (requester.role === ROLES.ADMINISTRADOR) {
    // Admin ve:
    // 1. Registros PENDIENTE sin primera aprobación (que no tienen doble validación pendiente)
    // 2. Registros PENDIENTE con primera aprobación completa (esperando 2da validación)
    // 3. Registros RETENIDO (excedieron límite mensual)
    conditions.push(
      inArray(overtimeRecords.status, [STATUS.PENDIENTE, STATUS.RETENIDO]),
    );
  }

  if (dateFrom) conditions.push(sql`${overtimeRecords.date} >= ${dateFrom}`);
  if (dateTo) conditions.push(sql`${overtimeRecords.date} <= ${dateTo}`);

  // Búsqueda por nombre de funcionario — filtra sobre TODOS los pendientes
  // (no solo la página actual) resolviendo primero los userId que coinciden.
  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const matched = await db.select({ id: users.id }).from(users)
      .where(sql`lower(${users.firstName} || ' ' || ${users.lastName}) LIKE ${term}`);
    const matchedIds = matched.map(u => u.id);
    if (matchedIds.length === 0) return { data: [], total: 0, page, limit };
    conditions.push(inArray(overtimeRecords.userId, matchedIds));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(overtimeRecords).where(where)
      .orderBy(desc(overtimeRecords.alertLevel), desc(overtimeRecords.date))
      .limit(limit).offset(offset),
    db.select({ count: sql`count(*)` }).from(overtimeRecords).where(where),
  ]);

  const enriched = await Promise.all(rows.map(enrichRecord));
  return { data: enriched, total: Number(countResult[0]?.count ?? 0), page, limit };
};

// ─── Historial de aprobaciones de un registro ─────────────────────────────────
export const getApprovalHistory = async (overtimeId) => {
  const list = await db
    .select({
      id: approvals.id,
      approverId: approvals.approverId,
      approvalLevel: approvals.approvalLevel,
      action: approvals.action,
      comment: approvals.comment,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .where(eq(approvals.overtimeRecordId, parseInt(overtimeId)))
    .orderBy(approvals.createdAt);

  return Promise.all(list.map(async (a) => {
    const [approver] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, role: users.role })
      .from(users).where(eq(users.id, a.approverId)).limit(1);
    return { ...a, approver: approver || null };
  }));
};

// ─── Aprobar ──────────────────────────────────────────────────────────────────
export const approve = async (overtimeId, data, requester, ip) => {
  const { activityCategory, excessJustification, comment } = data;
  const activityDescription = activityCategory; // la categoría es el detalle de la actividad

  const [record] = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  if (!record) throw createError('Registro no encontrado', 404);

  if (![STATUS.PENDIENTE, STATUS.RETENIDO].includes(record.status)) {
    throw createError(`El registro está en estado ${record.status} y no puede ser aprobado`, 409);
  }

  // Verificar permisos de jefatura
  await checkJefaturaCanApprove(record, requester);

  // Validar justificación de exceso si alertLevel >= 1
  if (record.alertLevel >= ALERT_LEVELS.INFORMATIVA) {
    if (!excessJustification || excessJustification.trim().length < 30) {
      throw createError('Este registro tiene alerta. Se requiere justificación de exceso de al menos 30 caracteres', 422);
    }
  }

  // ── Aprobación simple (sin doble validación) ──────────────────────────────
  const newStatus = STATUS.APROBADO;
  const approvalLevel = 1;

  await db.update(overtimeRecords).set({
    status: STATUS.APROBADO,
    activityCategory: activityCategory,
    activityDescription: activityDescription.trim(),
    excessJustification: excessJustification?.trim() || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeRecords.id, parseInt(overtimeId)));

  // Registrar aprobación
  await db.insert(approvals).values({
    overtimeRecordId: parseInt(overtimeId),
    approverId: requester.id,
    approvalLevel,
    action: APPROVAL_ACTIONS.APROBAR,
    comment: comment.trim(),
    ipAddress: ip,
  });

  await logAudit({
    userId: requester.id,
    action: 'approval.approve',
    entityType: 'overtime_record',
    entityId: parseInt(overtimeId),
    oldValues: { status: record.status },
    newValues: { status: newStatus, approvalLevel },
    req: { ip },
  });

  const updated = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  return enrichRecord(updated[0]);
};

// ─── Rechazar ─────────────────────────────────────────────────────────────────
export const reject = async (overtimeId, { comment }, requester, ip) => {
  const [record] = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  if (!record) throw createError('Registro no encontrado', 404);

  if (![STATUS.PENDIENTE, STATUS.RETENIDO].includes(record.status)) {
    throw createError(`El registro está en estado ${record.status} y no puede ser rechazado`, 409);
  }

  await checkJefaturaCanApprove(record, requester);

  await db.update(overtimeRecords).set({
    status: STATUS.RECHAZADO,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeRecords.id, parseInt(overtimeId)));

  await db.insert(approvals).values({
    overtimeRecordId: parseInt(overtimeId),
    approverId: requester.id,
    approvalLevel: 1,
    action: APPROVAL_ACTIONS.RECHAZAR,
    comment: comment.trim(),
    ipAddress: ip,
  });

  await logAudit({
    userId: requester.id,
    action: 'approval.reject',
    entityType: 'overtime_record',
    entityId: parseInt(overtimeId),
    oldValues: { status: record.status },
    newValues: { status: STATUS.RECHAZADO },
    req: { ip },
  });

  const updated = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  return enrichRecord(updated[0]);
};

// ─── Solicitar aclaración ─────────────────────────────────────────────────────
export const requestClarification = async (overtimeId, { comment }, requester, ip) => {
  const [record] = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  if (!record) throw createError('Registro no encontrado', 404);

  if (![STATUS.PENDIENTE, STATUS.RETENIDO].includes(record.status)) {
    throw createError(`El registro está en estado ${record.status} — no se puede solicitar aclaración`, 409);
  }

  await checkJefaturaCanApprove(record, requester);

  await db.update(overtimeRecords).set({
    status: STATUS.ACLARACION_SOLICITADA,
    updatedAt: new Date().toISOString(),
  }).where(eq(overtimeRecords.id, parseInt(overtimeId)));

  await db.insert(approvals).values({
    overtimeRecordId: parseInt(overtimeId),
    approverId: requester.id,
    approvalLevel: 1,
    action: APPROVAL_ACTIONS.SOLICITAR_ACLARACION,
    comment: comment.trim(),
    ipAddress: ip,
  });

  await logAudit({
    userId: requester.id,
    action: 'approval.clarify',
    entityType: 'overtime_record',
    entityId: parseInt(overtimeId),
    oldValues: { status: record.status },
    newValues: { status: STATUS.ACLARACION_SOLICITADA },
    req: { ip },
  });

  const updated = await db.select().from(overtimeRecords).where(eq(overtimeRecords.id, parseInt(overtimeId))).limit(1);
  return enrichRecord(updated[0]);
};

// ─── Estadísticas de la bandeja ───────────────────────────────────────────────
export const getApprovalStats = async (requester) => {
  if (requester.role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, requester.id));
    const teamIds = team.map(u => u.id);
    if (teamIds.length === 0) return { pendingCount: 0, retainedCount: 0, needsSecondApproval: 0 };

    const [pending] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
      .where(and(inArray(overtimeRecords.userId, teamIds), eq(overtimeRecords.status, STATUS.PENDIENTE), isNull(overtimeRecords.firstApprovalBy)));
    const [retained] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
      .where(and(inArray(overtimeRecords.userId, teamIds), eq(overtimeRecords.status, STATUS.RETENIDO)));

    return {
      pendingCount: Number(pending?.count ?? 0),
      retainedCount: Number(retained?.count ?? 0),
      needsSecondApproval: 0,
    };
  } else {
    // Admin
    const [pending] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
      .where(eq(overtimeRecords.status, STATUS.PENDIENTE));
    const [retained] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
      .where(eq(overtimeRecords.status, STATUS.RETENIDO));
    const [second] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
      .where(and(eq(overtimeRecords.status, STATUS.PENDIENTE), isNotNull(overtimeRecords.firstApprovalBy)));

    return {
      pendingCount: Number(pending?.count ?? 0),
      retainedCount: Number(retained?.count ?? 0),
      needsSecondApproval: Number(second?.count ?? 0),
    };
  }
};
