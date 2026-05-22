import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageLoader } from '@/components/common/LoadingSpinner';
import {
  ToastProvider, ToastViewport,
  Toast, ToastTitle, ToastDescription, ToastClose,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

// ─── Toaster global ───────────────────────────────────────────────────────────
function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <>
      {toasts.map(({ id, title, description, variant, open }) => (
        <Toast key={id} open={open} onOpenChange={(v) => { if (!v) dismiss(id); }} variant={variant}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────
export const AppLayout = () => {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Sidebar desktop */}
        <div className="hidden lg:block lg:shrink-0">
          <Sidebar />
        </div>

        {/* Sidebar móvil (overlay) */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Contenido principal */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Toasts globales */}
      <Toaster />
    </ToastProvider>
  );
};
