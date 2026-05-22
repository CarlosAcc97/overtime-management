import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as overtimeService from '@/services/overtime.service';
import * as approvalService from '@/services/approvals.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge, AlertBadge } from '@/components/common/StatusBadge';
import { PageLoader } from '@/components/common/LoadingSpinner';
import {
  ArrowLeft, Pencil, Clock, Calendar, User, Building2,
  FileText, AlertTriangle, CheckSquare, MessageSquare,
} from 'lucide-react';
import { formatHoursDecimal, formatOvertimeType, formatStatus } from '@/utils/formatters';
import { useAuth } from '@/context/AuthContext';

const InfoRow = ({ label, value, className = '' }) => (
  <div className={`flex flex-col gap-0.5 ${className}`}>
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
    <span className="text-sm font-medium">{value ?? '—'}</span>
  </div>
);

const actionLabel = (action) => {
  const labels = {
    APROBAR: 'Aprobó',
    RECHAZAR: 'Rechazó',
    SOLICITAR_ACLARACION: 'Solicitó aclaración',
  };
  return labels[action] || action;
};

const actionColor = (action) => {
  if (action === 'APROBAR') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (action === 'RECHAZAR') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-blue-700 bg-blue-50 border-blue-200';
};

export default function OvertimeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['overtime', id],
    queryFn: () => overtimeService.getOvertimeById(id),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['approval-history', id],
    queryFn: () => approvalService.getApprovalHistory(id),
    enabled: !!id,
  });

  if (isLoading) return <PageLoader />;
  if (isError || !record) return (
    <div className="text-center py-20 text-muted-foreground">
      <p>Registro no encontrado o sin acceso</p>
      <Button variant="link" onClick={() => navigate('/mis-horas')}>Volver</Button>
    </div>
  );

  const canEdit = user.role === 'administrador' && ['PENDIENTE', 'ACLARACION_SOLICITADA'].includes(record.status);
  const needsClarification = record.status === 'ACLARACION_SOLICITADA';

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Detalle de registro #{record.id}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={record.status} />
            {record.alertLevel > 0 && <AlertBadge level={record.alertLevel} />}
            {record.requiresDoubleValidation && (
              <Badge variant="outline">Doble validación</Badge>
            )}
            {record.firstApprovalBy && record.status === 'PENDIENTE' && (
              <Badge variant="outline" className="text-blue-700 border-blue-300">1ª aprobación OK — esperando 2ª</Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => navigate(`/mis-horas/${id}/editar`)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </Button>
        )}
      </div>

      {/* Alerta de aclaración solicitada */}
      {needsClarification && (
        <Alert>
          <MessageSquare className="h-4 w-4" />
          <AlertDescription>
            <strong>Aclaración solicitada por la jefatura.</strong> Revisa el historial de aprobaciones para ver qué información se necesita y edita el registro si corresponde.
          </AlertDescription>
        </Alert>
      )}

      {/* Información del registro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Información del registro
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <InfoRow label="Fecha" value={
            new Date(record.date + 'T12:00:00').toLocaleDateString('es-CL', {
              weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            })
          } />
          <InfoRow label="Horario" value={`${record.startTime} – ${record.endTime}`} />
          <InfoRow label="Horas calculadas" value={
            <span className="text-lg font-bold text-primary">{formatHoursDecimal(record.hoursCalculated)}</span>
          } />
          <InfoRow label="Tipo de hora extra" value={formatOvertimeType(record.overtimeType)} />
          <InfoRow label="Factor" value={`× ${record.factor}`} />
          <InfoRow label="Hrs efectivas" value={`${(record.hoursCalculated * record.factor).toFixed(2)} hrs`} />
          <InfoRow className="col-span-2 sm:col-span-3" label="Centro de costo" value={
            record.costCenter ? `${record.costCenter.code} — ${record.costCenter.name}` : '—'
          } />
        </CardContent>
      </Card>

      {/* Funcionario */}
      {record.user && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Funcionario
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <InfoRow label="Nombre" value={`${record.user.firstName} ${record.user.lastName}`} />
            <InfoRow label="Email" value={record.user.email} />
            <InfoRow label="ID empleado" value={record.user.employeeId} />
          </CardContent>
        </Card>
      )}

      {/* Descripción / Actividad (si ya fue aprobado y tiene descripción) */}
      {record.activityDescription && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Descripción de la actividad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap">{record.activityDescription}</p>
            {record.excessJustification && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-1">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                  Justificación de exceso de tope diario
                </p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{record.excessJustification}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Descripción pendiente */}
      {!record.activityDescription && record.status !== 'ANULADO' && record.status !== 'RECHAZADO' && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6 mx-auto mb-2 opacity-40" />
            La descripción de la actividad será ingresada por la jefatura al momento de validar este registro.
          </CardContent>
        </Card>
      )}

      {/* Anulación */}
      {record.cancellationReason && (
        <Card>
          <CardContent className="p-4">
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-red-800 uppercase tracking-wide mb-1">Motivo de anulación</p>
              <p className="text-sm text-red-900">{record.cancellationReason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial de aprobaciones */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Historial de validaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className={`rounded-lg border p-3 ${actionColor(h.action)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {actionLabel(h.action)}
                    {h.approvalLevel > 1 && <span className="ml-1">(nivel {h.approvalLevel})</span>}
                  </span>
                  <span className="text-xs opacity-70">
                    {new Date(h.createdAt).toLocaleString('es-CL')}
                  </span>
                </div>
                <p className="text-xs font-medium">
                  {h.approver?.firstName} {h.approver?.lastName}
                  <span className="font-normal opacity-70 ml-1">· {h.approver?.role}</span>
                </p>
                <p className="text-sm mt-1 opacity-90">"{h.comment}"</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
        <span>Creado: {new Date(record.createdAt).toLocaleString('es-CL')}</span>
        {record.updatedAt !== record.createdAt && (
          <span>Actualizado: {new Date(record.updatedAt).toLocaleString('es-CL')}</span>
        )}
      </div>
    </div>
  );
}
