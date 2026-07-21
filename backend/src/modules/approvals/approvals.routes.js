import { Router } from 'express';
import { z } from 'zod';
import * as service from './approvals.service.js';
import { ok, paginated } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyJefaturaOrAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);

// ─── Validadores ──────────────────────────────────────────────────────────────
const ACTIVITY_CATEGORIES = [
  'Trabajo Administrativo',
  'Contingencia',
  'Atención de Reclamos',
  'Planificación Deficiente',
  'Requerimientos Urgentes',
  'Otro',
];

const approveSchema = z.object({
  activityCategory: z.enum(ACTIVITY_CATEGORIES, {
    errorMap: () => ({ message: 'Selecciona una categoría de actividad' }),
  }),
  excessJustification: z.string().optional().nullable(),
  comment: z
    .string()
    .min(10, 'El comentario es obligatorio (mínimo 10 caracteres)'),
});

const actionSchema = z.object({
  comment: z
    .string()
    .min(10, 'El comentario es obligatorio (mínimo 10 caracteres)'),
});

// ─── Bandeja pendiente ────────────────────────────────────────────────────────
router.get('/', onlyJefaturaOrAdmin, async (req, res) => {
  const { page = 1, limit = 20, dateFrom, dateTo, search } = req.query;
  const result = await service.getPendingForApproval(req.user, {
    page: parseInt(page),
    limit: parseInt(limit),
    dateFrom,
    dateTo,
    search,
  });
  paginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
});

// ─── Estadísticas de la bandeja ───────────────────────────────────────────────
router.get('/stats', onlyJefaturaOrAdmin, async (req, res) => {
  const stats = await service.getApprovalStats(req.user);
  ok(res, stats);
});

// ─── Historial de aprobaciones de un registro ─────────────────────────────────
router.get('/history/:overtimeId', anyRole, async (req, res) => {
  const history = await service.getApprovalHistory(req.params.overtimeId);
  ok(res, { history });
});

// ─── Acciones de aprobación ───────────────────────────────────────────────────
router.post('/:id/approve', onlyJefaturaOrAdmin, async (req, res) => {
  const data = approveSchema.parse(req.body);
  const record = await service.approve(req.params.id, data, req.user, req.ip);
  ok(res, { record }, 'Registro aprobado correctamente');
});

router.post('/:id/reject', onlyJefaturaOrAdmin, async (req, res) => {
  const { comment } = actionSchema.parse(req.body);
  const record = await service.reject(req.params.id, { comment }, req.user, req.ip);
  ok(res, { record }, 'Registro rechazado');
});

router.post('/:id/clarify', onlyJefaturaOrAdmin, async (req, res) => {
  const { comment } = actionSchema.parse(req.body);
  const record = await service.requestClarification(req.params.id, { comment }, req.user, req.ip);
  ok(res, { record }, 'Aclaración solicitada al administrador');
});

export default router;
