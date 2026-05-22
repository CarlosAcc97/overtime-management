import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ className, size = 'default' }) => {
  const sizes = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-10 w-10' };
  return <Loader2 className={cn('animate-spin text-muted-foreground', sizes[size], className)} />;
};

export const PageLoader = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  </div>
);
