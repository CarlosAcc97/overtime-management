import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as usersService from '@/services/users.service';
import { getDepartments } from '@/services/reports.service';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { ArrowLeft, Save, UserPlus, AlertCircle, Building2 } from 'lucide-react';

// ─── Sentinel para "sin selección" en Selects opcionales ─────────────────────
// Radix UI Select no acepta value="" correctamente; usamos "_none_"
const NONE = '_none_';
const toNum = (v) => (v && v !== NONE ? parseInt(v, 10) : null);
const fromNum = (v) => (v != null ? String(v) : NONE);

// ─── Esquemas de validación ───────────────────────────────────────────────────
const createSchema = z.object({
  firstName:    z.string().min(2, 'Mínimo 2 caracteres'),
  lastName:     z.string().min(2, 'Mínimo 2 caracteres'),
  email:        z.string().email('Email inválido'),
  password:     z.string().min(8, 'Mínimo 8 caracteres'),
  role:         z.enum(['funcionario', 'jefatura', 'administrador'], { required_error: 'Selecciona un rol' }),
  employeeId:   z.string().optional(),
  rut:          z.string().optional(),
  departmentId: z.number().int().positive('Selecciona un departamento').nullable().refine(v => v !== null, { message: 'El departamento es obligatorio' }),
  supervisorId: z.number().int().positive().optional().nullable(),
  costCenterId: z.number().int().positive().optional().nullable(),
  hourlyRate:   z.coerce.number().positive('Debe ser mayor a 0').optional(),
});

const editSchema = createSchema.omit({ password: true }).extend({
  password:     z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  departmentId: z.number().int().positive().optional().nullable(),
  isActive:     z.boolean().optional(),
});

