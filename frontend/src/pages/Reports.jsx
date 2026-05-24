import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  FileSpreadsheet, Printer, RefreshCw, Download,
  Users, Clock, DollarSign, FileText,
  ChevronLeft, ChevronRight, CalendarDays, X, Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import * as reportsService from '@/services/reports.service';
import { Building2 } from 'lucide-react';
import { formatCLP, formatHoursDecimal, formatOvertimeType } from '@/utils/formatters';
import { StatusBadge, AlertBadge } from '@/components/common/StatusBadge';
import { useAuth } from '@/context/AuthContext';

// ─── Constantes ───────────────────────────────────────────────────────────────
const TYPE_BADGE = {
  extra:       'bg-blue-100 text-blue-800',
  super_extra: 'bg-amber-100 text-amber-800',
  especial:    'bg-red-100 text-red-800',
};

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const DAY_HEADERS = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

// ─── Helpers calendario ────────────────────────────────────────────────────────
const dateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildWeeks = (year, month) => {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Empezar el lunes antes del primer día
  const start = new Date(first);
  const dow = first.getDay(); // 0=Dom
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks = [];
  const cur = new Date(start);
  while (cur <= last || weeks.length < 4) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > last && weeks.length >= 4) break;
  }
  return weeks;
};

// Color del día según registros
const getDayStyle = (records) => {
  if (!records?.length) return '';
  if (records.some(r => r.alertLevel >= 2 || r.status === 'RETENIDO'))
    return 'bg-red-50 border-red-200';
  if (records.every(r => r.status === 'APROBADO'))
    return 'bg-emerald-50 border-emerald-200';
  if (records.some(r => r.alertLevel === 1))
    return 'bg-amber-50 border-amber-200';
  return 'bg-blue-50 border-blue-200';
};

// Dot de estado
const statusDot = (status) => {
  const cls = {
    APROBADO: 'bg-emerald-500',
    RECHAZADO: 'bg-red-500',
    ANULADO: 'bg-gray-400',
    RETENIDO: 'bg-purple-500',
    ACLARACION_SOLICITADA: 'bg-orange-400',
    PENDIENTE: 'bg-amber-400',
  };
  return cls[status] ?? 'bg-gray-300';
};

