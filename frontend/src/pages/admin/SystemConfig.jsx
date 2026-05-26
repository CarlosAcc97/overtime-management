import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { getSystemConfig, updateSystemConfig } from '@/services/users.service';
import { getCancelledCount, purgeCancelledRecords } from '@/services/overtime.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { Settings, Save, RefreshCw, Info, Clock, DollarSign, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';

// ─── Schema de validación ─────────────────────────────────────────────────────
const configSchema = z.object({
  max_daily_hours_soft:    z.coerce.number().min(0.5).max(12, 'Máximo 12 hrs').step ? z.coerce.number().min(0.5).max(12) : z.coerce.number().min(0.5).max(12),
  max_daily_hours_warning: z.coerce.number().min(0.5).max(24, 'Máximo 24 hrs'),
  max_weekly_hours:        z.coerce.number().min(1).max(60, 'Máximo 60 hrs'),
  max_monthly_hours:         z.coerce.number().min(1).max(200, 'Máximo 200 hrs'),
  default_hourly_rate:       z.coerce.number().min(100, 'Mínimo $100'),
  pending_alert_hours:       z.coerce.number().min(1).max(168, 'Máximo 168 hrs (1 semana)'),
  min_minutes_for_approval:  z.coerce.number().min(1, 'Mínimo 1 minuto').max(120, 'Máximo 120 minutos'),
}).superRefine((d, ctx) => {
  if (d.max_daily_hours_warning <= d.max_daily_hours_soft) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El tope de advertencia debe ser mayor al tope informativo',
      path: ['max_daily_hours_warning'],
    });
  }
});

// ─── Grupos de configuración ──────────────────────────────────────────────────
const CONFIG_GROUPS = [
  {
    title: 'Límites de horas diarias',
    icon: Clock,
    iconColor: 'text-blue-500',
    description: 'Controlan cuándo se activan las alertas y la doble validación.',
    fields: [
      {
        key: 'max_daily_hours_soft',
        label: 'Tope informativo diario',
        description: 'Horas extras al día que activan alerta nivel 1 (informativa, amarillo).',
        unit: 'horas',
        min: 0.5, max: 12, step: 0.5,
      },
      {
        key: 'max_daily_hours_warning',
        label: 'Tope de advertencia diario',
        description: 'Horas extras al día que activan alerta nivel 2 (advertencia, rojo) y doble validación.',
        unit: 'horas',
        min: 0.5, max: 24, step: 0.5,
      },
    ],
  },
  {
    title: 'Límites acumulados',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    description: 'Si se superan, el registro queda en estado RETENIDO (alerta crítica).',
    fields: [
      {
        key: 'max_weekly_hours',
        label: 'Máximo semanal',
        description: 'Horas extras totales permitidas por semana antes de retener.',
        unit: 'horas/semana',
        min: 1, max: 60, step: 1,
      },
      {
        key: 'max_monthly_hours',
        label: 'Máximo mensual',
        description: 'Horas extras totales permitidas por mes antes de retener.',
        unit: 'horas/mes',
        min: 1, max: 200, step: 1,
      },
    ],
  },
  {
    title: 'Parámetros generales',
    icon: DollarSign,
    iconColor: 'text-emerald-500',
    description: 'Valores por defecto del sistema.',
    fields: [
      {
        key: 'min_minutes_for_approval',
        label: 'Mínimo para requerir aprobación',
        description: 'Registros con menos minutos que este valor se aprueban automáticamente sin pasar por jefatura.',
        unit: 'minutos',
        min: 1, max: 120, step: 1,
      },
      {
        key: 'default_hourly_rate',
        label: 'Valor hora predeterminado (CLP)',
        description: 'Se usa cuando el funcionario no tiene tarifa asignada en su perfil.',
        unit: 'CLP/hr',
        min: 100, max: 500000, step: 100,
      },
      {
        key: 'pending_alert_hours',
        label: 'Alerta de registros pendientes',
        description: 'Horas tras las que un registro pendiente se marca como urgente.',
        unit: 'horas',
        min: 1, max: 168, step: 1,
      },
    ],
  },
];

