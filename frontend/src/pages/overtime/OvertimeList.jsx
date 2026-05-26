import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as overtimeService from '@/services/overtime.service';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, AlertBadge } from '@/components/common/StatusBadge';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Plus, Clock, Calendar, RefreshCw, Pencil, XCircle,
  Eye, TrendingUp, AlertTriangle, CheckCircle,
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle as XCircleIcon,
  AlertCircle, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatHoursDecimal, formatOvertimeType, formatStatus } from '@/utils/formatters';
import { useAuth } from '@/context/AuthContext';

// ─── Diálogo de carga masiva ──────────────────────────────────────────────────
function BulkUploadDialog({ open, onClose, onSuccess }) {
  const fileRef        = useRef(null);
  const [file, setFile]       = useState(null);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const handleClose = () => {
    setFile(null);
    setResults(null);
    onClose();
  };

  // Descarga plantilla
  const downloadMutation = useMutation({
    mutationFn: overtimeService.downloadBulkTemplate,
    onError: () => toast({ title: 'Error al descargar la plantilla', variant: 'destructive' }),
  });

  // Sube archivo
  const uploadMutation = useMutation({
    mutationFn: (f) => overtimeService.uploadBulkFile(f),
    onSuccess: (res) => {
      setResults(res.data);
      if (res.data.created > 0) {
        onSuccess();
        toast({
          title: `${res.data.created} registro${res.data.created !== 1 ? 's' : ''} creado${res.data.created !== 1 ? 's' : ''}`,
          description: res.data.skipped > 0
            ? `${res.data.skipped} fila${res.data.skipped !== 1 ? 's' : ''} con errores — revisa la tabla.`
            : 'Todos los registros se procesaron correctamente.',
          variant: res.data.skipped === 0 ? 'success' : 'default',
        });
      } else {
        toast({
          title: 'Sin registros creados',
          description: 'Todas las filas tienen errores. Corrige el archivo y vuelve a intentarlo.',
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: 'Error al procesar el archivo',
        description: err?.response?.data?.message || 'Verifica que el archivo sea .xlsx válido.',
        variant: 'destructive',
      });
    },
  });

  const okRows  = results?.results?.filter(r => r.estado === 'ok')    ?? [];
  const errRows = results?.results?.filter(r => r.estado === 'error') ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Carga masiva de horas extras
          </DialogTitle>
          <DialogDescription>
            Descarga la plantilla Excel, complétala con los registros del día y súbela aquí para procesarlos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ── Paso 1: Plantilla ──────────────────────────────────────────── */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
              Descarga la plantilla
            </p>
            <p className="text-xs text-muted-foreground ml-7">
              Contiene la estructura correcta, lista de funcionarios, tipos de hora extra y centros de costo.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-7"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Descargando…</>
                : <><Download className="mr-2 h-4 w-4" /> Descargar plantilla Excel</>
              }
            </Button>
          </div>

          {/* ── Paso 2: Subir archivo ──────────────────────────────────────── */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
              Sube el archivo completado
            </p>

            {/* Zona de arrastre */}
            <div
              className="ml-7 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-8 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped?.name.endsWith('.xlsx')) setFile(dropped);
                else toast({ title: 'Solo se aceptan archivos .xlsx', variant: 'destructive' });
              }}
            >
              <Upload className="h-8 w-8 text-gray-400 mb-2" />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-blue-600">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Arrastra tu archivo aquí o haz clic</p>
                  <p className="text-xs text-muted-foreground mt-1">Solo archivos .xlsx — máximo 5 MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) { setFile(f); setResults(null); }
              }}
            />

            {file && !uploadMutation.isPending && (
              <div className="ml-7 flex items-center gap-2">
                <Button
                  onClick={() => uploadMutation.mutate(file)}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="mr-2 h-4 w-4" /> Procesar archivo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setResults(null); fileRef.current.value = ''; }}>
                  Cambiar archivo
                </Button>
              </div>
            )}

            {uploadMutation.isPending && (
              <div className="ml-7 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Procesando filas…
              </div>
            )}
          </div>

          {/* ── Resultados ─────────────────────────────────────────────────── */}
          {results && (
            <div className="rounded-lg border overflow-hidden">
              {/* Resumen */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> {results.created} creados
                  </span>
                  {results.skipped > 0 && (
                    <span className="flex items-center gap-1 font-semibold text-red-600">
                      <AlertCircle className="h-4 w-4" /> {results.skipped} con error
                    </span>
                  )}
                  <span className="text-muted-foreground">de {results.total} filas</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)}>
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {expanded && (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-muted-foreground uppercase">
                        <th className="px-3 py-2 text-left w-12">Fila</th>
                        <th className="px-3 py-2 text-left">Funcionario</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Hrs</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Estado / Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.results.map((r) => (
                        <tr key={r.fila} className={r.estado === 'ok' ? 'bg-emerald-50/40' : 'bg-red-50/40'}>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.fila}</td>
                          <td className="px-3 py-1.5 font-medium">{r.funcionario}</td>
                          <td className="px-3 py-1.5">{r.fecha || '—'}</td>
                          <td className="px-3 py-1.5">
                            {r.horas != null ? formatHoursDecimal(r.horas) : '—'}
                          </td>
                          <td className="px-3 py-1.5">{r.tipo || '—'}</td>
                          <td className="px-3 py-1.5">
                            {r.estado === 'ok' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                <StatusBadge status={r.status} />
                                {r.alertLevel > 0 && <AlertBadge level={r.alertLevel} />}
                              </span>
                            ) : (
                              <span className="inline-flex items-start gap-1 text-red-700">
                                <XCircleIcon className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{r.errors?.join(' · ')}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={handleClose}>
            {results ? 'Cerrar' : 'Cancelar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function OvertimeList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError]   = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulk, setShowBulk]         = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overtime', { page, statusFilter, dateFrom, dateTo }],
    queryFn: () => overtimeService.getOvertimeRecords({
      page,
      limit: 15,
      status: statusFilter === 'all' ? undefined : statusFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    keepPreviousData: true,
  });

  const { data: stats } = useQuery({
    queryKey: ['overtime-stats'],
    queryFn: overtimeService.getMyStats,
  });

  const cancelMutation = useMutation({
    mutationFn: () => overtimeService.cancelOvertime(cancelTarget.id, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-stats'] });
      setCancelTarget(null);
      setCancelReason('');
      toast({ title: 'Registro anulado', variant: 'success' });
    },
    onError: (err) => setCancelError(err.response?.data?.message || 'Error al anular'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => overtimeService.deleteOvertimeRecord(deleteTarget.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cancelled-count'] });
      setDeleteTarget(null);
      toast({ title: 'Registro eliminado permanentemente', variant: 'success' });
    },
    onError: (err) => toast({
      title: 'Error al eliminar',
      description: err?.response?.data?.message || 'No se pudo eliminar el registro.',
      variant: 'destructive',
    }),
  });

  const records    = data?.data ?? [];
  const pagination = data?.pagination;

  const canEdit   = (r) => ['PENDIENTE', 'ACLARACION_SOLICITADA'].includes(r.status);
  const canCancel = (r) => !['ANULADO', 'RECHAZADO'].includes(r.status);

  const alertColor = (level) => {
    if (level === 1) return 'border-l-4 border-l-amber-400';
    if (level >= 2)  return 'border-l-4 border-l-red-500';
    return '';
  };

  const handleBulkSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['overtime'] });
    queryClient.invalidateQueries({ queryKey: ['overtime-stats'] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" /> Mis horas extras
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Historial de registros y su estado de aprobación
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {user?.role === 'administrador' && (
            <>
              <Button variant="outline" onClick={() => setShowBulk(true)}>
                <Upload className="mr-2 h-4 w-4" /> Carga masiva
              </Button>
              <Button onClick={() => navigate('/mis-horas/nuevo')}>
                <Plus className="mr-2 h-4 w-4" /> Registrar horas
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPIs rápidos */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-amber-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{stats.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-blue-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{formatHoursDecimal(stats.monthHours)}</p>
                  <p className="text-xs text-muted-foreground">Este mes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filtrar estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="PENDIENTE">Pendiente</SelectItem>
            <SelectItem value="APROBADO">Aprobado</SelectItem>
            <SelectItem value="RECHAZADO">Rechazado</SelectItem>
            <SelectItem value="ACLARACION_SOLICITADA">Aclaración solicitada</SelectItem>
            <SelectItem value="RETENIDO">Retenido</SelectItem>
            <SelectItem value="ANULADO">Anulado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 flex-1">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="flex-1" />
          <span className="text-muted-foreground text-sm">—</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="flex-1" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Error al cargar registros.{' '}
            <Button variant="link" className="p-0 h-auto" onClick={() => refetch()}>Reintentar</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 text-left">Fecha</th>
                  {user?.role !== 'funcionario' && (
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Funcionario</th>
                  )}
                  <th className="px-4 py-3 text-left">Horario</th>
                  <th className="px-4 py-3 text-center">Horas</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Tipo</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Actividad</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role !== 'funcionario' ? 8 : 7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Clock className="h-10 w-10 opacity-30" />
                        <p className="font-medium">Sin registros</p>
                        <p className="text-xs">
                          {user?.role === 'administrador'
                            ? 'Usa "Registrar horas" o "Carga masiva" para agregar registros'
                            : 'Aún no tienes registros de horas extras'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : records.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${alertColor(r.alertLevel)}`}>
                    <td className="px-4 py-3 font-medium">
                      <div>
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-CL', {
                          weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </div>
                      {r.alertLevel > 0 && <AlertBadge level={r.alertLevel} />}
                    </td>
                    {user?.role !== 'funcionario' && (
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="font-medium text-sm">
                          {r.user?.firstName} {r.user?.lastName}
                        </div>
                        {r.user?.employeeId && (
                          <div className="text-xs text-muted-foreground">ID {r.user.employeeId}</div>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.startTime} – {r.endTime}
                    </td>
                    <td className="px-4 py-3 text-center font-bold">
                      {formatHoursDecimal(r.hoursCalculated)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge
                        variant={
                          r.overtimeType === 'extra' ? 'secondary'
                          : r.overtimeType === 'super_extra' ? 'warning'
                          : 'danger'
                        }
                        className="text-xs"
                      >
                        {formatOvertimeType(r.overtimeType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="max-w-[200px] truncate text-muted-foreground" title={r.activityDescription}>
                        {r.activityDescription}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => navigate(`/mis-horas/${r.id}`)}
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {user?.role === 'administrador' && canEdit(r) && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => navigate(`/mis-horas/${r.id}/editar`)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canCancel(r) && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setCancelTarget(r); setCancelError(''); }}
                            title="Anular"
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                        {user?.role === 'administrador' && r.status === 'ANULADO' && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setDeleteTarget(r)}
                            title="Eliminar permanentemente"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {pagination.total} registros · Página {pagination.page} de {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog anulación */}
      <Dialog open={!!cancelTarget} onOpenChange={() => { setCancelTarget(null); setCancelReason(''); setCancelError(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular registro</DialogTitle>
            <DialogDescription>
              Registro del {cancelTarget?.date} · {cancelTarget?.hoursCalculated} hrs ·{' '}
              <StatusBadge status={cancelTarget?.status} />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Motivo de anulación *{' '}
                <span className="text-xs font-normal text-muted-foreground">(mínimo 10 caracteres)</span>
              </Label>
              <Textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Explica el motivo de la anulación..."
                rows={3}
              />
            </div>
            {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={cancelReason.length < 10 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Anulando...' : 'Anular registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog carga masiva */}
      <BulkUploadDialog
        open={showBulk}
        onClose={() => setShowBulk(false)}
        onSuccess={handleBulkSuccess}
      />

      {/* Dialog eliminar permanentemente */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro del{' '}
              <strong>
                {deleteTarget && new Date(deleteTarget.date + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'long', day: '2-digit', month: 'long',
                })}
              </strong>{' '}
              de <strong>{deleteTarget?.user?.firstName} {deleteTarget?.user?.lastName}</strong> ({deleteTarget?.hoursCalculated} hrs).
              <br /><br />
              Esta acción es <strong>irreversible</strong>. El registro y su historial de validaciones serán eliminados de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteMutation.isPending ? 'Eliminando…' : 'Sí, eliminar permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
