import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, Clock, CheckSquare, Users, Settings,
  Building2, FileText, X, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  // ─── Principal ────────────────────────────────────────────────────────────
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['funcionario', 'jefatura', 'administrador'],
  },
  {
    to: '/mis-horas',
    label: 'Horas extras',
    icon: Clock,
    roles: ['funcionario', 'jefatura', 'administrador'],
  },
  {
    to: '/aprobaciones',
    label: 'Bandeja de aprobación',
    icon: CheckSquare,
    roles: ['jefatura', 'administrador'],
  },
  {
    to: '/reportes',
    label: 'Reportes',
    icon: FileText,
    roles: ['jefatura', 'administrador'],
  },

  // ─── Administración ───────────────────────────────────────────────────────
  {
    to: '/admin/usuarios',
    label: 'Usuarios',
    icon: Users,
    roles: ['administrador'],
    section: 'Administración',
  },
  {
    to: '/admin/tipos-hora-extra',
    label: 'Tipos de hora extra',
    icon: Timer,
    roles: ['administrador'],
  },
  {
    to: '/admin/centros-costo',
    label: 'Centros de costo',
    icon: Building2,
    roles: ['administrador'],
  },
  {
    to: '/admin/configuracion',
    label: 'Configuración',
    icon: Settings,
    roles: ['administrador'],
  },
];

export const Sidebar = ({ onClose }) => {
  const { user } = useAuth();
  const location = useLocation();

  const filteredItems = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  let lastSection = null;

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="relative px-4 py-4">
        {/* Logo sobre fondo blanco para contraste */}
        <div className="rounded-xl bg-white px-3 py-2.5 shadow-md">
          <img
            src="/logo.svg"
            alt="Cooprel"
            className="h-auto w-full"
            style={{ maxHeight: '36px', objectFit: 'contain' }}
          />
        </div>
        <p className="mt-2 text-center text-[9px] font-medium uppercase tracking-widest text-slate-400">
          Gerencia de Distribución
        </p>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-7 w-7 text-slate-400 hover:text-white lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Separator className="bg-slate-800" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {filteredItems.map((item) => {
          const showSection = item.section && item.section !== lastSection;
          if (showSection) lastSection = item.section;

          return (
            <div key={item.to}>
              {showSection && (
                <p className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {item.section}
                </p>
              )}
              <NavLink
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
