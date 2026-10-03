import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import * as dashboardService from '@/services/dashboard.service';
import { getSystemConfig } from '@/services/users.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Clock, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  AlertOctagon, Users, CalendarDays, BarChart3, PieChart as PieIcon,
} from 'lucide-react';
import { formatHoursDecimal, formatCLP } from '@/utils/formatters';
import { useAuth } from '@/context/AuthContext';

// ─── Etiquetas de período ─────────────────────────────────────────────────────
const PERIOD_LABELS = {
  mes:       'Este mes',
  anio:      'Este año',
  historico: 'Histórico',
};
const TREND_TITLES = {
  mes:       'Evolución últimos 6 períodos',
  anio:      'Períodos del año actual',
  historico: 'Evolución histórica (últimos 24 períodos)',
};

// ─── Colores consistentes ─────────────────────────────────────────────────────
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const TYPE_COLORS = { 'Horas extras': '#3b82f6', 'Super extras': '#f59e0b', 'Especiales': '#ef4444' };

// Acentos de las tarjetas KPI (chip de ícono + barra superior)
const ACCENTS = {
  blue:    { chip: 'bg-blue-50 text-blue-600',       bar: 'bg-blue-500' },
  indigo:  { chip: 'bg-indigo-50 text-indigo-600',   bar: 'bg-indigo-500' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  red:     { chip: 'bg-red-50 text-red-600',         bar: 'bg-red-500' },
  purple:  { chip: 'bg-purple-50 text-purple-600',   bar: 'bg-purple-500' },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, secondaryValue, subtitle, icon: Icon, accent = 'blue', trend }) => {
  const a = ACCENTS[accent] ?? ACCENTS.blue;
  return (
    <Card className="relative overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <span className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${a.chip}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
        {secondaryValue && <div className="mt-1">{secondaryValue}</div>}
        {(trend != null || subtitle) && (
          <div className="mt-2 flex items-center gap-2">
            {trend != null && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${parseFloat(trend) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {parseFloat(trend) > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(parseFloat(trend))}%
              </span>
            )}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <p key={p.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <strong className="ml-auto">
              {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
            </strong>
          </p>
        ))}
      </div>
    </div>
  );
};

// ─── Encabezado de tarjeta de gráfico ──────────────────────────────────────────
const ChartHeader = ({ icon: Icon, title, children }) => (
  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4">
    <CardTitle className="text-base flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      {title}
    </CardTitle>
    {children}
  </CardHeader>
);

const EmptyChart = ({ text = 'Sin datos suficientes' }) => (
  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">{text}</div>
);

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin           = user?.role === 'administrador';
  const isJefaturaOrAdmin = ['jefatura', 'administrador'].includes(user?.role);

  const [period, setPeriod] = useState('mes');
  const [trendGroupBy, setTrendGroupBy] = useState('costCenter');

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', period],
    queryFn: () => dashboardService.getKpis(period),
    refetchInterval: 60_000,
  });

  const { data: trend = [] } = useQuery({
    queryKey: ['dashboard-trend', period],
    queryFn: () => dashboardService.getMonthlyTrend(period),
    enabled: isJefaturaOrAdmin,
  });

  const { data: byCostCenter = [] } = useQuery({
    queryKey: ['dashboard-cc', period],
    queryFn: () => dashboardService.getByCostCenter(period),
    enabled: isJefaturaOrAdmin,
  });

  const { data: topEmployees = [] } = useQuery({
    queryKey: ['dashboard-top', period],
    queryFn: () => dashboardService.getTopEmployees(period),
    enabled: isJefaturaOrAdmin,
  });

  const { data: byType = [] } = useQuery({
    queryKey: ['dashboard-type', period],
    queryFn: () => dashboardService.getByType(period),
    enabled: isJefaturaOrAdmin,
  });

  const { data: trendBySeries } = useQuery({
    queryKey: ['dashboard-trend-by', period, trendGroupBy],
    queryFn: () => dashboardService.getTrendBy(period, trendGroupBy),
    enabled: isJefaturaOrAdmin,
  });
  const trendBy       = trendBySeries?.trend  ?? [];
  const trendByGroups = trendBySeries?.groups ?? [];

  // Meta máxima de horas por período — configurable en Configuración del sistema
  const { data: sysConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
    staleTime: 5 * 60 * 1000,
    enabled: isJefaturaOrAdmin,
  });
  const maxPeriodHours = parseFloat(sysConfig?.max_period_hours ?? 1200);

  if (kpisLoading) return <PageLoader />;

  const approvalRate = kpis
    ? kpis.approvedMonth + kpis.pendingCount > 0
      ? Math.round(kpis.approvedMonth / (kpis.approvedMonth + kpis.pendingCount) * 100)
      : 0
    : 0;

  // Formato corto de fecha para el rango del período (ej. "21 jun")
  const fmtShort = (iso) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '';
  const endLabel     = fmtShort(kpis?.currentPeriodEnd);
  const projEndLabel = fmtShort(kpis?.projectionEnd);

  const projectionTitle =
    period === 'anio' ? 'Proyección anual'
    : period === 'historico' ? 'Total histórico'
    : 'Proyección del período';
  const projectionSubtitle =
    period === 'historico' ? 'acumulado, sin proyección'
    : projEndLabel ? `estimado al cierre (${projEndLabel})`
    : 'estimado al cierre del período';

  // Distribución de horas por estado
  const dist = [
    { label: 'Aprobadas',  val: kpis?.approvedHours ?? 0, seg: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
    { label: 'Pendientes', val: kpis?.pendingHours  ?? 0, seg: 'bg-amber-400',   text: 'text-amber-700',   chip: 'bg-amber-50 text-amber-600',     icon: AlertTriangle },
    { label: 'Rechazadas', val: kpis?.rejectedHours ?? 0, seg: 'bg-red-500',     text: 'text-red-700',     chip: 'bg-red-50 text-red-600',         icon: TrendingDown },
  ];
  const distTotal = dist.reduce((s, d) => s + d.val, 0);

  return (
    <div className="space-y-6">
      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Bienvenido/a, {user?.firstName}.{' '}
            {period === 'mes' && kpis?.currentPeriodLabel ? (
              <>
                Período{' '}
                <span className="font-semibold text-foreground capitalize">{kpis.currentPeriodLabel}</span>
                {kpis?.currentPeriodStart && (
                  <span className="text-xs"> · {fmtShort(kpis.currentPeriodStart)} – {endLabel}</span>
                )}
              </>
            ) : (
              <>Indicadores — <span className="font-medium text-foreground">{PERIOD_LABELS[period]}</span></>
            )}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[170px] gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="anio">Este año</SelectItem>
            <SelectItem value="historico">Histórico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Horas — ${PERIOD_LABELS[period]}`}
          value={formatHoursDecimal(kpis?.monthHours)}
          secondaryValue={kpis?.periodCostCLP != null && (
            <p className="text-sm font-bold text-emerald-700">
              {formatCLP(kpis.periodCostCLP)}{' '}
              <span className="text-xs font-normal text-muted-foreground">costo estimado</span>
            </p>
          )}
          icon={Clock}
          accent="blue"
          trend={period === 'mes' ? kpis?.trend : null}
          subtitle={period === 'mes' && kpis?.trend ? 'vs. período anterior' : undefined}
        />
        <KpiCard
          title={projectionTitle}
          value={formatHoursDecimal(kpis?.projectedHours)}
          secondaryValue={kpis?.projectedCostCLP != null && (
            <p className="text-sm font-bold text-indigo-700">
              {formatCLP(kpis.projectedCostCLP)}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {period === 'historico' ? 'acumulado' : 'proyectado'}
              </span>
            </p>
          )}
          icon={TrendingUp}
          accent="indigo"
          subtitle={projectionSubtitle}
        />
        <KpiCard
          title="Aprobados este mes"
          value={kpis?.approvedMonth ?? 0}
          icon={CheckCircle}
          accent="emerald"
          subtitle={`${approvalRate}% tasa de aprobación`}
        />
        <KpiCard
          title={isAdmin ? 'Registros retenidos' : 'Con alertas'}
          value={isAdmin ? (kpis?.retainedCount ?? 0) : (kpis?.alertsCount ?? 0)}
          icon={isAdmin ? AlertOctagon : AlertTriangle}
          accent={isAdmin ? 'red' : 'purple'}
          subtitle={isAdmin ? 'exceden límite mensual' : 'este mes'}
        />
      </div>

      {/* ── Distribución de horas por estado ────────────────────────────────── */}
      {distTotal > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Distribución de horas — {PERIOD_LABELS[period]}
              </p>
              <p className="text-xs text-muted-foreground">{formatHoursDecimal(distTotal)} totales</p>
            </div>
            {/* Barra proporcional */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              {dist.map((d) => d.val > 0 && (
                <div
                  key={d.label}
                  className={`${d.seg} transition-all`}
                  style={{ width: `${(d.val / distTotal) * 100}%` }}
                  title={`${d.label}: ${formatHoursDecimal(d.val)}`}
                />
              ))}
            </div>
            {/* Detalle */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {dist.map((d) => (
                <div key={d.label} className="flex items-center gap-2.5">
                  <div className={`h-9 w-9 flex items-center justify-center rounded-xl shrink-0 ${d.chip}`}>
                    <d.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-lg font-bold leading-tight ${d.text}`}>{formatHoursDecimal(d.val)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.label} · {distTotal > 0 ? Math.round((d.val / distTotal) * 100) : 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gráficos — solo jefatura y admin ────────────────────────────────── */}
      {isJefaturaOrAdmin && (
        <>
          {/* Tendencia por período (área degradada) */}
          <Card>
            <ChartHeader title={TREND_TITLES[period]}>
              {maxPeriodHours > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-0 w-5 border-t-2 border-dashed border-red-500" />
                  Máximo {formatHoursDecimal(maxPeriodHours)} por período
                </span>
              )}
            </ChartHeader>
            <CardContent>
              {trend.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={trend} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradHoras" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, (dataMax) => Math.ceil(Math.max(dataMax, maxPeriodHours) * 1.1)]}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {maxPeriodHours > 0 && (
                      <ReferenceLine
                        y={maxPeriodHours}
                        stroke="#ef4444"
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        ifOverflow="extendDomain"
                        label={{
                          value: `Máx. ${maxPeriodHours} hrs`,
                          position: 'insideTopRight',
                          fill: '#ef4444',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    )}
                    <Area type="monotone" dataKey="horas" name="Horas" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradHoras)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="aprobados" name="Aprobados" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Evolución por grupo (centro de costo o departamento) */}
          <Card>
            <ChartHeader
              title={`Evolución por ${trendGroupBy === 'department' ? 'departamento' : 'centro de costo'}`}
            >
              <Select value={trendGroupBy} onValueChange={setTrendGroupBy}>
                <SelectTrigger className="w-[190px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="costCenter">Por centro de costo</SelectItem>
                  <SelectItem value="department">Por departamento</SelectItem>
                </SelectContent>
              </Select>
            </ChartHeader>
            <CardContent>
              {trendBy.length === 0 || trendByGroups.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendBy} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {trendByGroups.map((g, i) => (
                      <Line
                        key={g.key}
                        type="monotone"
                        dataKey={g.key}
                        name={g.label}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Horas por centro de costo */}
            <Card>
              <ChartHeader icon={BarChart3} title={`Horas por tipo de trabajo — ${PERIOD_LABELS[period]}`} />
              <CardContent>
                {byCostCenter.length === 0 ? (
                  <EmptyChart text="Sin datos en el período" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byCostCenter} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <defs>
                        <linearGradient id="gradBar" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="horas" name="Horas" fill="url(#gradBar)" radius={[0, 6, 6, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Distribución por tipo de hora */}
            <Card>
              <ChartHeader icon={PieIcon} title={`Distribución por tipo — ${PERIOD_LABELS[period]}`} />
              <CardContent>
                {byType.length === 0 ? (
                  <EmptyChart text="Sin datos en el período" />
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={200}>
                      <PieChart>
                        <Pie data={byType} dataKey="horas" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {byType.map((entry, i) => (
                            <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`${v.toFixed(1)} hrs`, 'Horas']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2.5 flex-1">
                      {byType.map((t, i) => (
                        <div key={t.name} className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full shrink-0" style={{ background: TYPE_COLORS[t.name] ?? COLORS[i % COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.horas.toFixed(1)} hrs · {t.registros} reg.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top empleados */}
          <Card>
            <ChartHeader icon={Users} title={`Top empleados por horas — ${PERIOD_LABELS[period]}`} />
            <CardContent>
              {topEmployees.length === 0 ? (
                <EmptyChart text="Sin datos en el período" />
              ) : (
                <div className="space-y-3">
                  {topEmployees.map((emp, i) => (
                    <div key={emp.name} className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-muted-foreground'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{emp.name}</span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {emp.alertas > 0 && (
                              <Badge variant="warning" className="text-[10px] py-0">{emp.alertas} alertas</Badge>
                            )}
                            <span className="text-sm font-bold tabular-nums">{emp.horas.toFixed(1)} hrs</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                            style={{ width: `${Math.min(100, (emp.horas / (topEmployees[0]?.horas || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Funcionario: vista simplificada ─────────────────────────────────── */}
      {!isJefaturaOrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tu actividad — {PERIOD_LABELS[period]}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Horas registradas</p>
                <p className="text-2xl font-bold">{formatHoursDecimal(kpis?.monthHours)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registros pendientes</p>
                <p className="text-2xl font-bold">{kpis?.pendingCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