// ─── Página ───────────────────────────────────────────────────────────────────
export default function SystemConfig() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(configSchema),
    defaultValues: {
      max_daily_hours_soft:    2,
      max_daily_hours_warning: 3,
      max_weekly_hours:        12,
      max_monthly_hours:       40,
      min_minutes_for_approval: 15,
      default_hourly_rate:     5000,
      pending_alert_hours:     48,
    },
  });

  // Cuando llegue la config del servidor, rellenar el formulario
  useEffect(() => {
    if (config) {
      reset({
        max_daily_hours_soft:     parseFloat(config.max_daily_hours_soft     ?? 2),
        max_daily_hours_warning:  parseFloat(config.max_daily_hours_warning  ?? 3),
        max_weekly_hours:         parseFloat(config.max_weekly_hours         ?? 12),
        max_monthly_hours:        parseFloat(config.max_monthly_hours        ?? 40),
        min_minutes_for_approval: parseFloat(config.min_minutes_for_approval ?? 15),
        default_hourly_rate:      parseFloat(config.default_hourly_rate      ?? 5000),
        pending_alert_hours:      parseFloat(config.pending_alert_hours      ?? 48),
      });
    }
  }, [config, reset]);

  const mutation = useMutation({
    mutationFn: (data) => {
      // Convertir todos los valores a strings (así los espera el backend)
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      );
      return updateSystemConfig(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['system-config'], updated);
      toast({
        title: 'Configuración guardada',
        description: 'Los cambios entrarán en vigor en los nuevos registros.',
        variant: 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'Error al guardar',
        description: err?.response?.data?.message || 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    },
  });

  // ── Mantenimiento: purgar anulados ──────────────────────────────────────────
  const { data: cancelledData, refetch: refetchCancelled } = useQuery({
    queryKey: ['cancelled-count'],
    queryFn: getCancelledCount,
  });
  const cancelledCount = cancelledData?.count ?? 0;

  const purgeMutation = useMutation({
    mutationFn: purgeCancelledRecords,
    onSuccess: (result) => {
      refetchCancelled();
      toast({
        title: 'Registros eliminados',
        description: `${result.deleted} registro(s) anulado(s) eliminado(s) permanentemente.`,
        variant: 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'Error al eliminar',
        description: err?.response?.data?.message || 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Encabezado ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-gray-600" />
            Configuración del sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Parámetros que controlan alertas, límites y valores del módulo de horas extras.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['system-config'] })}
          title="Recargar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Los cambios aplican únicamente a <strong>nuevos registros</strong>. Los existentes mantienen los valores con los que fueron evaluados.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {CONFIG_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <group.icon className={`h-4 w-4 ${group.iconColor}`} />
                {group.title}
              </CardTitle>
              <CardDescription className="text-xs">{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.fields.map((f) => (
                <div key={f.key} className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:items-start sm:gap-4">
                  {/* Etiqueta + descripción */}
                  <div className="sm:col-span-2">
                    <Label htmlFor={f.key} className="font-medium text-sm">
                      {f.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                    {errors[f.key] && (
                      <p className="text-xs text-destructive mt-1">{errors[f.key].message}</p>
                    )}
                  </div>
                  {/* Input */}
                  <div className="flex items-center gap-2">
                    <Input
                      id={f.key}
                      {...register(f.key)}
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.step ?? 1}
                      className={`w-28 text-right ${errors[f.key] ? 'border-destructive' : ''}`}
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{f.unit}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending
              ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Guardando…</>
              : <><Save className="mr-2 h-4 w-4" /> Guardar cambios</>
            }
          </Button>
          {isDirty && (
            <p className="text-xs text-amber-600 font-medium">Hay cambios sin guardar</p>
          )}
        </div>
      </form>

      {/* ── Mantenimiento de datos ──────────────────────────────────── */}
      <Card className="border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Mantenimiento de datos
          </CardTitle>
          <CardDescription className="text-xs">
            Acciones destructivas e irreversibles. Úselas con precaución.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-4">
            <div>
              <p className="text-sm font-medium text-red-900">Eliminar registros anulados</p>
              <p className="text-xs text-red-700 mt-0.5">
                Borra permanentemente todos los registros con estado <strong>ANULADO</strong> y su historial de validaciones.
                {cancelledCount > 0
                  ? <span className="ml-1 font-semibold">Actualmente hay {cancelledCount} registro(s) anulado(s).</span>
                  : <span className="ml-1 text-red-500">No hay registros anulados.</span>
                }
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelledCount === 0 || purgeMutation.isPending}
                  className="ml-4 shrink-0"
                >
                  {purgeMutation.isPending
                    ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Eliminando…</>
                    : <><Trash2 className="mr-2 h-3.5 w-3.5" /> Purgar anulados ({cancelledCount})</>
                  }
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {cancelledCount} registro(s) anulado(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán {cancelledCount} registro(s) con estado ANULADO junto con todo su historial de validaciones y alertas.
                    <br /><br />
                    Los registros activos (pendientes, aprobados, retenidos) <strong>no se verán afectados</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => purgeMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  >
                    Sí, eliminar permanentemente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
