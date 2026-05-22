import { z } from 'zod';

/**
 * Creación de registro (solo admin).
 * NO incluye activityDescription ni excessJustification —
 * esos campos los completa la jefatura al momento de aprobar.
 */
export const createOvertimeSchema = z.object({
  userId: z.coerce.number().int().positive('Funcionario requerido'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  overtimeType: z.string().min(1, 'Tipo de hora extra requerido'),
  costCenterId: z.coerce.number().int().positive('Centro de costo requerido'),
}).superRefine((data, ctx) => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  if (toMin(data.endTime) <= toMin(data.startTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'La hora de término debe ser posterior a la hora de inicio',
    });
  }
});

export const cancelOvertimeSchema = z.object({
  cancellationReason: z
    .string()
    .min(10, 'El motivo de anulación debe tener al menos 10 caracteres'),
});

export const checkLimitsSchema = z.object({
  userId: z.coerce.number().int().positive('Funcionario requerido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().positive().max(24),
  excludeId: z.coerce.number().optional(),
});
