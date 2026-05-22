import { Router } from 'express';
import { db } from '../../config/database.js';
import { overtimeRecords, users, approvals, costCenters, departments } from '../../db/schema.js';
import { eq, and, gte, lte, notInArray, desc, sql, or, inArray } from 'drizzle-orm';
import { ok } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { anyRole, onlyJefaturaOrAdmin } from '../../middleware/authorize.js';
import { STATUS, ROLES } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

// ─── KPIs globales (adaptados por rol) ────────────────────────────────────────
router.get('/kpis', anyRole, async (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const prevEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { id: userId, role } = req.user;

  // Scope: qué registros ve este usuario
  let userScope = [];
  if (role === ROLES.FUNCIONARIO) {
    userScope = [eq(overtimeRecords.userId, userId)];
  } else if (role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, userId));
    const ids = [userId, ...team.map(u => u.id)];
    userScope = [inArray(overtimeRecords.userId, ids)];
  }
  // admin: sin filtro de scope

  const scopeWhere = userScope.length ? and(...userScope) : undefined;
  const scopeMonth = scopeWhere
    ? and(...userScope, gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]))
    : and(gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]));
  const scopePrevMonth = scopeWhere
    ? and(...userScope, gte(overtimeRecords.date, prevStart), lte(overtimeRecords.date, prevEnd), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]))
    : and(gte(overtimeRecords.date, prevStart), lte(overtimeRecords.date, prevEnd), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]));

  const [totalMonth] = await db.select({ h: sql`COALESCE(SUM(hours_calculated),0)`, c: sql`count(*)` }).from(overtimeRecords).where(scopeMonth);
  const [totalPrev] = await db.select({ h: sql`COALESCE(SUM(hours_calculated),0)` }).from(overtimeRecords).where(scopePrevMonth);
  const [pending] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
    .where(scopeWhere ? and(...userScope, eq(overtimeRecords.status, STATUS.PENDIENTE)) : eq(overtimeRecords.status, STATUS.PENDIENTE));
  const [approved] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
    .where(scopeWhere ? and(...userScope, eq(overtimeRecords.status, STATUS.APROBADO), gte(overtimeRecords.date, monthStart)) : and(eq(overtimeRecords.status, STATUS.APROBADO), gte(overtimeRecords.date, monthStart)));
  const [retained] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
    .where(scopeWhere ? and(...userScope, eq(overtimeRecords.status, STATUS.RETENIDO)) : eq(overtimeRecords.status, STATUS.RETENIDO));
  const [withAlerts] = await db.select({ count: sql`count(*)` }).from(overtimeRecords)
    .where(scopeWhere
      ? and(...userScope, gte(overtimeRecords.date, monthStart), sql`alert_level > 0`)
      : and(gte(overtimeRecords.date, monthStart), sql`alert_level > 0`));

  const monthHours = parseFloat(totalMonth?.h ?? 0);
  const prevHours = parseFloat(totalPrev?.h ?? 0);
  const trend = prevHours > 0 ? ((monthHours - prevHours) / prevHours * 100).toFixed(1) : null;

  ok(res, {
    monthHours,
    monthRecords: Number(totalMonth?.c ?? 0),
    prevMonthHours: prevHours,
    trend,
    pendingCount: Number(pending?.count ?? 0),
    approvedMonth: Number(approved?.count ?? 0),
    retainedCount: Number(retained?.count ?? 0),
    alertsCount: Number(withAlerts?.count ?? 0),
  });
});

// ─── Evolución mensual (últimos 6 meses) ──────────────────────────────────────
router.get('/monthly-trend', onlyJefaturaOrAdmin, async (req, res) => {
  const { id: userId, role } = req.user;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({
      label: d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
      start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      end: i === 0
        ? new Date().toISOString().slice(0, 10)
        : (() => { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return e.toISOString().slice(0, 10); })(),
    });
  }

  let teamFilter = [];
  if (role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, userId));
    teamFilter = [inArray(overtimeRecords.userId, [userId, ...team.map(u => u.id)])];
  }

  // Consultas secuenciales — libsql/SQLite no soporta concurrencia
  const data = [];
  for (const m of months) {
    const base = and(
      gte(overtimeRecords.date, m.start),
      lte(overtimeRecords.date, m.end),
      notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]),
    );
    const where = teamFilter.length ? and(...teamFilter, base) : base;
    const [row] = await db.select({
      hours: sql`COALESCE(SUM(hours_calculated),0)`,
      count: sql`count(*)`,
      approved: sql`SUM(CASE WHEN status='APROBADO' THEN 1 ELSE 0 END)`,
    }).from(overtimeRecords).where(where);
    data.push({
      month: m.label,
      horas: parseFloat(row?.hours ?? 0),
      registros: Number(row?.count ?? 0),
      aprobados: Number(row?.approved ?? 0),
    });
  }

  ok(res, { trend: data });
});

