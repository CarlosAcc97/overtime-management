import { Router } from 'express';
import * as overtimeController from './overtime.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);

// Consultas disponibles para todos los roles autenticados
router.get('/check-limits', anyRole, overtimeController.checkLimits);
router.get('/my-stats', anyRole, overtimeController.getMyStats);
router.get('/', anyRole, overtimeController.getAll);
router.get('/:id', anyRole, overtimeController.getById);

// Creación y edición: solo administrador
router.post('/', onlyAdmin, overtimeController.create);
router.put('/:id', onlyAdmin, overtimeController.update);

// Mantenimiento de datos: solo administrador
router.get('/cancelled-count', onlyAdmin, overtimeController.getCancelledCount);
router.delete('/purge-cancelled', onlyAdmin, overtimeController.purgeCancelled);
router.delete('/:id', onlyAdmin, overtimeController.deleteRecord);

// Anulación: cualquier rol (con validación interna de permisos)
router.patch('/:id/cancel', anyRole, overtimeController.cancel);

export default router;
