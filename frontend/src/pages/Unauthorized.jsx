import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';

export default function Unauthorized() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <ShieldX className="h-16 w-16 text-destructive/40" />
      <h1 className="text-2xl font-bold">Acceso denegado</h1>
      <p className="text-muted-foreground max-w-sm">No tienes permisos para acceder a esta sección.</p>
      <Button onClick={() => navigate(-1)}>Volver</Button>
    </div>
  );
}
