import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, AlertOctagon, ShieldAlert, Info } from 'lucide-react';

/**
 * Banner de alerta para el formulario de horas extras.
 * Muestra el nivel de alerta y sus consecuencias.
 */
export const AlertBanner = ({ alertLevel, hoursDay, weeklyAccumulated, monthlyAccumulated, thresholds }) => {
  if (!alertLevel || alertLevel === 0) return null;

  const configs = {
    1: {
      variant: 'warning',
      Icon: AlertTriangle,
      title: 'Alerta Nivel 1 — Tope diario superado',
      message: `Estás registrando ${hoursDay} hrs, superando el límite referencial de ${thresholds?.maxDailySoft ?? 2} hrs diarias (Art. 31 CT Chile). El registro continuará como PENDIENTE, pero requiere una justificación adicional de mínimo 30 caracteres.`,
      extra: weeklyAccumulated ? `Acumulado semanal con este registro: ${weeklyAccumulated.toFixed(2)} hrs.` : '',
    },
    2: {
      variant: 'destructive',
      Icon: AlertOctagon,
      title: 'Alerta Nivel 2 — Exceso significativo',
      message: `${hoursDay} hrs diarias supera el umbral de advertencia (${thresholds?.maxDailyWarning ?? 3} hrs) o el acumulado semanal supera ${thresholds?.maxWeekly ?? 12} hrs. Este registro requerirá doble validación (jefatura + nivel superior).`,
      extra: `Acumulado semanal: ${weeklyAccumulated?.toFixed(2) ?? '—'} hrs | Mensual: ${monthlyAccumulated?.toFixed(2) ?? '—'} hrs. RRHH recibirá notificación automática.`,
    },
    3: {
      variant: 'destructive',
      Icon: ShieldAlert,
      title: '🔴 Alerta Nivel 3 — Límite mensual superado',
      message: `El acumulado mensual con este registro superaría el límite configurado de ${thresholds?.maxMonthly ?? 40} hrs. El registro quedará en estado RETENIDO hasta que RRHH revise y autorice.`,
      extra: `Acumulado mensual actual: ${monthlyAccumulated?.toFixed(2) ?? '—'} hrs. Notificación automática enviada a Administración.`,
    },
  };

  const config = configs[alertLevel];
  if (!config) return null;

  return (
    <Alert variant={config.variant} className="border-2">
      <config.Icon className="h-4 w-4" />
      <AlertTitle className="font-bold">{config.title}</AlertTitle>
      <AlertDescription className="space-y-1 mt-1">
        <p>{config.message}</p>
        {config.extra && <p className="text-xs opacity-80">{config.extra}</p>}
      </AlertDescription>
    </Alert>
  );
};
