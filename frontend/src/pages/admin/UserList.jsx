import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as usersService from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, RoleBadge } from '@/components/common/StatusBadge';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { UserPlus, Search, UserCheck, UserX, Pencil, Users, RefreshCw } from 'lucide-react';
import { getInitials, formatRole } from '@/utils/formatters';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function UserList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [toggleTarget, setToggleTarget] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users', { search, role, page }],
    queryFn: () => usersService.getUsers({
      search: search || undefined,
      role: role === 'all' ? undefined : role,
      page,
      limit: 15,
    }),
    keepPreviousData: true,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => usersService.toggleUserActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setToggleTarget(null);
    },
  });

  const users = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Gestión de Usuarios
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pagination?.total ?? '—'} usuarios en el sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => navigate('/admin/usuarios/nuevo')}>
            <UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o RUT..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value="funcionario">Funcionario</SelectItem>
            <SelectItem value="jefatura">Jefatura</SelectItem>
            <SelectItem value="administrador">Administrador</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Error al cargar usuarios. <Button variant="link" className="p-0 h-auto" onClick={() => refetch()}>Reintentar</Button></AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 text-left">Usuario</th>
                  <th className="px-4 py-3 text-left">Rol</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Departamento</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Jefe directo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No se encontraron usuarios
                    </td>
                  </tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                            {getInitials(user.firstName, user.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.firstName} {user.lastName}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          {user.employeeId && <p className="text-xs text-muted-foreground">ID: {user.employeeId}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      {user.department?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {user.supervisor ? `${user.supervisor.firstName} ${user.supervisor.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={user.isActive ? 'success' : 'gray'}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => navigate(`/admin/usuarios/${user.id}`)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setToggleTarget(user)}
                          title={user.isActive ? 'Desactivar' : 'Activar'}
                        >
                          {user.isActive
                            ? <UserX className="h-4 w-4 text-destructive" />
                            : <UserCheck className="h-4 w-4 text-emerald-600" />}
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
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog confirmar toggle activo */}
      <Dialog open={!!toggleTarget} onOpenChange={() => setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.isActive ? 'Desactivar usuario' : 'Activar usuario'}
            </DialogTitle>
            <DialogDescription>
              ¿Confirmas que deseas {toggleTarget?.isActive ? 'desactivar' : 'activar'} a{' '}
              <strong>{toggleTarget?.firstName} {toggleTarget?.lastName}</strong>?
              {toggleTarget?.isActive && ' El usuario no podrá iniciar sesión.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Cancelar</Button>
            <Button
              variant={toggleTarget?.isActive ? 'destructive' : 'success'}
              onClick={() => toggleMutation.mutate({ id: toggleTarget.id, isActive: !toggleTarget.isActive })}
              disabled={toggleMutation.isPending}
            >
              {toggleMutation.isPending ? 'Procesando...' : (toggleTarget?.isActive ? 'Desactivar' : 'Activar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
