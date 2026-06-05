import { Router } from 'express';
import { db } from '../../config/database.js';
import { overtimeRecords, users, costCenters } from '../../db/schema.js';
import { eq, and, gte, lte, notInArray, desc, sql, inArray } from 'drizzle-orm';
import { ok } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { anyRole, onlyJefaturaOrAdmin } from '../../middleware/authorize.js';
import { STATUS, ROLES } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

// ─── Helpers de período de facturación (ciclo 21 → 20) ───────────────────────

/**
 * Inicio del período de facturación actual.
 * Si hoy >= 21 → el 21 de este mes; si hoy < 21 → el 21 del mes anterior.
 */
function currentBillingStart() {
  const today = new Date();
  const day   = today.getDate();
  if (day >= 21) return new Date(today.getFullYear(), today.getMonth(), 21);
  return new Date(today.getFullYear(), today.getMonth() - 1, 21);
}

/**
 * Retorna { start, end } en formato YYYY-MM-DD para el período dado.
 * start/end = null → sin filtro de fecha (histórico).
 */
function billingDates(period = 'mes') {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const curStart = currentBillingStart();

  if (period === 'mes') {
    return { start: curStart.toISOString().slice(0, 10), end: todayStr };
  }
  if (period === 'anio') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const start = (m === 0 && today.getDate() <= 20)
      ? `${y - 1}-12-21`
      : `${y}-01-21`;
    return { start, end: todayStr };
  }
  return { start: null, end: null }; // historico
}

/**
 * Genera la lista de períodos 21-20 para el gráfico de tendencia.
 */
function billingPeriodsList(period = 'mes') {
  const today    = new Date();
  const curStart = currentBillingStart();
  const addM     = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

  const buildPeriod = (startDate, isLast) => ({
    label: startDate.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
    start: startDate.toISOString().slice(0, 10),
    end:   (isLast ? today : new Date(startDate.getFullYear(), startDate.getMonth() + 1, 20)).toISOString().slice(0, 10),
  });

  if (period === 'mes') {
    return Array.from({ length: 6 }, (_, i) => buildPeriod(addM(curStart, -(5 - i)), i === 5));
  }
  if (period === 'anio') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const yearStart = (m === 0 && today.getDate() <= 20)
      ? new Date(y - 1, 11, 21)
      : new Date(y, 0, 21);
    const periods = [];
    let d = new Date(yearStart);
    while (d <= curStart) {
      periods.push(buildPeriod(new Date(d), d.getTime() === curStart.getTime()));
      d = new Date(d.getFullYear(), d.getMonth() + 1, 21);
    }
    return periods;
  }
  // historico: últimos 24 períodos
  return Array.from({ length: 24 }, (_, i) => buildPeriod(addM(curStart, -(23 - i)), i === 23));
}

/** Scope de registros visible para el usuario según su rol */
async function getUserScope(userId, role) {
  if (role === ROLES.FUNCIONARIO) return [eq(overtimeRecords.userId, userId)];
  if (role === ROLES.JEFATURA) {
    const team = await db.select({ id: users.id }).from(users).where(eq(users.supervisorId, userId));
    return [inArray(overtimeRecords.userId, [userId, ...team.map(u => u.id)])];
  }
  return []; // admin: sin filtro de usuario
}

