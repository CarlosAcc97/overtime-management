import { Router } from 'express';
import * as overtimeController from './overtime.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);

// Rutas estáticas primero (deben ir ANTES de /:id para que Express no las confunda)
router.get('/check-limits', anyRole, overtimeController.checkLimits);
router.get('/my-stats', anyRole, overtimeController.getMyStats);
router.get('/cancelled-count', onlyAdmin, overtimeController.getCancelledCount);
router.get('/duplicates', onlyAdmin, overtimeController.getDuplicates);

// Rutas de colección
router.get('/', anyRole, overtimeController.getAll);
router.post('/', onlyAdmin, overtimeController.create);

// Mantenimiento masivo (antes de /:id para evitar conflictos)
router.delete('/purge-cancelled', onlyAdmin, overtimeController.purgeCancelled);

// Rutas con parámetro dinámico
router.get('/:id', anyRole, overtimeController.getById);
router.put('/:id', onlyAdmin, overtimeController.update);
router.delete('/:id', onlyAdmin, overtimeController.deleteRecord);

// Anulación: cualquier rol (con validación interna de permisos)
router.patch('/:id/cancel', anyRole, overtimeController.cancel);

export default router;
