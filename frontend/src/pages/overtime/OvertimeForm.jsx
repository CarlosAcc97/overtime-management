import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as overtimeService from '@/services/overtime.service';
import { getUsers, getCostCenters } from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertBanner } from '@/components/common/AlertBanner';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { ArrowLeft, Save, Clock, AlertCircle, Calculator, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatHoursDecimal } from '@/utils/formatters';

const schema = z.object({
  userId: z.coerce.number({ required_error: 'Funcionario requerido' }).int().positive('Funcionario requerido'),
  date: z.string().min(1, 'Fecha requerida'),
  startTime: z.string().min(1, 'Hora de inicio requerida'),
  endTime: z.string().min(1, 'Hora de término requerida'),
  overtimeType: z.string().min(1, 'Tipo de hora extra requerido'),
  costCenterId: z.coerce.number({ required_error: 'Centro de costo requerido' }).int().positive(),
}).superRefine((data, ctx) => {
  if (data.startTime && data.endTime) {
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    if (toMin(data.endTime) <= toMin(data.startTime)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'La hora de término debe ser posterior a la de inicio' });
    }
  }
});

const calcHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : 0;
};

const today = () => new Date().toISOString().slice(0, 10);
const minDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

export default function OvertimeForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hoursCalc, setHoursCalc] = useState(0);
  const [alertInfo, setAlertInfo] = useState(null);
  const [checkingLimits, setCheckingLimits] = useState(false);

  const { register, handleSubmit, control, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      date: today(),
      startTime: '18:00',
      endTime: '20:00',
      overtimeType: '',
    },
  });

  const watchDate = watch('date');
  const watchStart = watch('startTime');
  const watchEnd = watch('endTime');
  const watchOvertimeType = watch('overtimeType');
  const watchUserId = watch('userId');

  useEffect(() => { setHoursCalc(calcHours(watchStart, watchEnd)); }, [watchStart, watchEnd]);

  // Verificar límites con debounce
  useEffect(() => {
    if (!watchDate || !hoursCalc || hoursCalc <= 0 || !watchUserId) { setAlertInfo(null); return; }
    const timer = setTimeout(async () => {
      setCheckingLimits(true);
      try {
        const result = await overtimeService.checkLimits({
          userId: watchUserId,
          date: watchDate,
          hours: hoursCalc,
          ...(isEdit && { excludeId: id }),
        });
        setAlertInfo(result);
      } catch { setAlertInfo(null); }
      finally { setCheckingLimits(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [watchDate, hoursCalc, watchUserId, id, isEdit]);

  // Datos para edición
  const { data: recordData, isLoading: loadingRecord } = useQuery({
    queryKey: ['overtime', id],
    queryFn: () => overtimeService.getOvertimeById(id),
    enabled: isEdit,
  });

  // Catálogos
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => getUsers({ isActive: true, limit: 200 }),
  });
  const allUsers = (usersData?.data ?? []).filter(u => u.role !== 'administrador');

  const { data: overtimeTypes = [] } = useQuery({
    queryKey: ['overtime-types'],
    queryFn: () => overtimeService.getOvertimeTypes({ isActive: 'true' }),
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: getCostCenters,
  });

  const selectedType = overtimeTypes.find(t => t.code === watchOvertimeType);

  // Cargar valores al editar
  useEffect(() => {
    if (recordData) {
      reset({
        userId: recordData.userId,
        date: recordData.date,
        startTime: recordData.startTime,
        endTime: recordData.endTime,
        overtimeType: recordData.overtimeType,
        costCenterId: recordData.costCenterId,
      });
    }
  }, [recordData, reset]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? overtimeService.updateOvertime(id, data) : overtimeService.createOvertime(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime'] });
      toast({
        title: isEdit ? 'Registro actualizado' : 'Registro creado',
        description: isEdit ? 'Los cambios fueron guardados.' : 'Las horas extras fueron registradas correctamente.',
        variant: 'success',
      });
      navigate('/mis-horas');
    },
    onError: (err) => {
      toast({
        title: 'Error al guardar',
        description: err?.response?.data?.message || 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    },
  });

  if (isEdit && loadingRecord) return <PageLoader />;

  const FieldError = ({ name }) => errors[name] && (
    <p className="text-xs text-destructive mt-1">{errors[name].message}</p>
  );

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/mis-horas')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            {isEdit ? 'Editar registro de horas extras' : 'Ingresar horas extras'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Solo días de los últimos 30 días · La actividad la completa la jefatura al validar
          </p>
        </div>
      </div>

      {/* Alerta en tiempo real */}
      {alertInfo && (
        <AlertBanner
          alertLevel={alertInfo.alertLevel}
          hoursDay={hoursCalc}
          weeklyAccumulated={alertInfo.weeklyHours}
          monthlyAccumulated={alertInfo.monthlyHours}
          thresholds={alertInfo.thresholds}
        />
      )}

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {mutation.error?.response?.data?.message || 'Error al guardar el registro'}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {/* Funcionario */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Funcionario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>Funcionario *</Label>
              <Controller name="userId" control={control} render={({ field }) => (
                <Select
                  value={field.value?.toString() ?? ''}
                  onValueChange={(v) => field.onChange(parseInt(v))}
                  disabled={isEdit}
                >
                  <SelectTrigger className={errors.userId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Seleccionar funcionario..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        <span>{u.firstName} {u.lastName}</span>
                        {u.employeeId && <span className="text-muted-foreground ml-2 text-xs">({u.employeeId})</span>}
                        <span className="ml-1 text-xs text-muted-foreground capitalize">· {u.role}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
              {isEdit && <p className="text-xs text-muted-foreground">El funcionario no puede cambiarse al editar.</p>}
              <FieldError name="userId" />
            </div>
          </CardContent>
        </Card>

        {/* Fecha, horario, tipo y centro de costo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fecha, horario y tipo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input type="date" max={today()} min={minDate()} {...register('date')} />
                <FieldError name="date" />
              </div>
              <div className="space-y-1">
                <Label>Hora inicio *</Label>
                <Input type="time" {...register('startTime')} />
                <FieldError name="startTime" />
              </div>
              <div className="space-y-1">
                <Label>Hora término *</Label>
                <Input type="time" {...register('endTime')} />
                <FieldError name="endTime" />
              </div>
            </div>

            {/* Horas calculadas */}
            <div className="flex items-center gap-4 rounded-lg bg-muted p-3">
              <Calculator className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Horas calculadas:</span>
                <span className={`text-lg font-bold ${hoursCalc > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {hoursCalc > 0 ? formatHoursDecimal(hoursCalc) : '—'}
                </span>
                {selectedType && hoursCalc > 0 && (
                  <span className="text-sm text-muted-foreground">
                    × {selectedType.factor} = {(hoursCalc * selectedType.factor).toFixed(2)} hrs efectivas
                  </span>
                )}
                {checkingLimits && <span className="text-xs text-muted-foreground animate-pulse">Verificando límites...</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tipo de hora extra *</Label>
                <Controller name="overtimeType" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={errors.overtimeType ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {overtimeTypes.map(ot => (
                        <SelectItem key={ot.code} value={ot.code}>
                          {ot.name} <span className="text-muted-foreground text-xs">(× {ot.factor})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
                {selectedType?.description && (
                  <p className="text-xs text-muted-foreground">{selectedType.description}</p>
                )}
                <FieldError name="overtimeType" />
              </div>

              <div className="space-y-1">
                <Label>Centro de costo *</Label>
                <Controller name="costCenterId" control={control} render={({ field }) => (
                  <Select
                    value={field.value?.toString() ?? ''}
                    onValueChange={(v) => field.onChange(parseInt(v))}
                  >
                    <SelectTrigger className={errors.costCenterId ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters.map(cc => (
                        <SelectItem key={cc.id} value={cc.id.toString()}>
                          {cc.code} — {cc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
                <FieldError name="costCenterId" />
              </div>
            </div>
          </CardContent>
        </Card>

        {alertInfo?.alertLevel === 2 && (
          <Alert>
            <AlertDescription className="text-sm">
              <strong>Proceso de doble validación:</strong> Este registro requerirá la aprobación de dos niveles por exceder el límite diario significativamente.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/mis-horas')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending || hoursCalc <= 0}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting || mutation.isPending
              ? 'Guardando...'
              : (isEdit ? 'Guardar cambios' : 'Registrar horas extras')}
          </Button>
        </div>
      </form>
    </div>
  );
}