// ─── KPIs globales ────────────────────────────────────────────────────────────
router.get('/kpis', anyRole, async (req, res) => {
  const { id: userId, role } = req.user;
  const period = req.query.period || 'mes';

  const { start, end } = billingDates(period);
  const curStart = currentBillingStart();
  const prevStart = new Date(curStart.getFullYear(), curStart.getMonth() - 1, 21);
  const prevEnd   = new Date(curStart.getFullYear(), curStart.getMonth(), 20);

  const scopeArr = await getUserScope(userId, role);
  const exclude  = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);

  const addScope = (...extra) => {
    const all = [...scopeArr, ...extra];
    return all.length ? and(...all) : undefined;
  };

  // Horas del período seleccionado
  const periodConds = start
    ? [gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), exclude]
    : [exclude];
  const [totalPeriod] = await db
    .select({ h: sql`COALESCE(SUM(hours_calculated),0)`, c: sql`count(*)` })
    .from(overtimeRecords).where(addScope(...periodConds));

  // Tendencia vs período anterior (solo para 'mes')
  let trend = null;
  if (period === 'mes') {
    const [totalPrev] = await db
      .select({ h: sql`COALESCE(SUM(hours_calculated),0)` })
      .from(overtimeRecords)
      .where(addScope(
        gte(overtimeRecords.date, prevStart.toISOString().slice(0, 10)),
        lte(overtimeRecords.date, prevEnd.toISOString().slice(0, 10)),
        exclude,
      ));
    const prevH = parseFloat(totalPrev?.h ?? 0);
    const curH  = parseFloat(totalPeriod?.h ?? 0);
    trend = prevH > 0 ? ((curH - prevH) / prevH * 100).toFixed(1) : null;
  }

  // Pendientes (estado actual, sin filtro de fecha)
  const [pending] = await db
    .select({ count: sql`count(*)` })
    .from(overtimeRecords)
    .where(addScope(eq(overtimeRecords.status, STATUS.PENDIENTE)));

  // Aprobados en el período
  const approvedConds = start
    ? [eq(overtimeRecords.status, STATUS.APROBADO), gte(overtimeRecords.date, start), lte(overtimeRecords.date, end)]
    : [eq(overtimeRecords.status, STATUS.APROBADO)];
  const [approved] = await db
    .select({ count: sql`count(*)` })
    .from(overtimeRecords).where(addScope(...approvedConds));

  // Retenidos (estado actual, sin filtro de fecha)
  const [retained] = await db
    .select({ count: sql`count(*)` })
    .from(overtimeRecords)
    .where(addScope(eq(overtimeRecords.status, STATUS.RETENIDO)));

  // Con alertas en el período
  const alertConds = start
    ? [gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), sql`alert_level > 0`]
    : [sql`alert_level > 0`];
  const [withAlerts] = await db
    .select({ count: sql`count(*)` })
    .from(overtimeRecords).where(addScope(...alertConds));

  // Distribución de horas por estado en el período
  const dateRangeConds = start ? [gte(overtimeRecords.date, start), lte(overtimeRecords.date, end)] : [];
  const excludeAnulado = notInArray(overtimeRecords.status, [STATUS.ANULADO]);

  const [approvedH] = await db
    .select({ h: sql`COALESCE(SUM(hours_calculated),0)` })
    .from(overtimeRecords)
    .where(addScope(eq(overtimeRecords.status, STATUS.APROBADO), excludeAnulado, ...dateRangeConds));

  const [pendingH] = await db
    .select({ h: sql`COALESCE(SUM(hours_calculated),0)` })
    .from(overtimeRecords)
    .where(addScope(
      inArray(overtimeRecords.status, [STATUS.PENDIENTE, STATUS.ACLARACION_SOLICITADA, STATUS.RETENIDO]),
      excludeAnulado, ...dateRangeConds,
    ));

  const [rejectedH] = await db
    .select({ h: sql`COALESCE(SUM(hours_calculated),0)` })
    .from(overtimeRecords)
    .where(addScope(eq(overtimeRecords.status, STATUS.RECHAZADO), ...dateRangeConds));

  ok(res, {
    monthHours:    parseFloat(totalPeriod?.h ?? 0),
    monthRecords:  Number(totalPeriod?.c ?? 0),
    trend,
    approvedHours:  parseFloat(approvedH?.h  ?? 0),
    pendingHours:   parseFloat(pendingH?.h   ?? 0),
    rejectedHours:  parseFloat(rejectedH?.h  ?? 0),
    pendingCount:  Number(pending?.count ?? 0),
    approvedMonth: Number(approved?.count ?? 0),
    retainedCount: Number(retained?.count ?? 0),
    alertsCount:   Number(withAlerts?.count ?? 0),
    period,
    periodStart: start,
    periodEnd:   end,
  });
});

// ─── Tendencia por períodos de facturación ────────────────────────────────────
router.get('/monthly-trend', onlyJefaturaOrAdmin, async (req, res) => {
  const { id: userId, role } = req.user;
  const period     = req.query.period || 'mes';
  const teamFilter = await getUserScope(userId, role);
  const periods    = billingPeriodsList(period);
  const exclude    = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);

  // Consultas secuenciales — libsql/Turso no soporta concurrencia
  const data = [];
  for (const p of periods) {
    const base  = and(gte(overtimeRecords.date, p.start), lte(overtimeRecords.date, p.end), exclude);
    const where = teamFilter.length ? and(...teamFilter, base) : base;
    const [row] = await db.select({
      hours:    sql`COALESCE(SUM(hours_calculated),0)`,
      count:    sql`count(*)`,
      approved: sql`SUM(CASE WHEN status='APROBADO' THEN 1 ELSE 0 END)`,
    }).from(overtimeRecords).where(where);
    data.push({
      month:     p.label,
      horas:     parseFloat(row?.hours ?? 0),
      registros: Number(row?.count ?? 0),
      aprobados: Number(row?.approved ?? 0),
    });
  }

  ok(res, { trend: data });
});

