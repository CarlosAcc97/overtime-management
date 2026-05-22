import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/common/StatusBadge';
import { getInitials } from '@/utils/formatters';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Menu } from 'lucide-react';

export const Header = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="flex h-14 items-center border-b bg-white px-4 shadow-sm">
      {/* Botón hamburguesa (móvil) */}
      <Button variant="ghost" size="icon" className="mr-2 lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Logo visible solo en móvil (cuando el sidebar está oculto) */}
      <div className="lg:hidden">
        <img
          src="/logo.svg"
          alt="Cooprel"
          className="h-auto w-28"
          style={{ maxHeight: '28px', objectFit: 'contain' }}
        />
      </div>

      <div className="flex-1" />

      {/* Usuario */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-600 text-white text-xs">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-none">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              <span>{user?.firstName} {user?.lastName}</span>
              <RoleBadge role={user?.role} />
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/mi-perfil')}>
            <User className="mr-2 h-4 w-4" />
            Mi perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