// ─── Horas por centro de costo (mes actual) ───────────────────────────────────
router.get('/by-cost-center', onlyJefaturaOrAdmin, async (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await db.select({
    costCenterId: overtimeRecords.costCenterId,
    hours: sql`COALESCE(SUM(hours_calculated),0)`,
    count: sql`count(*)`,
  }).from(overtimeRecords)
    .where(and(gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO])))
    .groupBy(overtimeRecords.costCenterId);

  const ccList = await db.select().from(costCenters);
  const ccMap = Object.fromEntries(ccList.map(c => [c.id, c]));

  const data = rows.map(r => ({
    name: ccMap[r.costCenterId]?.name ?? 'Sin asignar',
    code: ccMap[r.costCenterId]?.code ?? '—',
    horas: parseFloat(r.hours),
    registros: Number(r.count),
  })).sort((a, b) => b.horas - a.horas);

  ok(res, { byCostCenter: data });
});

// ─── Top funcionarios por horas (mes actual) ──────────────────────────────────
router.get('/top-employees', onlyJefaturaOrAdmin, async (req, res) => {
  const { id: userId, role } = req.user;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  let teamFilter = [];
  if (role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, userId));
    teamFilter = [inArray(overtimeRecords.userId, [userId, ...team.map(u => u.id)])];
  }

  const base = and(gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]));
  const where = teamFilter.length ? and(...teamFilter, base) : base;

  const rows = await db.select({
    userId: overtimeRecords.userId,
    hours: sql`COALESCE(SUM(hours_calculated),0)`,
    count: sql`count(*)`,
    alerts: sql`SUM(CASE WHEN alert_level > 0 THEN 1 ELSE 0 END)`,
  }).from(overtimeRecords).where(where)
    .groupBy(overtimeRecords.userId)
    .orderBy(desc(sql`SUM(hours_calculated)`))
    .limit(10);

  // Consultas secuenciales — libsql/SQLite no soporta concurrencia
  const enriched = [];
  for (const r of rows) {
    const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, employeeId: users.employeeId })
      .from(users).where(eq(users.id, r.userId)).limit(1);
    enriched.push({
      name: u ? `${u.firstName} ${u.lastName}` : `ID ${r.userId}`,
      employeeId: u?.employeeId,
      horas: parseFloat(r.hours),
      registros: Number(r.count),
      alertas: Number(r.alerts),
    });
  }

  ok(res, { topEmployees: enriched });
});

// ─── Distribución por tipo de hora extra ─────────────────────────────────────
router.get('/by-type', onlyJefaturaOrAdmin, async (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await db.select({
    overtimeType: overtimeRecords.overtimeType,
    hours: sql`COALESCE(SUM(hours_calculated),0)`,
    count: sql`count(*)`,
  }).from(overtimeRecords)
    .where(and(gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO])))
    .groupBy(overtimeRecords.overtimeType);

  const typeLabels = { extra: 'Horas extras', super_extra: 'Super extras', especial: 'Especiales' };
  const data = rows.map(r => ({
    name: typeLabels[r.overtimeType] || r.overtimeType,
    horas: parseFloat(r.hours),
    registros: Number(r.count),
  }));

  ok(res, { byType: data });
});

// ─── Proyección de costo (mes actual) ────────────────────────────────────────
router.get('/cost-projection', onlyJefaturaOrAdmin, async (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await db.select({
    userId: overtimeRecords.userId,
    hours: sql`COALESCE(SUM(hours_calculated),0)`,
    weightedHours: sql`COALESCE(SUM(hours_calculated * factor),0)`,
  }).from(overtimeRecords)
    .where(and(gte(overtimeRecords.date, monthStart), notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO])))
    .groupBy(overtimeRecords.userId);

  let totalCost = 0;
  for (const r of rows) {
    const [u] = await db.select({ hourlyRate: users.hourlyRate }).from(users).where(eq(users.id, r.userId)).limit(1);
    const rate = u?.hourlyRate ?? 5000;
    totalCost += parseFloat(r.weightedHours) * rate;
  }

  const [configRow] = await db.select({ value: sql`value` }).from(sql`system_config`).where(sql`key = 'default_hourly_rate'`);
  const defaultRate = parseFloat(configRow?.value ?? 5000);

  ok(res, {
    totalCostCLP: Math.round(totalCost),
    month: now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
  });
});

export default router;