// ─── Horas por centro de costo ────────────────────────────────────────────────
router.get('/by-cost-center', onlyJefaturaOrAdmin, async (req, res) => {
  const { start, end } = billingDates(req.query.period || 'mes');
  const exclude = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);
  const where   = start
    ? and(gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), exclude)
    : exclude;

  const rows   = await db.select({
    costCenterId: overtimeRecords.costCenterId,
    hours: sql`COALESCE(SUM(hours_calculated),0)`,
    count: sql`count(*)`,
  }).from(overtimeRecords).where(where).groupBy(overtimeRecords.costCenterId);

  const ccList = await db.select().from(costCenters);
  const ccMap  = Object.fromEntries(ccList.map(c => [c.id, c]));

  ok(res, {
    byCostCenter: rows.map(r => ({
      name:      ccMap[r.costCenterId]?.name ?? 'Sin asignar',
      code:      ccMap[r.costCenterId]?.code ?? '—',
      horas:     parseFloat(r.hours),
      registros: Number(r.count),
    })).sort((a, b) => b.horas - a.horas),
  });
});

// ─── Top funcionarios por horas ───────────────────────────────────────────────
router.get('/top-employees', onlyJefaturaOrAdmin, async (req, res) => {
  const { id: userId, role } = req.user;
  const { start, end } = billingDates(req.query.period || 'mes');
  const teamFilter = await getUserScope(userId, role);
  const exclude    = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);

  const dateFilter = start
    ? and(gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), exclude)
    : exclude;
  const where = teamFilter.length ? and(...teamFilter, dateFilter) : dateFilter;

  const rows = await db.select({
    userId:  overtimeRecords.userId,
    hours:   sql`COALESCE(SUM(hours_calculated),0)`,
    count:   sql`count(*)`,
    alerts:  sql`SUM(CASE WHEN alert_level > 0 THEN 1 ELSE 0 END)`,
  }).from(overtimeRecords).where(where)
    .groupBy(overtimeRecords.userId)
    .orderBy(desc(sql`SUM(hours_calculated)`))
    .limit(10);

  // Consultas secuenciales — libsql/Turso no soporta concurrencia
  const enriched = [];
  for (const r of rows) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, employeeId: users.employeeId })
      .from(users).where(eq(users.id, r.userId)).limit(1);
    enriched.push({
      name:       u ? `${u.firstName} ${u.lastName}` : `ID ${r.userId}`,
      employeeId: u?.employeeId,
      horas:      parseFloat(r.hours),
      registros:  Number(r.count),
      alertas:    Number(r.alerts),
    });
  }

  ok(res, { topEmployees: enriched });
});

// ─── Distribución por tipo de hora extra ─────────────────────────────────────
router.get('/by-type', onlyJefaturaOrAdmin, async (req, res) => {
  const { start, end } = billingDates(req.query.period || 'mes');
  const exclude = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);
  const where   = start
    ? and(gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), exclude)
    : exclude;

  const rows = await db.select({
    overtimeType: overtimeRecords.overtimeType,
    hours:        sql`COALESCE(SUM(hours_calculated),0)`,
    count:        sql`count(*)`,
  }).from(overtimeRecords).where(where).groupBy(overtimeRecords.overtimeType);

  const labels = { extra: 'Horas extras', super_extra: 'Super extras', especial: 'Especiales' };
  ok(res, {
    byType: rows.map(r => ({
      name:      labels[r.overtimeType] || r.overtimeType,
      horas:     parseFloat(r.hours),
      registros: Number(r.count),
    })),
  });
});

// ─── Proyección de costo ──────────────────────────────────────────────────────
router.get('/cost-projection', onlyJefaturaOrAdmin, async (req, res) => {
  const period = req.query.period || 'mes';
  const { start, end } = billingDates(period);
  const exclude = notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]);
  const where   = start
    ? and(gte(overtimeRecords.date, start), lte(overtimeRecords.date, end), exclude)
    : exclude;

  const rows = await db.select({
    userId:        overtimeRecords.userId,
    weightedHours: sql`COALESCE(SUM(hours_calculated * factor),0)`,
  }).from(overtimeRecords).where(where).groupBy(overtimeRecords.userId);

  let totalCost = 0;
  for (const r of rows) {
    const [u] = await db
      .select({ hourlyRate: users.hourlyRate })
      .from(users).where(eq(users.id, r.userId)).limit(1);
    totalCost += parseFloat(r.weightedHours) * (u?.hourlyRate ?? 5000);
  }

  const periodLabel = period === 'mes'
    ? 'Período actual'
    : period === 'anio'
      ? `Año ${new Date().getFullYear()}`
      : 'Histórico';

  ok(res, { totalCostCLP: Math.round(totalCost), month: periodLabel });
});

export default router;