// ─── Componente ───────────────────────────────────────────────────────────────
export default function UserForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const schema = isEdit ? editSchema : createSchema;

  const { register, handleSubmit, control, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'funcionario', hourlyRate: 5000, departmentId: null },
  });

  // ── Datos del usuario en edición ──────────────────────────────────────────
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersService.getUserById(id),
    enabled: isEdit,
  });

  // ── Listas de apoyo ───────────────────────────────────────────────────────
  const { data: supervisors = [] } = useQuery({
    queryKey: ['supervisors'],
    queryFn: usersService.getSupervisors,
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: usersService.getCostCenters,
  });

  const { data: departmentsList = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (userData) {
      reset({
        firstName:    userData.firstName ?? '',
        lastName:     userData.lastName ?? '',
        email:        userData.email ?? '',
        role:         userData.role ?? 'funcionario',
        employeeId:   userData.employeeId ?? '',
        rut:          userData.rut ?? '',
        departmentId: userData.departmentId ?? null,
        supervisorId: userData.supervisorId ?? null,
        costCenterId: userData.costCenterId ?? null,
        hourlyRate:   userData.hourlyRate ?? 5000,
        isActive:     userData.isActive ?? true,
        password:     '',
      });
    }
  }, [userData, reset]);

  // ── Mutación crear / actualizar ───────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data };
      if (isEdit && !payload.password) delete payload.password;
      // Asegurar null en campos opcionales vacíos
      if (!payload.supervisorId) payload.supervisorId = null;
      if (!payload.costCenterId) payload.costCenterId = null;
      if (!payload.departmentId) payload.departmentId = null;
      return isEdit
        ? usersService.updateUser(id, payload)
        : usersService.createUser(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      toast({
        title: isEdit ? 'Usuario actualizado' : 'Usuario creado',
        description: isEdit ? 'Los cambios fueron guardados.' : 'El nuevo usuario puede iniciar sesión con su email y contraseña.',
        variant: 'success',
      });
      navigate('/admin/usuarios');
    },
    onError: (err) => {
      toast({
        title: 'Error al guardar',
        description: err?.response?.data?.message || 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    },
  });

  if (isEdit && loadingUser) return <PageLoader />;

  const FieldError = ({ name }) =>
    errors[name] ? <p className="text-xs text-destructive mt-1">{errors[name].message}</p> : null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Encabezado ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/usuarios')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h1>
          {isEdit && userData && (
            <p className="text-sm text-muted-foreground">
              {userData.firstName} {userData.lastName} — {userData.email}
            </p>
          )}
        </div>
      </div>

      {/* ── Errores de validación globales ────────────────────────────── */}
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Revisa los campos marcados en rojo antes de continuar.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        {/* ── Datos personales ─────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="firstName">Nombre *</Label>
              <Input id="firstName" {...register('firstName')} placeholder="María" className={errors.firstName ? 'border-destructive' : ''} />
              <FieldError name="firstName" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Apellido *</Label>
              <Input id="lastName" {...register('lastName')} placeholder="González" className={errors.lastName ? 'border-destructive' : ''} />
              <FieldError name="lastName" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rut">RUT</Label>
              <Input id="rut" {...register('rut')} placeholder="12.345.678-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="employeeId">ID de empleado</Label>
              <Input id="employeeId" {...register('employeeId')} placeholder="F-001" />
            </div>
          </CardContent>
        </Card>

        {/* ── Acceso al sistema ─────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Acceso al sistema</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="email">Email corporativo *</Label>
              <Input
                id="email"
                {...register('email')}
                type="email"
                placeholder="nombre@empresa.cl"
                className={errors.email ? 'border-destructive' : ''}
              />
              <FieldError name="email" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="password">
                {isEdit ? 'Nueva contraseña' : 'Contraseña *'}
                {isEdit && <span className="ml-1 text-xs font-normal text-muted-foreground">(dejar vacío para no cambiar)</span>}
              </Label>
              <Input
                id="password"
                {...register('password')}
                type="password"
                placeholder={isEdit ? '••••••••' : 'Mínimo 8 caracteres'}
                className={errors.password ? 'border-destructive' : ''}
              />
              <FieldError name="password" />
            </div>
            <div className="space-y-1">
              <Label>Rol *</Label>
              <Controller name="role" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={errors.role ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="funcionario">Funcionario</SelectItem>
                    <SelectItem value="jefatura">Jefatura</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              )} />
              <FieldError name="role" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hourlyRate">Valor hora (CLP)</Label>
              <Input
                id="hourlyRate"
                {...register('hourlyRate')}
                type="number"
                min="1000"
                step="100"
                className={errors.hourlyRate ? 'border-destructive' : ''}
              />
              <FieldError name="hourlyRate" />
            </div>
          </CardContent>
        </Card>

        {/* ── Jerarquía y asignación ────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Jerarquía y asignación</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Departamento */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Departamento {!isEdit && <span className="text-destructive">*</span>}
              </Label>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={fromNum(field.value)}
                    onValueChange={(v) => field.onChange(toNum(v))}
                  >
                    <SelectTrigger className={errors.departmentId ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Selecciona un departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin departamento asignado</SelectItem>
                      {departmentsList.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{d.code}</span>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.departmentId && (
                <p className="text-xs text-destructive mt-1">{errors.departmentId.message}</p>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Jefe directo</Label>
              <Controller
                name="supervisorId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={fromNum(field.value)}
                    onValueChange={(v) => field.onChange(toNum(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin jefe asignado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin jefe asignado</SelectItem>
                      {supervisors.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.firstName} {s.lastName}
                          <span className="ml-1 text-xs text-muted-foreground capitalize">({s.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                El jefe directo recibirá las solicitudes de aprobación.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Centro de costo predeterminado</Label>
              <Controller
                name="costCenterId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={fromNum(field.value)}
                    onValueChange={(v) => field.onChange(toNum(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin centro asignado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin centro asignado</SelectItem>
                      {costCenters.map((cc) => (
                        <SelectItem key={cc.id} value={String(cc.id)}>
                          {cc.code} — {cc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/usuarios')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting || mutation.isPending
              ? 'Guardando…'
              : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </div>
  );
}
