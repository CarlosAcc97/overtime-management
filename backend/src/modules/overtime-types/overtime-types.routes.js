import { Router } from 'express';
import { z } from 'zod';
import * as service from './overtime-types.service.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);

const schema = z.object({
  code: z.string().min(2).max(50, 'Código demasiado largo'),
  name: z.string().min(3, 'Nombre demasiado corto').max(100),
  factor: z.coerce.number().positive('El factor debe ser positivo').max(10),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

// Listado — disponible para todos los roles (necesario para dropdowns)
router.get('/', anyRole, async (req, res) => {
  const data = await service.findAll(req.query);
  ok(res, { overtimeTypes: data });
});

router.get('/:id', anyRole, async (req, res) => {
  const ot = await service.findById(req.params.id);
  ok(res, { overtimeType: ot });
});

// Administración — solo admin
router.post('/', onlyAdmin, async (req, res) => {
  const data = schema.parse(req.body);
  const ot = await service.create(data);
  created(res, { overtimeType: ot }, 'Tipo de hora extra creado correctamente');
});

router.put('/:id', onlyAdmin, async (req, res) => {
  const data = schema.partial().parse(req.body);
  const ot = await service.update(req.params.id, data);
  ok(res, { overtimeType: ot }, 'Tipo de hora extra actualizado correctamente');
});

router.patch('/:id/toggle', onlyAdmin, async (req, res) => {
  const ot = await service.toggleActive(req.params.id);
  ok(res, { overtimeType: ot }, `Tipo ${ot.isActive ? 'activado' : 'desactivado'} correctamente`);
});

export default router;
