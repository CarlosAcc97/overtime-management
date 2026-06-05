import { Router } from 'express';
import ExcelJS from 'exceljs';
import { db } from '../../config/database.js';
import { overtimeRecords, users, costCenters, approvals, departments } from '../../db/schema.js';
import { eq, and, gte, lte, notInArray, inArray, desc, sql } from 'drizzle-orm';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyJefaturaOrAdmin } from '../../middleware/authorize.js';
import { STATUS, ROLES } from '../../config/constants.js';

const router = Router();
router.use(authenticate, onlyJefaturaOrAdmin);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OVERTIME_TYPE_LABELS = {
  extra: 'Horas extras (1.5x)',
  super_extra: 'Horas super extras (2.0x)',
  especial: 'Horas especiales (2.5x)',
};

const STATUS_LABELS = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  ACLARACION_SOLICITADA: 'Aclaración solicitada',
  ANULADO: 'Anulado',
  RETENIDO: 'Retenido',
};

const buildWhere = async (requester, { dateFrom, dateTo, status, userId, departmentId } = {}) => {
  const conditions = [];

  // Sin filtro de estado explícito: excluir solo ANULADO (RECHAZADO sí cuenta)
  if (!status) {
    conditions.push(notInArray(overtimeRecords.status, [STATUS.ANULADO]));
  }

  // Scope por rol + filtro de departamento
  if (requester.role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, requester.id));
    let ids = [requester.id, ...team.map(u => u.id)];

    if (departmentId) {
      // Intersección: miembros del equipo que pertenecen al departamento seleccionado
      const inTeam = ids.length > 0
        ? await db.select({ id: users.id }).from(users)
            .where(and(eq(users.departmentId, parseInt(departmentId)), inArray(users.id, ids)))
        : [];
      ids = inTeam.map(u => u.id);
    }

    if (ids.length > 0) {
      conditions.push(inArray(overtimeRecords.userId, ids));
    } else {
      conditions.push(sql`1=0`); // sin coincidencias
    }
  } else if (userId) {
    // Admin filtró por funcionario específico
    conditions.push(eq(overtimeRecords.userId, parseInt(userId)));
  } else if (departmentId) {
    // Admin filtró por departamento
    const deptUsers = await db.select({ id: users.id }).from(users)
      .where(eq(users.departmentId, parseInt(departmentId)));
    const deptUserIds = deptUsers.map(u => u.id);
    if (deptUserIds.length > 0) {
      conditions.push(inArray(overtimeRecords.userId, deptUserIds));
    } else {
      conditions.push(sql`1=0`);
    }
  }

  if (dateFrom) conditions.push(gte(overtimeRecords.date, dateFrom));
  if (dateTo)   conditions.push(lte(overtimeRecords.date, dateTo));
  if (status)   conditions.push(eq(overtimeRecords.status, status));

  return conditions.length ? and(...conditions) : undefined;
};

const fetchRecords = async (where) => {
  const rows = await db.select().from(overtimeRecords)
    .where(where)
    .orderBy(desc(overtimeRecords.date), desc(overtimeRecords.createdAt));

  // Consultas secuenciales — libsql/SQLite no soporta concurrencia (no Promise.all)
  const enriched = [];
  for (const r of rows) {
    const [emp] = await db.select({
      firstName: users.firstName, lastName: users.lastName,
      employeeId: users.employeeId, email: users.email, hourlyRate: users.hourlyRate,
      departmentId: users.departmentId,
    }).from(users).where(eq(users.id, r.userId)).limit(1);

    const [cc] = r.costCenterId
      ? await db.select({ code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.id, r.costCenterId)).limit(1)
      : [null];

    const [firstApproval] = await db.select({ comment: approvals.comment, createdAt: approvals.createdAt })
      .from(approvals)
      .where(and(eq(approvals.overtimeRecordId, r.id), eq(approvals.action, 'APROBAR')))
      .orderBy(approvals.createdAt).limit(1);

    enriched.push({ ...r, emp: emp || {}, cc: cc || {}, firstApproval: firstApproval || null });
  }
  return enriched;
};

