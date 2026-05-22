import { z } from 'zod';
import * as usersService from './users.service.js';
import { ok, created, paginated } from '../../utils/response.js';
import { logAudit } from '../../middleware/auditLogger.js';
import { ROLES } from '../../config/constants.js';
import { db } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const createUserSchema = z.object({
  employeeId: z.string().optional(),
  rut: z.string().optional(),
  firstName: z.string().min(2, 'Nombre muy corto'),
  lastName: z.string().min(2, 'Apellido muy corto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  role: z.enum(['funcionario', 'jefatura', 'administrador']),
  supervisorId: z.number().int().positive().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  costCenterId: z.number().int().positive().optional().nullable(),
  hourlyRate: z.number().positive().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

export const getAll = async (req, res) => {
  const { page = 1, limit = 20, search, role, departmentId, isActive } = req.query;
  const result = await usersService.findAll({
    search, role, departmentId, isActive,
    page: parseInt(page), limit: parseInt(limit),
  });
  paginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
};

export const getById = async (req, res) => {
  // Jefatura puede ver a sus subordinados; admin puede ver todos
  const user = await usersService.findById(req.params.id);
  if (req.user.role === ROLES.JEFATURA) {
    const team = await usersService.findTeam(req.user.id);
    const teamIds = team.map(u => u.id);
    if (!teamIds.includes(user.id) && user.id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Sin acceso a este usuario' });
    }
  }
  ok(res, { user });
};

export const create = async (req, res) => {
  const data = createUserSchema.parse(req.body);
  const user = await usersService.create(data);
  await logAudit({ userId: req.user.id, action: 'user.create', entityType: 'user', entityId: user.id, newValues: { email: user.email, role: user.role }, req });
  created(res, { user }, 'Usuario creado correctamente');
};

export const update = async (req, res) => {
  const data = updateUserSchema.parse(req.body);
  const beforeRows = await db.select().from(users).where(eq(users.id, parseInt(req.params.id))).limit(1);
  const before = beforeRows[0];
  const user = await usersService.update(req.params.id, data);
  await logAudit({ userId: req.user.id, action: 'user.update', entityType: 'user', entityId: user.id, oldValues: before, newValues: data, req });
  ok(res, { user }, 'Usuario actualizado correctamente');
};

export const toggleActive = async (req, res) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const user = await usersService.toggleActive(req.params.id, isActive);
  await logAudit({ userId: req.user.id, action: isActive ? 'user.activate' : 'user.deactivate', entityType: 'user', entityId: user.id, req });
  ok(res, { user }, `Usuario ${isActive ? 'activado' : 'desactivado'} correctamente`);
};

export const getTeam = async (req, res) => {
  const supervisorId = req.params.id || req.user.id;
  const team = await usersService.findTeam(supervisorId);
  ok(res, { team });
};

export const getSupervisors = async (req, res) => {
  const supervisors = await usersService.findSupervisors();
  ok(res, { supervisors });
};
