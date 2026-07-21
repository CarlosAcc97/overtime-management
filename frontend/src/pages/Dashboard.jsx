import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
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
  DollarSign, AlertOctagon, Users,
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
const TYPE_COLORS = { 'Horas extras': '#3b82f6', 'Super extras': '#f59e0b', 'Especiales': '#ef4444' };

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, subtitle, icon: Icon, iconColor = 'text-blue-500', trend }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className={`h-4 w-4 ${iconColor}`} />
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {trend !== null && trend !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${parseFloat(trend) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {parseFloat(trend) > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(parseFloat(trend))}%
          </span>
        )}
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </CardContent>
  </Card>
);

// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name.toLowerCase().includes('hora') ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin           = user?.role === 'administrador';
  const isJefaturaOrAdmin = ['jefatura', 'administrador'].includes(user?.role);

  const [period, setPeriod] = useState('mes');

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

  const { data: costProj } = useQuery({
    queryKey: ['dashboard-cost', period],
    queryFn: () => dashboardService.getCostProjection(period),
    enabled: isAdmin,
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Bienvenido/a, {user?.firstName}. Indicadores — <span className="font-medium text-foreground">{PERIOD_LABELS[period]}</span>
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="anio">Este año</SelectItem>
            <SelectItem value="historico">Histórico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Horas — ${PERIOD_LABELS[period]}`}
          value={formatHoursDecimal(kpis?.monthHours)}
          icon={Clock}
          iconColor="text-blue-500"
          trend={period === 'mes' ? kpis?.trend : null}
          subtitle={period === 'mes' && kpis?.trend ? 'vs. período anterior' : undefined}
        />
        <KpiCard
          title="Registros pendientes"
          value={kpis?.pendingCount ?? 0}
          icon={AlertTriangle}
          iconColor="text-amber-500"
          subtitle="requieren acción"
        />
        <KpiCard
          title="Aprobados este mes"
          value={kpis?.approvedMonth ?? 0}
          icon={CheckCircle}
          iconColor="text-emerald-500"
          subtitle={`${approvalRate}% tasa de aprobación`}
        />
        <KpiCard
          title={isAdmin ? 'Registros retenidos' : 'Con alertas'}
          value={isAdmin ? (kpis?.retainedCount ?? 0) : (kpis?.alertsCount ?? 0)}
          icon={isAdmin ? AlertOctagon : TrendingUp}
          iconColor={isAdmin ? 'text-red-500' : 'text-purple-500'}
          subtitle={isAdmin ? 'exceden límite mensual' : 'este mes'}
        />
      </div>

      {/* Distribución de horas por estado */}
      {kpis && (kpis.approvedHours > 0 || kpis.pendingHours > 0 || kpis.rejectedHours > 0) && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Distribución de horas — {PERIOD_LABELS[period]}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-100 shrink-0">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-700">{formatHoursDecimal(kpis.approvedHours)}</p>
                  <p className="text-[11px] text-muted-foreground">Aprobadas</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-amber-100 shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-700">{formatHoursDecimal(kpis.pendingHours)}</p>
                  <p className="text-[11px] text-muted-foreground">Pendientes</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-red-100 shrink-0">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-red-700">{formatHoursDecimal(kpis.rejectedHours)}</p>
                  <p className="text-[11px] text-muted-foreground">Rechazadas</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proyección de costo — solo admin */}
      {isAdmin && costProj && (
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Proyección de costo — {costProj.month}</p>
              <p className="text-2xl font-bold text-blue-700">{formatCLP(costProj.totalCostCLP)}</p>
              <p className="text-xs text-muted-foreground">Basado en horas aprobadas + pendientes × tarifa por empleado</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos — solo jefatura y admin */}
      {isJefaturaOrAdmin && (
        <>
          {/* Tendencia por período */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{TREND_TITLES[period]}</CardTitle>
              {maxPeriodHours > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-0 w-5 border-t-2 border-dashed border-red-500" />
                  Máximo {formatHoursDecimal(maxPeriodHours)} por período
                </span>
              )}
            </CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin datos suficientes</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trend} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    {/* El dominio incluye la meta para que la línea siempre sea visible */}
                    <YAxis
                      tick={{ fontSize: 11 }}
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
                    <Line type="monotone" dataKey="horas" name="Horas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="aprobados" name="Aprobados" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Horas por centro de costo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horas por tipo de trabajo — mes actual</CardTitle>
              </CardHeader>
              <CardContent>
                {byCostCenter.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin datos este mes</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byCostCenter} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="horas" name="Horas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Distribución por tipo de hora */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribución por tipo — mes actual</CardTitle>
              </CardHeader>
              <CardContent>
                {byType.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin datos este mes</div>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={200}>
                      <PieChart>
                        <Pie data={byType} dataKey="horas" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {byType.map((entry, i) => (
                            <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`${v.toFixed(1)} hrs`, 'Horas']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 flex-1">
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
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Top empleados por horas — mes actual
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topEmployees.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">Sin datos este mes</div>
              ) : (
                <div className="space-y-2">
                  {topEmployees.map((emp, i) => (
                    <div key={emp.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium truncate">{emp.name}</span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {emp.alertas > 0 && (
                              <Badge variant="warning" className="text-[10px] py-0">{emp.alertas} alertas</Badge>
                            )}
                            <span className="text-sm font-bold">{emp.horas.toFixed(1)} hrs</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
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

      {/* Funcionario: vista simplificada */}
      {!isJefaturaOrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tu actividad este mes</CardTitle>
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
