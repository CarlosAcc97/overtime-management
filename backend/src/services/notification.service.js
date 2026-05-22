/**
 * Servicio de Notificaciones
 *
 * Actualmente simula el envío en consola.
 * Para activar envío real: reemplazar `sendEmail` con Nodemailer + SMTP.
 * La interfaz del servicio no cambia — solo la implementación interna.
 */

import { db } from '../config/database.js';
import { notifications, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { NOTIFICATION_TYPES } from '../config/constants.js';

const CONSOLE_COLORS = {
  APROBACION: '\x1b[32m',  // verde
  RECHAZO: '\x1b[31m',     // rojo
  ACLARACION: '\x1b[33m',  // amarillo
  ALERTA: '\x1b[35m',      // magenta
  RETENIDO: '\x1b[31m',    // rojo
  RESET: '\x1b[0m',
};

/**
 * Simulación de envío de email (consola)
 */
const sendEmail = async ({ to, subject, body }) => {
  const color = CONSOLE_COLORS.RESET;
  console.log('\n' + '═'.repeat(60));
  console.log(`${color}[📧 EMAIL SIMULADO]${CONSOLE_COLORS.RESET}`);
  console.log(`  Para: ${to}`);
  console.log(`  Asunto: ${subject}`);
  console.log(`  Cuerpo:\n${body.split('\n').map(l => '    ' + l).join('\n')}`);
  console.log('═'.repeat(60) + '\n');
  return true;
};

/**
 * Envía una notificación y la persiste en la base de datos
 */
export const sendNotification = async ({ recipientId, senderId, overtimeRecordId, type, subject, body }) => {
  // Persiste en la tabla de notificaciones
  const [notif] = await db.insert(notifications).values({
    recipientId,
    senderId: senderId ?? null,
    overtimeRecordId: overtimeRecordId ?? null,
    type,
    subject,
    body,
    status: 'PENDIENTE',
  }).returning();

  // Obtiene email del destinatario
  const [recipient] = await db.select({ email: users.email, firstName: users.firstName })
    .from(users).where(eq(users.id, recipientId)).limit(1);

  if (!recipient) {
    await db.update(notifications)
      .set({ status: 'ERROR', errorMessage: 'Destinatario no encontrado' })
      .where(eq(notifications.id, notif.id));
    return;
  }

  try {
    await sendEmail({ to: recipient.email, subject, body });
    await db.update(notifications)
      .set({ status: 'ENVIADO', sentAt: new Date().toISOString() })
      .where(eq(notifications.id, notif.id));
  } catch (err) {
    await db.update(notifications)
      .set({ status: 'ERROR', errorMessage: err.message })
      .where(eq(notifications.id, notif.id));
  }
};

// ─── Templates de notificación ────────────────────────────────────────────────

export const notifyApproval = async ({ record, approver, recipient }) => {
  await sendNotification({
    recipientId: recipient.id,
    senderId: approver.id,
    overtimeRecordId: record.id,
    type: NOTIFICATION_TYPES.APROBACION,
    subject: `✅ Horas extras aprobadas - ${record.date}`,
    body: `Estimado/a ${recipient.firstName},\n\nTu registro de horas extras del ${record.date} (${record.hoursCalculated} hrs) ha sido APROBADO por ${approver.firstName} ${approver.lastName}.\n\nPuedes ver el detalle en el sistema.\n\nSaludos,\nSistema de Horas Extras`,
  });
};

export const notifyRejection = async ({ record, approver, recipient, comment }) => {
  await sendNotification({
    recipientId: recipient.id,
    senderId: approver.id,
    overtimeRecordId: record.id,
    type: NOTIFICATION_TYPES.RECHAZO,
    subject: `❌ Horas extras rechazadas - ${record.date}`,
    body: `Estimado/a ${recipient.firstName},\n\nTu registro de horas extras del ${record.date} (${record.hoursCalculated} hrs) ha sido RECHAZADO.\n\nMotivo: ${comment}\n\nSi tienes dudas, contacta a tu jefatura directa.\n\nSaludos,\nSistema de Horas Extras`,
  });
};

export const notifyClarification = async ({ record, approver, recipient, comment }) => {
  await sendNotification({
    recipientId: recipient.id,
    senderId: approver.id,
    overtimeRecordId: record.id,
    type: NOTIFICATION_TYPES.ACLARACION,
    subject: `⚠️ Se solicita aclaración - Horas extras ${record.date}`,
    body: `Estimado/a ${recipient.firstName},\n\nTu registro de horas extras del ${record.date} requiere una aclaración.\n\nSolicitud: ${comment}\n\nPor favor, accede al sistema y responde a la brevedad.\n\nSaludos,\nSistema de Horas Extras`,
  });
};

export const notifyAlert = async ({ recipientId, record, alertLevel, hoursDay }) => {
  const levelText = alertLevel === 2 ? 'ADVERTENCIA' : 'ALERTA CRÍTICA';
  await sendNotification({
    recipientId,
    overtimeRecordId: record?.id,
    type: NOTIFICATION_TYPES.ALERTA,
    subject: `🚨 ${levelText} - Exceso de horas extras`,
    body: `Se ha detectado un exceso de horas extras.\n\nFuncionario ID: ${record?.userId}\nFecha: ${record?.date}\nHoras registradas: ${hoursDay}\nNivel de alerta: ${alertLevel}\n\nRevisa el dashboard para más detalles.\n\nSistema de Horas Extras`,
  });
};

export const notifyRetained = async ({ record, adminId }) => {
  await sendNotification({
    recipientId: adminId,
    overtimeRecordId: record.id,
    type: NOTIFICATION_TYPES.RETENIDO,
    subject: `🔴 Registro RETENIDO - Revisión requerida`,
    body: `Un registro de horas extras ha sido retenido automáticamente por superar el límite mensual configurado.\n\nFuncionario ID: ${record.userId}\nFecha: ${record.date}\nHoras: ${record.hoursCalculated}\n\nAccede al sistema para revisar y resolver.\n\nSistema de Horas Extras`,
  });
};