// ─── Modal calendario de funcionario ──────────────────────────────────────────
function EmployeeCalendarModal({ employee, filters, open, onClose }) {
  const [viewDate, setViewDate] = useState(() => {
    if (filters?.dateFrom) return new Date(filters.dateFrom + 'T12:00:00');
    return new Date();
  });
  const [selectedDay, setSelectedDay] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-detail', employee?.userId, filters?.dateFrom, filters?.dateTo],
    queryFn: () => reportsService.getEmployeeDetail(employee?.userId, filters),
    enabled: open && !!employee?.userId,
  });

  const byDay = data?.byDay ?? {};
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const weeks = buildWeeks(year, month);

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const totalHours   = data?.records?.reduce((s, r) => s + r.hoursCalculated, 0) ?? 0;
  const approvedCnt  = data?.records?.filter(r => r.status === 'APROBADO').length ?? 0;
  const selectedRecs = selectedDay ? (byDay[selectedDay] ?? []) : [];

  const handleClose = () => {
    setSelectedDay(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                {employee?.name}
                {employee?.employeeId && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · ID {employee.employeeId}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 space-x-1">
                {data?.employee?.department && (
                  <span className="inline-flex items-center gap-0.5 font-medium text-foreground/70">
                    <Building2 className="h-3 w-3" />
                    {data.employee.department.name}
                    {data?.employee?.email ? ' · ' : ''}
                  </span>
                )}
                {data?.employee?.email && <span>{data.employee.email} · </span>}
                Haz clic en un día para ver el detalle
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── Stats rápidos ───────────────────────────────────── */}
              {(data?.records?.length ?? 0) > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border bg-gray-50 py-2">
                    <p className="text-lg font-bold">{data.records.length}</p>
                    <p className="text-[11px] text-muted-foreground">Registros</p>
                  </div>
                  <div className="rounded-lg border bg-gray-50 py-2">
                    <p className="text-lg font-bold">{totalHours.toFixed(1)}h</p>
                    <p className="text-[11px] text-muted-foreground">Horas totales</p>
                  </div>
                  <div className="rounded-lg border bg-gray-50 py-2">
                    <p className="text-lg font-bold text-emerald-600">{approvedCnt}</p>
                    <p className="text-[11px] text-muted-foreground">Aprobados</p>
                  </div>
                </div>
              )}

              {/* ── Calendario ──────────────────────────────────────── */}
              <div className="rounded-lg border overflow-hidden">
                {/* Navegación de mes */}
                <div className="flex items-center justify-between bg-gray-50 border-b px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-semibold capitalize">
                    {MONTH_NAMES[month]} {year}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Cabecera días */}
                <div className="grid grid-cols-7 border-b">
                  {DAY_HEADERS.map(d => (
                    <div key={d} className="py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Semanas */}
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((day, di) => {
                      const ds       = dateStr(day);
                      const inMonth  = day.getMonth() === month;
                      const recs     = byDay[ds];
                      const hasRecs  = !!recs?.length;
                      const isSelected = ds === selectedDay;
                      const dayTotal = hasRecs ? recs.reduce((s, r) => s + r.hoursCalculated, 0) : 0;
                      const dayStyle = getDayStyle(recs);

                      return (
                        <button
                          key={di}
                          disabled={!hasRecs}
                          onClick={() => setSelectedDay(isSelected ? null : ds)}
                          className={[
                            'relative min-h-[58px] p-1.5 text-left border-b border-r text-xs transition-all',
                            inMonth ? '' : 'opacity-25',
                            hasRecs ? `cursor-pointer ${dayStyle}` : 'cursor-default bg-white',
                            isSelected ? 'ring-2 ring-inset ring-blue-500 z-10' : '',
                            hasRecs && !isSelected ? 'hover:brightness-95' : '',
                          ].join(' ')}
                        >
                          <span className={`text-[11px] font-semibold ${isSelected ? 'text-blue-700' : inMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                            {day.getDate()}
                          </span>
                          {hasRecs && (
                            <div className="mt-0.5 space-y-0.5">
                              <span className="block text-[11px] font-bold leading-none">
                                {dayTotal.toFixed(1)}h
                              </span>
                              <div className="flex flex-wrap gap-0.5">
                                {recs.map((r, ri) => (
                                  <span
                                    key={ri}
                                    title={r.status}
                                    className={`w-1.5 h-1.5 rounded-full ${statusDot(r.status)}`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Leyenda */}
                <div className="flex items-center gap-4 px-3 py-2 border-t bg-gray-50 flex-wrap">
                  {[
                    { color: 'bg-emerald-500', label: 'Aprobado' },
                    { color: 'bg-amber-400',   label: 'Pendiente' },
                    { color: 'bg-red-500',      label: 'Rechazado' },
                    { color: 'bg-purple-500',   label: 'Retenido' },
                    { color: 'bg-gray-400',     label: 'Anulado' },
                  ].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Detalle del día seleccionado ─────────────────────── */}
              {selectedDay && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b">
                    <div>
                      <p className="text-sm font-semibold capitalize">
                        {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-CL', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedRecs.length} registro{selectedRecs.length !== 1 ? 's' : ''} ·{' '}
                        {selectedRecs.reduce((s, r) => s + r.hoursCalculated, 0).toFixed(1)} hrs totales
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDay(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="divide-y">
                    {selectedRecs.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Sin registros para este día
                      </p>
                    ) : selectedRecs.map((r) => {
                      const effectiveHrs = r.hoursCalculated * (r.factor ?? 1);
                      const cost = effectiveHrs * (data?.employee?.hourlyRate ?? 5000);
                      return (
                        <div key={r.id} className="px-4 py-3 flex items-start gap-4">
                          {/* Horario */}
                          <div className="shrink-0 pt-0.5">
                            <p className="text-sm font-mono font-semibold">
                              {r.startTime} – {r.endTime}
                            </p>
                            <p className="text-xs text-muted-foreground">{r.hoursCalculated.toFixed(1)} hrs</p>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                className={`text-[10px] ${TYPE_BADGE[r.overtimeType] ?? 'bg-gray-100 text-gray-700'}`}
                                variant="outline"
                              >
                                {formatOvertimeType(r.overtimeType)}
                              </Badge>
                              <StatusBadge status={r.status} />
                              {r.alertLevel > 0 && <AlertBadge level={r.alertLevel} />}
                            </div>
                            {r.cc && (
                              <p className="text-xs text-muted-foreground">
                                📍 {r.cc.code} — {r.cc.name}
                              </p>
                            )}
                            {r.activityDescription && (
                              <p className="text-xs text-muted-foreground truncate" title={r.activityDescription}>
                                {r.activityDescription}
                              </p>
                            )}
                          </div>

                          {/* Costo */}
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-bold">{effectiveHrs.toFixed(1)}h ef.</p>
                            <p className="text-xs text-muted-foreground">{formatCLP(Math.round(cost))}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sin datos */}
              {!isLoading && (data?.records?.length ?? 0) === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <CalendarDays className="h-10 w-10 opacity-30" />
                  <p>Sin registros en el período seleccionado</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="outline" onClick={handleClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color = 'text-blue-500' }) => (
  <Card>
    <CardContent className="flex items-center gap-4 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrador';

  const [filters, setFilters]               = useState({});
  const [isDownloading, setIsDownloading]   = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [nameSearch, setNameSearch]         = useState('');

  const { register, handleSubmit, setValue } = useForm({
    defaultValues: { dateFrom: '', dateTo: '', status: '', departmentId: '' },
  });

  const { data: departmentsData = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: reportsService.getDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ['reports-summary', filters],
    queryFn: () => reportsService.getSummary(filters),
    enabled: true,
    retry: false,
  });

  // ── Filtros ────────────────────────────────────────────────────────────────
  const onSubmit = (values) => {
    const clean = {};
    if (values.dateFrom)     clean.dateFrom     = values.dateFrom;
    if (values.dateTo)       clean.dateTo       = values.dateTo;
    if (values.status)       clean.status       = values.status;
    if (values.departmentId) clean.departmentId = values.departmentId;
    setFilters(clean);
  };

  // ── Descargar Excel ────────────────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const response = await reportsService.downloadExcel(filters);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horas-extras-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Excel descargado', variant: 'success' });
    } catch {
      toast({ title: 'Error al descargar', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const totals = summary?.totals;
  const allEmployees = summary?.employees ?? [];
  const employees = nameSearch.trim()
    ? allEmployees.filter(e =>
        e.name?.toLowerCase().includes(nameSearch.trim().toLowerCase())
      )
    : allEmployees;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Reportes de horas extras
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Filtra, revisa y exporta. Haz clic en un funcionario para ver su calendario.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Imprimir
          </Button>
          <Button size="sm" onClick={handleDownloadExcel} disabled={isDownloading}>
            {isDownloading
              ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
              : <Download className="h-4 w-4 mr-1.5" />}
            Descargar Excel
          </Button>
        </div>
      </div>

      {/* Encabezado impresión */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-center">REPORTE DE HORAS EXTRAS — COOPREL</h1>
        <p className="text-xs text-center text-gray-500 mt-1">
          Generado: {new Date().toLocaleString('es-CL')}
          {filters.dateFrom && ` | Desde: ${filters.dateFrom}`}
          {filters.dateTo   && ` | Hasta: ${filters.dateTo}`}
        </p>
        <hr className="my-3" />
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom" className="text-xs">Desde</Label>
              <Input id="dateFrom" type="date" className="h-9 text-sm" {...register('dateFrom')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo" className="text-xs">Hasta</Label>
              <Input id="dateTo" type="date" className="h-9 text-sm" {...register('dateTo')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Departamento</Label>
              <Select onValueChange={(v) => setValue('departmentId', v === '_all_' ? '' : v)} defaultValue="_all_">
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all_">Todos los departamentos</SelectItem>
                  {departmentsData.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      <span className="font-mono text-[10px] text-muted-foreground mr-1">{d.code}</span>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Select onValueChange={(v) => setValue('status', v === '_all_' ? '' : v)} defaultValue="_all_">
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all_">Todos los estados</SelectItem>
                  <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                  <SelectItem value="APROBADO">Aprobado</SelectItem>
                  <SelectItem value="RECHAZADO">Rechazado</SelectItem>
                  <SelectItem value="ACLARACION_SOLICITADA">Aclaración solicitada</SelectItem>
                  <SelectItem value="RETENIDO">Retenido</SelectItem>
                  <SelectItem value="ANULADO">Anulado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Buscar funcionario</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Nombre o apellido..."
                  className="h-9 text-sm pl-8"
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                />
                {nameSearch && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setNameSearch('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" className="h-9 flex-1">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aplicar
              </Button>
              <Button
                type="button" variant="ghost" size="sm" className="h-9"
                onClick={() => {
                  setValue('dateFrom', '');  setValue('dateTo', '');
                  setValue('status', '');    setValue('departmentId', '');
                  setNameSearch('');
                  setFilters({});
                }}
              >
                Limpiar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      {totals && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total registros"     value={totals.records}                          icon={FileSpreadsheet} color="text-blue-500" />
          <StatCard title="Total funcionarios"  value={employees.length}                         icon={Users}           color="text-purple-500" />
          <StatCard title="Horas registradas"   value={formatHoursDecimal(totals.totalHours)}   icon={Clock}           color="text-amber-500" />
          <StatCard title="Costo estimado"      value={formatCLP(totals.estimatedCost)}         icon={DollarSign}      color="text-emerald-500" />
        </div>
      )}

      {/* ── Tabla resumen ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Resumen por funcionario
            {allEmployees.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({employees.length}{employees.length !== allEmployees.length ? ` de ${allEmployees.length}` : ''} persona{employees.length !== 1 ? 's' : ''})
              </span>
            )}
            <span className="ml-auto text-xs font-normal text-muted-foreground hidden sm:block">
              Haz clic en una fila para ver el calendario
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Cargando datos…
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <FileText className="h-10 w-10 opacity-30" />
              <p>No hay registros para los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Funcionario</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Departamento</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Registros</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Hrs totales</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Hrs efectivas</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Aprobadas</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Pendientes</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Por tipo</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Costo est.</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedEmployee(emp)}
                      className="border-b last:border-0 hover:bg-blue-50/60 cursor-pointer transition-colors group"
                      title="Ver calendario de horas extras"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium group-hover:text-blue-700 flex items-center gap-1.5">
                          {emp.name}
                          <CalendarDays className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                        </div>
                        {emp.employeeId && (
                          <div className="text-xs text-muted-foreground">ID {emp.employeeId}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {emp.department ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              <Building2 className="h-3 w-3 shrink-0" />
                              {emp.department.code}
                            </span>
                            <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight max-w-[180px] truncate" title={emp.department.name}>
                              {emp.department.name}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{emp.records}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatHoursDecimal(emp.totalHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatHoursDecimal(emp.effectiveHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                        {formatHoursDecimal(emp.approvedHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                        {formatHoursDecimal(emp.pendingHours)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(emp.byType ?? {}).map(([code, hrs]) => (
                            <span
                              key={code}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[code] ?? 'bg-gray-100 text-gray-700'}`}
                            >
                              {formatOvertimeType(code)}: {Number(hrs).toFixed(1)}h
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {formatCLP(emp.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {totals && (
                  <tfoot>
                    <tr className="border-t-2 bg-blue-50">
                      <td className="px-4 py-3 font-bold">TOTAL ({totals.records} registros)</td>
                      <td className="hidden md:table-cell" />
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{totals.records}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatHoursDecimal(totals.totalHours)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatHoursDecimal(totals.effectiveHours)}</td>
                      <td colSpan={3} />
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatCLP(totals.estimatedCost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pie impresión */}
      <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t">
        Sistema de Horas Extras — COOPREL &nbsp;|&nbsp; Documento generado automáticamente
      </div>

      {/* ── Modal calendario ─────────────────────────────────────────────── */}
      <EmployeeCalendarModal
        employee={selectedEmployee}
        filters={filters}
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />
    </div>
  );
}