// ─── Excel export ─────────────────────────────────────────────────────────────
router.get('/excel', async (req, res) => {
  const { dateFrom, dateTo, status, userId, departmentId } = req.query;
  const where = await buildWhere(req.user, { dateFrom, dateTo, status, userId, departmentId });
  const records = await fetchRecords(where);

  // Cargar mapa de departamentos para enriquecer datos
  const allDepts = await db.select({ id: departments.id, name: departments.name }).from(departments);
  const deptMap = Object.fromEntries(allDepts.map(d => [d.id, d.name]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Horas Extras';
  wb.created = new Date();

  const ws = wb.addWorksheet('Horas Extras', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  // ── Estilos ────────────────────────────────────────────────────────────────
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e40af' } };
  const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
  const borderThin = { style: 'thin', color: { argb: 'FFd1d5db' } };
  const allBorders = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

  // ── Título ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const periodLabel = dateFrom && dateTo
    ? `${dateFrom} al ${dateTo}`
    : dateFrom ? `Desde ${dateFrom}` : dateTo ? `Hasta ${dateTo}` : 'Todos los registros';

  ws.mergeCells('A1:N1');
  ws.getCell('A1').value = 'REPORTE DE HORAS EXTRAS — GERENCIA DE DISTRIBUCIÓN';
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1e3a8a' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.mergeCells('A2:N2');
  ws.getCell('A2').value = `Período: ${periodLabel} | Generado: ${now.toLocaleString('es-CL')}`;
  ws.getCell('A2').font = { size: 9, italic: true, color: { argb: 'FF6b7280' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.addRow([]);

  // ── Encabezados ────────────────────────────────────────────────────────────
  const headers = [
    'ID', 'Funcionario', 'ID Empleado', 'Departamento', 'Email',
    'Fecha', 'Hora inicio', 'Hora término', 'Horas calc.',
    'Tipo hora extra', 'Factor', 'Hrs efectivas',
    'Centro de costo', 'Estado', 'Nivel alerta',
    'Actividad', 'Justif. exceso', 'Costo estimado CLP',
  ];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = allBorders;
  });
  ws.getRow(4).height = 30;

  // ── Datos ──────────────────────────────────────────────────────────────────
  let totalHoras = 0, totalCosto = 0;
  const alertColors = { 0: null, 1: 'FFFFF9c4', 2: 'FFFECACA', 3: 'FFFAE8FF' };

  records.forEach((r, idx) => {
    const hrsEfectivas = r.hoursCalculated * r.factor;
    const costo = hrsEfectivas * (r.emp?.hourlyRate ?? 5000);
    totalHoras += r.hoursCalculated;
    totalCosto += costo;

    const row = ws.addRow([
      r.id,
      `${r.emp?.firstName ?? ''} ${r.emp?.lastName ?? ''}`.trim(),
      r.emp?.employeeId ?? '—',
      deptMap[r.emp?.departmentId] ?? '—',
      r.emp?.email ?? '—',
      r.date,
      r.startTime,
      r.endTime,
      r.hoursCalculated,
      OVERTIME_TYPE_LABELS[r.overtimeType] ?? r.overtimeType,
      r.factor,
      parseFloat(hrsEfectivas.toFixed(2)),
      r.cc?.code ? `${r.cc.code} — ${r.cc.name}` : '—',
      STATUS_LABELS[r.status] ?? r.status,
      r.alertLevel ?? 0,
      r.activityDescription ?? 'Pendiente de descripción',
      r.excessJustification ?? '—',
      Math.round(costo),
    ]);

    // Color de fila por alerta
    const bgColor = alertColors[r.alertLevel ?? 0];
    row.eachCell((cell) => {
      if (bgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
    // Alinear columnas numéricas (se desplazan 1 por la nueva col Departamento)
    [9, 11, 12, 18].forEach(col => { row.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' }; });
  });

  // ── Totales ────────────────────────────────────────────────────────────────
  ws.addRow([]);
  const totalRow = ws.addRow([
    '', `TOTAL (${records.length} registros)`, '', '', '', '', '', '',
    parseFloat(totalHoras.toFixed(2)), '', '', '', '', '', '', '', '',
    Math.round(totalCosto),
  ]);
  totalRow.eachCell((cell, col) => {
    if ([2, 9, 18].includes(col)) {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } };
    }
    cell.border = allBorders;
  });

  // ── Anchos de columna ──────────────────────────────────────────────────────
  ws.columns = [
    { width: 6 },  { width: 24 }, { width: 12 }, { width: 30 }, { width: 26 },
    { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 22 }, { width: 8 },  { width: 12 },
    { width: 24 }, { width: 22 }, { width: 10 },
    { width: 40 }, { width: 40 }, { width: 18 },
  ];

  // ── Enviar ─────────────────────────────────────────────────────────────────
  const filename = `horas-extras-${now.toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── Resumen PDF-like en JSON (para impresión desde frontend) ─────────────────
router.get('/summary', async (req, res) => {
  const { dateFrom, dateTo, status, userId, departmentId } = req.query;
  const where = await buildWhere(req.user, { dateFrom, dateTo, status, userId, departmentId });
  const records = await fetchRecords(where);

  // Cargar mapa de departamentos para enriquecer datos
  const allDepts = await db.select({ id: departments.id, code: departments.code, name: departments.name })
    .from(departments);
  const deptMap = Object.fromEntries(allDepts.map(d => [d.id, { id: d.id, code: d.code, name: d.name }]));

  // Resumen por funcionario
  const byEmployee = {};
  for (const r of records) {
    const key = r.userId;
    if (!byEmployee[key]) {
      byEmployee[key] = {
        userId: key,
        name: `${r.emp?.firstName ?? ''} ${r.emp?.lastName ?? ''}`.trim(),
        employeeId: r.emp?.employeeId,
        departmentId: r.emp?.departmentId ?? null,
        department: r.emp?.departmentId ? (deptMap[r.emp.departmentId] ?? null) : null,
        totalHours: 0, effectiveHours: 0, records: 0,
        approvedHours: 0, pendingHours: 0, rejectedHours: 0, estimatedCost: 0,
        byType: {},
      };
    }
    const e = byEmployee[key];
    e.totalHours += r.hoursCalculated;
    e.effectiveHours += r.hoursCalculated * r.factor;
    e.records += 1;
    e.estimatedCost += r.hoursCalculated * r.factor * (r.emp?.hourlyRate ?? 5000);
    if (r.status === STATUS.APROBADO)  e.approvedHours  += r.hoursCalculated;
    if ([STATUS.PENDIENTE, STATUS.ACLARACION_SOLICITADA, STATUS.RETENIDO].includes(r.status))
      e.pendingHours += r.hoursCalculated;
    if (r.status === STATUS.RECHAZADO) e.rejectedHours += r.hoursCalculated;
    e.byType[r.overtimeType] = (e.byType[r.overtimeType] ?? 0) + r.hoursCalculated;
  }

  const employees = Object.values(byEmployee).sort((a, b) => b.totalHours - a.totalHours)
    .map(e => ({ ...e, totalHours: +e.totalHours.toFixed(2), effectiveHours: +e.effectiveHours.toFixed(2), estimatedCost: Math.round(e.estimatedCost) }));

  const totals = employees.reduce((acc, e) => ({
    totalHours:    acc.totalHours    + e.totalHours,
    effectiveHours: acc.effectiveHours + e.effectiveHours,
    approvedHours:  acc.approvedHours  + e.approvedHours,
    pendingHours:   acc.pendingHours   + e.pendingHours,
    rejectedHours:  acc.rejectedHours  + e.rejectedHours,
    estimatedCost:  acc.estimatedCost  + e.estimatedCost,
    records:        acc.records        + e.records,
  }), { totalHours: 0, effectiveHours: 0, approvedHours: 0, pendingHours: 0, rejectedHours: 0, estimatedCost: 0, records: 0 });

  res.json({
    success: true, data: {
      period: { dateFrom, dateTo },
      generatedAt: new Date().toISOString(),
      totals: { ...totals, totalHours: +totals.totalHours.toFixed(2), effectiveHours: +totals.effectiveHours.toFixed(2) },
      employees,
      recordCount: records.length,
    },
  });
});

// ─── Detalle diario de un funcionario (para modal calendario) ─────────────────
router.get('/employee-detail', async (req, res) => {
  const { userId, dateFrom, dateTo } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: 'userId es requerido' });

  const uid = parseInt(userId);

  // Autorización: jefatura solo puede ver su equipo
  if (req.user.role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, req.user.id));
    const ids = [req.user.id, ...team.map(u => u.id)];
    if (!ids.includes(uid)) {
      return res.status(403).json({ success: false, message: 'No tiene acceso a este funcionario' });
    }
  }

  // Datos del funcionario (con departamento)
  const [emp] = await db.select({
    id: users.id, firstName: users.firstName, lastName: users.lastName,
    employeeId: users.employeeId, email: users.email, hourlyRate: users.hourlyRate,
    departmentId: users.departmentId,
  }).from(users).where(eq(users.id, uid)).limit(1);

  if (!emp) return res.status(404).json({ success: false, message: 'Funcionario no encontrado' });

  // Registros con centro de costo (left join via subquery)
  const conditions = [eq(overtimeRecords.userId, uid)];
  if (dateFrom) conditions.push(gte(overtimeRecords.date, dateFrom));
  if (dateTo)   conditions.push(lte(overtimeRecords.date, dateTo));

  const rows = await db.select({
    id: overtimeRecords.id,
    date: overtimeRecords.date,
    startTime: overtimeRecords.startTime,
    endTime: overtimeRecords.endTime,
    hoursCalculated: overtimeRecords.hoursCalculated,
    overtimeType: overtimeRecords.overtimeType,
    factor: overtimeRecords.factor,
    status: overtimeRecords.status,
    alertLevel: overtimeRecords.alertLevel,
    requiresDoubleValidation: overtimeRecords.requiresDoubleValidation,
    activityCategory: overtimeRecords.activityCategory,
    activityDescription: overtimeRecords.activityDescription,
    excessJustification: overtimeRecords.excessJustification,
    costCenterId: overtimeRecords.costCenterId,
    ccCode: costCenters.code,
    ccName: costCenters.name,
  })
    .from(overtimeRecords)
    .leftJoin(costCenters, eq(overtimeRecords.costCenterId, costCenters.id))
    .where(and(...conditions))
    .orderBy(overtimeRecords.date, overtimeRecords.startTime);

  // Obtener comentarios de aprobación Y rechazo en una sola consulta (sin Promise.all — Turso)
  const recordIds = rows.map(r => r.id);
  const approvalCommentMap  = {};
  const rejectionCommentMap = {};
  if (recordIds.length > 0) {
    const approvalRows = await db
      .select({ overtimeRecordId: approvals.overtimeRecordId, comment: approvals.comment, action: approvals.action })
      .from(approvals)
      .where(and(
        inArray(approvals.overtimeRecordId, recordIds),
        inArray(approvals.action, ['APROBAR', 'RECHAZAR']),
      ))
      .orderBy(approvals.createdAt);
    for (const a of approvalRows) {
      if (a.action === 'APROBAR' && !approvalCommentMap[a.overtimeRecordId]) {
        approvalCommentMap[a.overtimeRecordId] = a.comment;
      }
      if (a.action === 'RECHAZAR' && !rejectionCommentMap[a.overtimeRecordId]) {
        rejectionCommentMap[a.overtimeRecordId] = a.comment;
      }
    }
  }

  // Agrupar por día
  const byDay = {};
  for (const r of rows) {
    if (!byDay[r.date]) byDay[r.date] = [];
    byDay[r.date].push({
      ...r,
      cc: r.ccCode ? { code: r.ccCode, name: r.ccName } : null,
      approvalComment:  approvalCommentMap[r.id]  ?? null,
      rejectionComment: rejectionCommentMap[r.id] ?? null,
    });
  }

  // Enriquecer emp con nombre de departamento
  let empDept = null;
  if (emp.departmentId) {
    const [dept] = await db.select({ id: departments.id, code: departments.code, name: departments.name })
      .from(departments).where(eq(departments.id, emp.departmentId)).limit(1);
    empDept = dept ?? null;
  }

  res.json({
    success: true,
    data: {
      employee: { ...emp, department: empDept },
      records: rows,
      byDay,
    },
  });
});

// ─── Lista de departamentos activos (para filtros del frontend) ────────────────
router.get('/departments', async (req, res) => {
  const depts = await db.select({
    id: departments.id,
    code: departments.code,
    name: departments.name,
  }).from(departments).where(sql`is_active = 1`).orderBy(departments.name);
  res.json({ success: true, data: { departments: depts } });
});

export default router;
