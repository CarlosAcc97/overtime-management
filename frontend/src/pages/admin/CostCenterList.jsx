import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageLoader } from '@/components/common/LoadingSpinner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Plus, Pencil, Power, AlertCircle } from 'lucide-react';

// ─── Service helpers ──────────────────────────────────────────────────────────
const getCostCentersAll = async () => {
  const { data } = await api.get('/cost-centers');
  return data.data.costCenters;
};
const createCC = async (payload) => {
  const { data } = await api.post('/cost-centers', payload);
  return data.data.costCenter;
};
const updateCC = async (id, payload) => {
  const { data } = await api.put(`/cost-centers/${id}`, payload);
  return data.data.costCenter;
};
const toggleCC = async (id) => {
  const { data } = await api.patch(`/cost-centers/${id}/toggle`);
  return data.data.costCenter;
};

// ─── Validación ───────────────────────────────────────────────────────────────
const schema = z.object({
  code: z.string().min(2, 'Mínimo 2 caracteres').max(20).toUpperCase(),
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export default function CostCenterList() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data: centers = [], isLoading } = useQuery({
    queryKey: ['cost-centers-all'],
    queryFn: getCostCentersAll,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { sortOrder: 0 },
  });

  const openCreate = () => {
    setEditTarget(null);
    reset({ code: '', name: '', description: '', sortOrder: centers.length });
    setDialogOpen(true);
  };

  const openEdit = (cc) => {
    setEditTarget(cc);
    reset({
      code: cc.code,
      name: cc.name,
      description: cc.description || '',
      sortOrder: cc.sortOrder ?? 0,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editTarget ? updateCC(editTarget.id, data) : createCC(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers-all'] });
      setDialogOpen(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => toggleCC(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers-all'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Centros de costo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona los tipos de trabajo disponibles para el registro de horas extras
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo centro
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
                <th className="px-4 py-3 text-left hidden md:table-cell">Descripción</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {centers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground">
                    No hay centros de costo configurados
                  </td>
                </tr>
              ) : centers.map(cc => (
                <tr key={cc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-center">{cc.sortOrder ?? 0}</td>
                  <td className="px-4 py-3 font-mono font-bold">{cc.code}</td>
                  <td className="px-4 py-3 font-medium">{cc.name}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="max-w-xs truncate text-muted-foreground" title={cc.description}>
                      {cc.description || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={cc.isActive ? 'success' : 'secondary'}>
                      {cc.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cc)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleMutation.mutate(cc.id)}
                        title={cc.isActive ? 'Desactivar' : 'Activar'}
                        disabled={toggleMutation.isPending}
                      >
                        <Power className={`h-4 w-4 ${cc.isActive ? 'text-destructive' : 'text-emerald-600'}`} />
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
            <DialogTitle>{editTarget ? 'Editar centro de costo' : 'Nuevo centro de costo'}</DialogTitle>
            <DialogDescription>
              {editTarget ? `Modificando: ${editTarget.name}` : 'Completa los datos del nuevo centro de costo'}
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
                  placeholder="ej: TER"
                  className={`uppercase ${errors.code ? 'border-destructive' : ''}`}
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input type="number" min="0" {...register('sortOrder')} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                {...register('name')}
                placeholder="ej: Terreno"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                {...register('description')}
                placeholder="Descripción de los trabajos que corresponden a este centro..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : (editTarget ? 'Guardar cambios' : 'Crear centro')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
