import { Badge } from '@/components/ui/badge';
import { formatStatus } from '@/utils/formatters';

const STATUS_VARIANTS = {
  PENDIENTE: 'warning',
  APROBADO: 'success',
  RECHAZADO: 'danger',
  ACLARACION_SOLICITADA: 'default',
  ANULADO: 'gray',
  RETENIDO: 'purple',
};

export const StatusBadge = ({ status, className }) => (
  <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'} className={className}>
    {formatStatus(status)}
  </Badge>
);

const ALERT_VARIANTS = { 0: 'gray', 1: 'warning', 2: 'danger', 3: 'purple' };
const ALERT_LABELS = { 0: 'Normal', 1: 'Alerta amarilla', 2: 'Alerta roja', 3: 'Crítico' };

export const AlertBadge = ({ level }) => {
  if (!level || level === 0) return null;
  return <Badge variant={ALERT_VARIANTS[level]}>{ALERT_LABELS[level]}</Badge>;
};

const ROLE_VARIANTS = { funcionario: 'secondary', jefatura: 'default', administrador: 'success' };
const ROLE_LABELS = { funcionario: 'Funcionario', jefatura: 'Jefatura', administrador: 'Admin' };

export const RoleBadge = ({ role }) => (
  <Badge variant={ROLE_VARIANTS[role] ?? 'gray'}>{ROLE_LABELS[role] ?? role}</Badge>
);
