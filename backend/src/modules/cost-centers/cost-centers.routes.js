import { Router } from 'express';
import { z } from 'zod';
import * as service from './cost-centers.service.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);

const schema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(3),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', anyRole, async (req, res) => {
  const data = await service.findAll(req.query);
  ok(res, { costCenters: data });
});

router.get('/:id', anyRole, async (req, res) => {
  const cc = await service.findById(req.params.id);
  ok(res, { costCenter: cc });
});

router.post('/', onlyAdmin, async (req, res) => {
  const data = schema.parse(req.body);
  const cc = await service.create(data);
  created(res, { costCenter: cc });
});

router.put('/:id', onlyAdmin, async (req, res) => {
  const data = schema.partial().parse(req.body);
  const cc = await service.update(req.params.id, data);
  ok(res, { costCenter: cc });
});

router.patch('/:id/toggle', onlyAdmin, async (req, res) => {
  const cc = await service.toggleActive(req.params.id);
  ok(res, { costCenter: cc }, `Centro de costo ${cc.isActive ? 'activado' : 'desactivado'} correctamente`);
});

export default router;
