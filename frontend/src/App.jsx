import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoader } from '@/components/common/LoadingSpinner';

// Páginas
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Unauthorized from '@/pages/Unauthorized';
import UserList from '@/pages/admin/UserList';
import UserForm from '@/pages/admin/UserForm';
import OvertimeTypeList from '@/pages/admin/OvertimeTypeList';
import CostCenterList from '@/pages/admin/CostCenterList';
import ApprovalInbox from '@/pages/ApprovalInbox';
import OvertimeList from '@/pages/overtime/OvertimeList';
import OvertimeForm from '@/pages/overtime/OvertimeForm';
import OvertimeDetail from '@/pages/overtime/OvertimeDetail';
import Reports from '@/pages/Reports';
import SystemConfig from '@/pages/admin/SystemConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

// Ruta protegida por rol
const RequireRole = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/no-autorizado" replace />;
  return children;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<Login />} />
            <Route path="/no-autorizado" element={<Unauthorized />} />

            {/* App protegida */}
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Módulo horas extras — listado y detalle para todos los roles */}
              <Route path="/mis-horas" element={<OvertimeList />} />
              <Route path="/mis-horas/:id" element={<OvertimeDetail />} />

              {/* Crear y editar registros: solo administrador */}
              <Route
                path="/mis-horas/nuevo"
                element={
                  <RequireRole roles={['administrador']}>
                    <OvertimeForm />
                  </RequireRole>
                }
              />
              <Route
                path="/mis-horas/:id/editar"
                element={
                  <RequireRole roles={['administrador']}>
                    <OvertimeForm />
                  </RequireRole>
                }
              />

              {/* Aprobaciones */}
              <Route
                path="/aprobaciones"
                element={
                  <RequireRole roles={['jefatura', 'administrador']}>
                    <ApprovalInbox />
                  </RequireRole>
                }
              />

              {/* Reportes */}
              <Route
                path="/reportes"
                element={
                  <RequireRole roles={['jefatura', 'administrador']}>
                    <Reports />
                  </RequireRole>
                }
              />

              {/* Admin — Usuarios */}
              <Route
                path="/admin/usuarios"
                element={<RequireRole roles={['administrador']}><UserList /></RequireRole>}
              />
              <Route
                path="/admin/usuarios/nuevo"
                element={<RequireRole roles={['administrador']}><UserForm /></RequireRole>}
              />
              <Route
                path="/admin/usuarios/:id"
                element={<RequireRole roles={['administrador']}><UserForm /></RequireRole>}
              />

              {/* Admin — Tipos de hora extra (módulo mantenedor) */}
              <Route
                path="/admin/tipos-hora-extra"
                element={<RequireRole roles={['administrador']}><OvertimeTypeList /></RequireRole>}
              />

              {/* Admin — Centros de costo (módulo mantenedor) */}
              <Route
                path="/admin/centros-costo"
                element={<RequireRole roles={['administrador']}><CostCenterList /></RequireRole>}
              />

              {/* Admin — Configuración del sistema */}
              <Route
                path="/admin/configuracion"
                element={
                  <RequireRole roles={['administrador']}>
                    <SystemConfig />
                  </RequireRole>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Placeholder temporal para páginas de fases posteriores
function PlaceholderPage({ title, phase }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-col items-center justify-center rounded-lg border bg-white py-20 text-center gap-3">
        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center text-2xl">🚧</div>
        <h3 className="font-semibold">En construcción — Fase {phase}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Esta sección se implementa en la fase {phase} del proyecto.
        </p>
      </div>
    </div>
  );
}
