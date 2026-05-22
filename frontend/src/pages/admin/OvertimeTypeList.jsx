import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as overtimeService from '@/services/overtime.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageLoader } from '@/components/common/LoadingSpinner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Textarea,
} from '@/components/ui/textarea';
import { Clock, Plus, Pencil, Power, AlertCircle } from 'lucide-react';

const schema = z.object({
  code: z.string().min(2, 'Mínimo 2 caracteres').max(50).regex(/^[a-z0-9_]+$/, 'Solo letras minúsculas, números y guión bajo'),
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
  factor: z.coerce.number({ required_error: 'Factor requerido' }).positive('El factor debe ser positivo').max(10),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export default function OvertimeTypeList() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = crear, object = editar

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['overtime-types-all'],
    queryFn: () => overtimeService.getOvertimeTypes(),
  });

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { sortOrder: 0 },
  });

  const openCreate = () => {
    setEditTarget(null);
    reset({ code: '', name: '', factor: 1.5, description: '', sortOrder: types.length });
    setDialogOpen(true);
  };

  const openEdit = (ot) => {
    setEditTarget(ot);
    reset({
      code: ot.code,
      name: ot.name,
      factor: ot.factor,
      description: ot.description || '',
      sortOrder: ot.sortOrder,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editTarget
        ? overtimeService.updateOvertimeType(editTarget.id, data)
        : overtimeService.createOvertimeType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime-types'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-types-all'] });
      setDialogOpen(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => overtimeService.toggleOvertimeType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime-types'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-types-all'] });
    },
  });

  const factorColor = (factor) => {
    if (factor >= 2.5) return 'danger';
    if (factor >= 2.0) return 'warning';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" /> Tipos de hora extra
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configura los tipos de horas extras y sus factores de cálculo
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo tipo
        </Button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-left">Orden</th>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-center">Factor</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Descripción</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {types.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    No hay tipos de hora extra configurados
                  </td>
                </tr>
              ) : types.map(ot => (
                <tr key={ot.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-center">{ot.sortOrder}</td>
                  <td className="px-4 py-3 font-mono font-medium">{ot.code}</td>
                  <td className="px-4 py-3 font-medium">{ot.name}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={factorColor(ot.factor)}>
                      × {ot.factor.toFixed(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="max-w-xs truncate text-muted-foreground" title={ot.description}>
                      {ot.description || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={ot.isActive ? 'success' : 'secondary'}>
                      {ot.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(ot)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleMutation.mutate(ot.id)}
                        title={ot.isActive ? 'Desactivar' : 'Activar'}
                        disabled={toggleMutation.isPending}
                      >
                        <Power className={`h-4 w-4 ${ot.isActive ? 'text-destructive' : 'text-emerald-600'}`} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar tipo de hora extra' : 'Nuevo tipo de hora extra'}</DialogTitle>
            <DialogDescription>
              {editTarget ? `Modificando: ${editTarget.name}` : 'Completa los datos del nuevo tipo de hora extra'}
            </DialogDescription>
          </DialogHeader>

          {saveMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {saveMutation.error?.response?.data?.message || 'Error al guardar'}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Código *</Label>
                <Input
                  {...register('code')}
                  placeholder="ej: super_extra"
                  disabled={!!editTarget} // Código no modificable al editar
                  className={errors.code ? 'border-destructive' : ''}
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                {!editTarget && <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guión bajo</p>}
              </div>
              <div className="space-y-1">
                <Label>Factor * <span className="text-xs font-normal text-muted-foreground">(ej: 1.5, 2.0, 2.5)</span></Label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  {...register('factor')}
                  className={errors.factor ? 'border-destructive' : ''}
                />
                {errors.factor && <p className="text-xs text-destructive">{errors.factor.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                {...register('name')}
                placeholder="ej: Horas super extras"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                {...register('description')}
                placeholder="Descripción del tipo de hora extra y cuándo aplica..."
                rows={3}
              />
            </div>

            <div className="space-y-1">
              <Label>Orden de visualización</Label>
              <Input type="number" min="0" {...register('sortOrder')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : (editTarget ? 'Guardar cambios' : 'Crear tipo')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
