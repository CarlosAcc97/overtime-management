import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as approvalService from '@/services/approvals.service';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, AlertBadge } from '@/components/common/StatusBadge';
import { PageLoader } from '@/components/common/LoadingSpinner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CheckSquare, XCircle, MessageSquare, Eye, RefreshCw,
  AlertTriangle, Clock, CheckCircle, Calendar, Shield, Tag,
} from 'lucide-react';
import { formatHoursDecimal, formatOvertimeType, formatStatus } from '@/utils/formatters';
import { useAuth } from '@/context/AuthContext';

// ─── Categorías de actividad ──────────────────────────────────────────────────
const ACTIVITY_CATEGORIES = [
  'Trabajo Administrativo',
  'Contingencia',
  'Atención de Reclamo',
  'Planificación Deficiente',
  'Requerimientos Urgentes',
];

// ─── Esquemas de validación ───────────────────────────────────────────────────
const approveSchema = z.object({
  activityCategory: z.string().min(1, 'Selecciona una categoría'),
  excessJustification: z.string().optional(),
  comment: z.string().min(10, 'El comentario es obligatorio (mínimo 10 caracteres)'),
});

const actionSchema = z.object({
  comment: z.string().min(10, 'El comentario es obligatorio (mínimo 10 caracteres)'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const alertBorderClass = (level) => {
  if (level >= 3) return 'border-l-4 border-l-purple-500';
  if (level === 2) return 'border-l-4 border-l-red-500';
  if (level === 1) return 'border-l-4 border-l-amber-400';
  return '';
};

const ApproveDialog = ({ record, onClose, onSuccess }) => {
  const needsExcess = record.alertLevel >= 1;
  const isSecondApproval = record.requiresDoubleValidation && record.firstApprovalBy;

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      activityCategory: '',
      excessJustification: '',
      comment: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => approvalService.approveRecord(record.id, data),
    onSuccess: (updated) => {
      toast({
        title: isSecondApproval ? 'Segunda validación completada' : 'Registro aprobado',
        description: `Horas extras del ${record.date} aprobadas correctamente.`,
        variant: 'success',
      });
      onSuccess(updated);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            {isSecondApproval ? 'Segunda validación' : 'Aprobar registro'}
          </DialogTitle>
          <DialogDescription>
            {record.user?.firstName} {record.user?.lastName} — {record.date} · {record.startTime}–{record.endTime} · {formatHoursDecimal(record.hoursCalculated)}
          </DialogDescription>
        </DialogHeader>

        {isSecondApproval && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Este registro ya tiene una primera aprobación. Como segunda validación, estás completando el proceso de doble aprobación.
            </AlertDescription>
          </Alert>
        )}

        {record.alertLevel >= 1 && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Registro con <strong>alerta nivel {record.alertLevel}</strong>. Se requiere justificación de exceso.
            </AlertDescription>
          </Alert>
        )}

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error?.response?.data?.message || 'Error al aprobar'}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Detalle de la actividad — lista desplegable */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              Detalle de la actividad *
            </Label>
            <Select onValueChange={(val) => setValue('activityCategory', val, { shouldValidate: true })}>
              <SelectTrigger className={errors.activityCategory ? 'border-destructive' : ''}>
                <SelectValue placeholder="Selecciona el motivo de la hora extra..." />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.activityCategory && (
              <p className="text-xs text-destructive">{errors.activityCategory.message}</p>
            )}
          </div>

          {/* Justificación de exceso — solo si hay alerta */}
          {needsExcess && (
            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <Label className="text-amber-900">
                Justificación de exceso de tope diario *
                <span className="ml-1 text-xs font-normal">(mínimo 30 caracteres)</span>
              </Label>
              <Textarea
                {...register('excessJustification')}
                placeholder="Explica por qué fue necesario superar el límite diario de horas extras..."
                rows={2}
                className="bg-white border-amber-300"
              />
              {errors.excessJustification && (
                <p className="text-xs text-destructive">{errors.excessJustification.message}</p>
              )}
            </div>
          )}

          {/* Comentario de aprobación */}
          <div className="space-y-1">
            <Label>
              Comentario *
              <span className="ml-1 text-xs font-normal text-muted-foreground">(mínimo 10 caracteres)</span>
            </Label>
            <Textarea
              {...register('comment')}
              placeholder="Comentario de aprobación..."
              rows={2}
              className={errors.comment ? 'border-destructive' : ''}
            />
            {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting || mutation.isPending}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {mutation.isPending ? 'Aprobando...' : (isSecondApproval ? 'Completar validación' : 'Aprobar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ActionDialog = ({ record, action, onClose, onSuccess }) => {
  const isReject = action === 'reject';
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(actionSchema),
  });

  const mutation = useMutation({
    mutationFn: (data) => isReject
      ? approvalService.rejectRecord(record.id, data)
      : approvalService.requestClarification(record.id, data),
    onSuccess: (updated) => {
      toast(isReject
        ? { title: 'Registro rechazado', description: 'Se notificó al administrador.', variant: 'destructive' }
        : { title: 'Aclaración solicitada', description: 'Se enviará notificación al administrador.', variant: 'default' }
      );
      onSuccess(updated);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReject
              ? <><XCircle className="h-5 w-5 text-destructive" /> Rechazar registro</>
              : <><MessageSquare className="h-5 w-5 text-blue-600" /> Solicitar aclaración</>
            }
          </DialogTitle>
          <DialogDescription>
            {record.user?.firstName} {record.user?.lastName} — {record.date} · {formatHoursDecimal(record.hoursCalculated)}
          </DialogDescription>
        </DialogHeader>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error?.response?.data?.message || 'Error al procesar'}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>
              {isReject ? 'Motivo del rechazo *' : 'Comentario / Aclaración solicitada *'}
              <span className="ml-1 text-xs font-normal text-muted-foreground">(mínimo 10 caracteres)</span>
            </Label>
            <Textarea
              {...register('comment')}
              placeholder={isReject
                ? 'Explica el motivo del rechazo...'
                : 'Indica qué información o aclaración necesitas del administrador...'
              }
              rows={3}
              className={errors.comment ? 'border-destructive' : ''}
            />
            {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              variant={isReject ? 'destructive' : 'default'}
              disabled={isSubmitting || mutation.isPending}
            >
              {mutation.isPending
                ? 'Procesando...'
                : isReject ? 'Rechazar' : 'Solicitar aclaración'
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ApprovalInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [approveTarget, setApproveTarget] = useState(null);
  const [actionTarget, setActionTarget] = useState(null); // { record, action: 'reject'|'clarify' }
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['approvals', { page, dateFrom, dateTo }],
    queryFn: () => approvalService.getPendingApprovals({ page, limit: 15, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    keepPreviousData: true,
  });

  const { data: stats } = useQuery({
    queryKey: ['approval-stats'],
    queryFn: approvalService.getApprovalStats,
  });

  const records = data?.data ?? [];
  const pagination = data?.pagination;

  const handleActionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    queryClient.invalidateQueries({ queryKey: ['approval-stats'] });
    queryClient.invalidateQueries({ queryKey: ['overtime'] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckSquare className="h-6 w-6" /> Bandeja de aprobación
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registros pendientes de validación
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-500 shrink-0" />
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
                <AlertTriangle className="h-8 w-8 text-red-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{stats.retainedCount}</p>
                  <p className="text-xs text-muted-foreground">Retenidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {user?.role === 'administrador' && (
            <Card className="col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-8 w-8 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-2xl font-bold">{stats.needsSecondApproval}</p>
                    <p className="text-xs text-muted-foreground">2ª validación</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filtros de fecha */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
        <span className="text-muted-foreground text-sm">—</span>
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Limpiar</Button>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Error al cargar registros. <Button variant="link" className="p-0 h-auto" onClick={() => refetch()}>Reintentar</Button></AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 text-left">Funcionario</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Horario</th>
                  <th className="px-4 py-3 text-center">Horas</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Tipo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <CheckCircle className="h-10 w-10 opacity-30" />
                        <p className="font-medium">Sin registros pendientes</p>
                        <p className="text-xs">No hay registros que requieran tu acción en este momento</p>
                      </div>
                    </td>
                  </tr>
                ) : records.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${alertBorderClass(r.alertLevel)}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user?.firstName} {r.user?.lastName}</div>
                      <div className="text-xs text-muted-foreground">{r.user?.employeeId || r.user?.email}</div>
                      {r.requiresDoubleValidation && (
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {r.firstApprovalBy ? '2ª validación' : 'Doble validación'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </div>
                      {r.alertLevel > 0 && <AlertBadge level={r.alertLevel} />}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.startTime} – {r.endTime}</td>
                    <td className="px-4 py-3 text-center font-bold">{formatHoursDecimal(r.hoursCalculated)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="text-xs">{formatOvertimeType(r.overtimeType)}</div>
                      <div className="text-xs text-muted-foreground">× {r.factor}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/mis-horas/${r.id}`)} title="Ver detalle">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setApproveTarget(r)}
                          title="Aprobar"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => setActionTarget({ record: r, action: 'clarify' })}
                          title="Solicitar aclaración"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-red-50"
                          onClick={() => setActionTarget({ record: r, action: 'reject' })}
                          title="Rechazar"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
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
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {approveTarget && (
        <ApproveDialog
          record={approveTarget}
          onClose={() => setApproveTarget(null)}
          onSuccess={handleActionSuccess}
        />
      )}
      {actionTarget && (
        <ActionDialog
          record={actionTarget.record}
          action={actionTarget.action}
          onClose={() => setActionTarget(null)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}
