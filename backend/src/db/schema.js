import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

// ─── Departamentos ────────────────────────────────────────────────────────────
export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Centros de costo ─────────────────────────────────────────────────────────
export const costCenters = sqliteTable('cost_centers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Tipos de hora extra ──────────────────────────────────────────────────────
// Ejemplos: Horas extras (1.5), Super extras (2.0), Especiales (2.5)
export const overtimeTypes = sqliteTable('overtime_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),       // 'extra', 'super_extra', 'especial'
  name: text('name').notNull(),                // 'Horas extras', 'Horas super extras', 'Horas especiales'
  factor: real('factor').notNull().default(1.5),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Usuarios ─────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: text('employee_id').unique(),
  rut: text('rut').unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['funcionario', 'jefatura', 'administrador'] }).notNull(),
  supervisorId: integer('supervisor_id'),
  departmentId: integer('department_id').references(() => departments.id),
  costCenterId: integer('cost_center_id').references(() => costCenters.id),
  hourlyRate: real('hourly_rate').default(5000),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  refreshToken: text('refresh_token'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Registros de horas extras ────────────────────────────────────────────────
export const overtimeRecords = sqliteTable('overtime_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),       // funcionario al que pertenece
  createdById: integer('created_by_id').references(() => users.id),     // admin que ingresó el registro
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  hoursCalculated: real('hours_calculated').notNull(),
  overtimeType: text('overtime_type').notNull(),          // code de overtime_types (ej: 'extra')
  factor: real('factor').notNull(),                        // copiado de overtime_types al crear
  costCenterId: integer('cost_center_id').references(() => costCenters.id),
  activityCategory: text('activity_category'),           // categoría predefinida del motivo de hora extra
  activityDescription: text('activity_description'),   // ingresado por jefatura al aprobar
  excessJustification: text('excess_justification'),    // ingresado por jefatura al aprobar si alertLevel >= 1
  status: text('status', {
    enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'ACLARACION_SOLICITADA', 'ANULADO', 'RETENIDO'],
  }).default('PENDIENTE'),
  alertLevel: integer('alert_level').default(0),
  requiresDoubleValidation: integer('requires_double_validation', { mode: 'boolean' }).default(false),
  firstApprovalBy: integer('first_approval_by'),
  firstApprovalAt: text('first_approval_at'),
  cancellationReason: text('cancellation_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: text('cancelled_at'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Aprobaciones ─────────────────────────────────────────────────────────────
export const approvals = sqliteTable('approvals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  overtimeRecordId: integer('overtime_record_id').notNull().references(() => overtimeRecords.id),
  approverId: integer('approver_id').notNull().references(() => users.id),
  approvalLevel: integer('approval_level').default(1),
  action: text('action', { enum: ['APROBAR', 'RECHAZAR', 'SOLICITAR_ACLARACION'] }).notNull(),
  comment: text('comment').notNull(),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Logs de alertas ──────────────────────────────────────────────────────────
export const alertLogs = sqliteTable('alert_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  overtimeRecordId: integer('overtime_record_id').references(() => overtimeRecords.id),
  userId: integer('user_id').notNull().references(() => users.id),
  alertLevel: integer('alert_level').notNull(),
  hoursDay: real('hours_day'),
  weeklyAccumulated: real('weekly_accumulated'),
  monthlyAccumulated: real('monthly_accumulated'),
  justification: text('justification'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: text('reviewed_at'),
  resolution: text('resolution'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Logs de auditoría ────────────────────────────────────────────────────────
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  oldValues: text('old_values'),
  newValues: text('new_values'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Notificaciones ───────────────────────────────────────────────────────────
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  senderId: integer('sender_id').references(() => users.id),
  overtimeRecordId: integer('overtime_record_id').references(() => overtimeRecords.id),
  type: text('type', { enum: ['APROBACION', 'RECHAZO', 'ACLARACION', 'ALERTA', 'RETENIDO'] }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  sentAt: text('sent_at'),
  status: text('status', { enum: ['PENDIENTE', 'ENVIADO', 'ERROR'] }).default('PENDIENTE'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Configuración del sistema ────────────────────────────────────────────────
export const systemConfig = sqliteTable('system_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: text('updated_at').default(sql`(datetime('now','localtime'))`),
});

// ─── Relaciones ───────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  costCenter: one(costCenters, { fields: [users.costCenterId], references: [costCenters.id] }),
  supervisor: one(users, { fields: [users.supervisorId], references: [users.id], relationName: 'supervisor' }),
  subordinates: many(users, { relationName: 'supervisor' }),
  overtimeRecords: many(overtimeRecords),
}));

export const overtimeRecordsRelations = relations(overtimeRecords, ({ one, many }) => ({
  user: one(users, { fields: [overtimeRecords.userId], references: [users.id] }),
  createdBy: one(users, { fields: [overtimeRecords.createdById], references: [users.id] }),
  costCenter: one(costCenters, { fields: [overtimeRecords.costCenterId], references: [costCenters.id] }),
  approvals: many(approvals),
  alertLogs: many(alertLogs),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  overtimeRecord: one(overtimeRecords, { fields: [approvals.overtimeRecordId], references: [overtimeRecords.id] }),
  approver: one(users, { fields: [approvals.approverId], references: [users.id] }),
}));
