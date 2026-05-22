import { Router } from 'express';
import * as usersController from './users.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin, onlyJefaturaOrAdmin, anyRole } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.get('/', onlyJefaturaOrAdmin, usersController.getAll);
router.get('/supervisors', anyRole, usersController.getSupervisors);
router.get('/my-team', onlyJefaturaOrAdmin, usersController.getTeam);
router.get('/:id/team', onlyAdmin, usersController.getTeam);
router.get('/:id', onlyJefaturaOrAdmin, usersController.getById);
router.post('/', onlyAdmin, usersController.create);
router.put('/:id', onlyAdmin, usersController.update);
router.patch('/:id/toggle-active', onlyAdmin, usersController.toggleActive);

export default router;
