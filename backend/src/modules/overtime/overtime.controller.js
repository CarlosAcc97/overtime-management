import * as overtimeService from './overtime.service.js';
import { createOvertimeSchema, cancelOvertimeSchema, checkLimitsSchema } from './overtime.validators.js';
import { ok, created, paginated } from '../../utils/response.js';

export const getAll = async (req, res) => {
  const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
  const result = await overtimeService.findAll({
    userId: req.user.id,
    role: req.user.role,
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    dateFrom,
    dateTo,
  });
  paginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
};

export const getById = async (req, res) => {
  const record = await overtimeService.findById(req.params.id);
  overtimeService.checkAccess(record, req.user);
  ok(res, { record });
};

export const create = async (req, res) => {
  const data = createOvertimeSchema.parse(req.body);
  const record = await overtimeService.create(data, req.user, req.ip);
  created(res, { record }, 'Registro de horas extras creado correctamente');
};

export const update = async (req, res) => {
  const data = createOvertimeSchema.parse(req.body);
  const record = await overtimeService.update(req.params.id, data, req.user, req.ip);
  ok(res, { record }, 'Registro actualizado correctamente');
};

export const cancel = async (req, res) => {
  const { cancellationReason } = cancelOvertimeSchema.parse(req.body);
  const record = await overtimeService.cancel(req.params.id, cancellationReason, req.user, req.ip);
  ok(res, { record }, 'Registro anulado correctamente');
};

export const checkLimits = async (req, res) => {
  const { userId, date, hours, excludeId } = checkLimitsSchema.parse(req.query);
  const result = await overtimeService.checkLimits(userId, date, hours, excludeId);
  ok(res, result);
};

export const getMyStats = async (req, res) => {
  const stats = await overtimeService.getStats(req.user.id);
  ok(res, stats);
};

export const deleteRecord = async (req, res) => {
  const result = await overtimeService.deleteRecord(req.params.id, req.user.id, req.ip);
  ok(res, result, 'Registro eliminado permanentemente');
};

export const getCancelledCount = async (req, res) => {
  const result = await overtimeService.countCancelled();
  ok(res, result);
};

export const getDuplicates = async (req, res) => {
  const result = await overtimeService.findDuplicates();
  ok(res, { duplicates: result, total: result.length });
};

export const purgeCancelled = async (req, res) => {
  const result = await overtimeService.purgeCancelled(req.user.id, req.ip);
  ok(res, result, `${result.deleted} registro(s) anulado(s) eliminado(s) permanentemente`);
};
