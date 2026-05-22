/**
 * Seed de registros de horas extras
 * Se ejecuta después de seed.js: npm run db:seed:overtime
 */
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../data/overtime.db');
const client = createClient({ url: `file:${dbPath}` });

const exec = (sql) => client.execute(sql);
const ins = (sql, args) => client.execute({ sql, args });

// Genera fecha N días atrás (string YYYY-MM-DD)
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Día de semana: 0=dom, 6=sáb
const getDayType = (dateStr) => {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  if (day === 0) return 'domingo_festivo';
  if (day === 6) return 'sabado';
  return 'habil';
};

const getFactorForDay = (dayType) => ({ habil: 1.5, sabado: 2.0, domingo_festivo: 2.5 }[dayType]);

const calcHours = (s, e) => {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100;
};

// Encuentra un día hábil N días atrás (evita sáb/dom cuando queremos hábil)
const habilesDaysAgo = (n) => {
  const d = new Date();
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
};

const run = async () => {
  console.log('\n🌱 Seeding registros de horas extras...\n');
  await exec('PRAGMA foreign_keys = ON');

  // Obtener IDs de usuarios y centros de costo
  const { rows: allUsers } = await exec('SELECT id, role, supervisor_id FROM users ORDER BY id');
  const { rows: ccs } = await exec('SELECT id FROM cost_centers');

  const admins = allUsers.filter(u => u.role === 'administrador');
  const jefaturas = allUsers.filter(u => u.role === 'jefatura');
  const funcs = allUsers.filter(u => u.role === 'funcionario');
  const cc = ccs.map(c => c.id);

  // Actividades de ejemplo
  const activities = [
    'Atención de falla crítica en red de distribución sector norte, coordinación con brigada de emergencia',
    'Revisión y mantención de subestación eléctrica, pruebas de protocolo de seguridad',
    'Apoyo en instalación de medidores inteligentes para nuevos clientes del sector',
    'Coordinación de cuadrillas para trabajos urgentes de reposición de servicio',
    'Monitoreo nocturno del centro de control durante período de alta demanda',
    'Elaboración de informes técnicos requeridos por la superintendencia de electricidad',
    'Inspección de líneas de alta tensión tras evento climático, evaluación de daños',
    'Capacitación de nuevos técnicos en procedimientos de seguridad operacional',
    'Gestión de incidentes múltiples simultáneos en zona de distribución sur',
    'Actualización de base de datos de activos y levantamiento de terreno',
    'Reparación de transformador averiado en sector residencial de alta densidad',
    'Coordinación interáreas para proyecto de ampliación de red de baja tensión',
  ];

  const getActivity = (i) => activities[i % activities.length];
  const getCC = (i) => cc[i % cc.length];

  let recordCount = 0;
  const insertRecord = async (userId, date, startTime, endTime, status, alertLevel, approverInfo) => {
    const dayType = getDayType(date);
    const factor = getFactorForDay(dayType);
    const hours = calcHours(startTime, endTime);
    if (hours <= 0) return;

    const excessJust = alertLevel >= 1
      ? 'Trabajo urgente e impostergable requerido por la operación, autorizado por la jefatura respectiva con anterioridad'
      : null;

    const { rows: [rec] } = await ins(
      `INSERT INTO overtime_records (user_id,date,start_time,end_time,hours_calculated,day_type,factor,cost_center_id,activity_description,excess_justification,status,alert_level,requires_double_validation,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [userId, date, startTime, endTime, hours, dayType, factor, getCC(userId),
       getActivity(recordCount), excessJust, status, alertLevel, alertLevel >= 2 ? 1 : 0,
       date + 'T08:00:00', date + 'T08:00:00']
    );

    // Si tiene aprobación, insertar en tabla approvals
    if (['APROBADO', 'RECHAZADO', 'ACLARACION_SOLICITADA'].includes(status) && approverInfo) {
      await ins(
        `INSERT INTO approvals (overtime_record_id,approver_id,approval_level,action,comment,ip_address,created_at)
         VALUES (?,?,1,?,?,?,?)`,
        [rec.id, approverInfo.approverId,
         status === 'APROBADO' ? 'APROBAR' : status === 'RECHAZADO' ? 'RECHAZAR' : 'SOLICITAR_ACLARACION',
         approverInfo.comment, '127.0.0.1', date + 'T12:00:00']
      );
    }
    recordCount++;
  };

  // ─── Generar registros para funcionarios del Norte (j1 = id 2) ────────────
  const j1 = jefaturas[0]; // jefe.norte
  const j2 = jefaturas[1]; // jefe.sur
  const j3 = jefaturas[2]; // jefe.centro

  const norte = funcs.slice(0, 5);
  const sur = funcs.slice(5, 10);
  const centro = funcs.slice(10, 15);

  // Bloque 1: registros APROBADOS (hace 1-4 semanas)
  for (const [i, func] of norte.entries()) {
    await insertRecord(func.id, habilesDaysAgo(5 + i), '18:00', '20:00', 'APROBADO', 0, { approverId: j1.id, comment: 'Trabajo verificado y validado por jefatura directa.' });
    await insertRecord(func.id, habilesDaysAgo(10 + i), '17:30', '19:30', 'APROBADO', 0, { approverId: j1.id, comment: 'Aprobado. Horas justificadas por urgencia operacional.' });
    await insertRecord(func.id, habilesDaysAgo(15 + i * 2), '18:00', '21:00', 'APROBADO', 1, { approverId: j1.id, comment: 'Aprobado con exceso justificado. Situación de emergencia verificada.' });
  }
  for (const [i, func] of sur.entries()) {
    await insertRecord(func.id, habilesDaysAgo(3 + i), '18:00', '20:00', 'APROBADO', 0, { approverId: j2.id, comment: 'Aprobado. Actividad validada.' });
    await insertRecord(func.id, habilesDaysAgo(12 + i), '17:00', '19:00', 'APROBADO', 0, { approverId: j2.id, comment: 'Conforme. Horas dentro del rango normal.' });
    await insertRecord(func.id, habilesDaysAgo(20 + i), '18:00', '22:00', 'APROBADO', 2, { approverId: j2.id, comment: 'Aprobado con doble validación. Emergencia mayor zona sur.' });
  }
  for (const [i, func] of centro.entries()) {
    await insertRecord(func.id, habilesDaysAgo(7 + i), '19:00', '21:00', 'APROBADO', 0, { approverId: j3.id, comment: 'Validado.' });
    await insertRecord(func.id, habilesDaysAgo(14 + i * 2), '18:30', '20:30', 'APROBADO', 0, { approverId: j3.id, comment: 'Aprobado, trabajo crítico en centro de control.' });
  }

  // Bloque 2: registros PENDIENTES (últimos 5 días hábiles)
  for (const [i, func] of norte.slice(0, 3).entries()) {
    await insertRecord(func.id, habilesDaysAgo(1 + i), '18:00', '20:00', 'PENDIENTE', 0, null);
  }
  for (const [i, func] of sur.slice(0, 3).entries()) {
    await insertRecord(func.id, habilesDaysAgo(1 + i), '18:00', '20:30', 'PENDIENTE', 0, null);
  }
  for (const [i, func] of centro.slice(0, 2).entries()) {
    await insertRecord(func.id, habilesDaysAgo(1 + i), '18:00', '21:00', 'PENDIENTE', 1, null);
  }

  // Bloque 3: registros con ALERTA (amarilla y roja)
  await insertRecord(norte[0].id, habilesDaysAgo(2), '18:00', '21:30', 'PENDIENTE', 1, null);
  await insertRecord(sur[1].id, habilesDaysAgo(2), '17:00', '21:00', 'PENDIENTE', 2, null);
  await insertRecord(centro[2].id, habilesDaysAgo(3), '18:00', '22:00', 'PENDIENTE', 2, null);

  // Bloque 4: registros RECHAZADOS
  await insertRecord(norte[3].id, habilesDaysAgo(8), '18:00', '20:00', 'RECHAZADO', 0, { approverId: j1.id, comment: 'Rechazado: el trabajo descrito no corresponde a horas extras. Debe ingresarse como trabajo normal.' });
  await insertRecord(sur[4].id, habilesDaysAgo(9), '18:00', '20:00', 'RECHAZADO', 0, { approverId: j2.id, comment: 'Rechazado: no se cuenta con evidencia de la actividad realizada. Solicitar documentación.' });
  await insertRecord(centro[1].id, habilesDaysAgo(11), '17:00', '19:00', 'RECHAZADO', 0, { approverId: j3.id, comment: 'No válido: trabajo en horario regular.' });

  // Bloque 5: registros ACLARACIÓN SOLICITADA
  await insertRecord(norte[2].id, habilesDaysAgo(4), '18:00', '21:00', 'ACLARACION_SOLICITADA', 1, { approverId: j1.id, comment: 'Se requiere mayor detalle de la actividad realizada. Por favor especificar qué equipos se trabajaron y el resultado obtenido.' });
  await insertRecord(sur[0].id, habilesDaysAgo(4), '17:30', '20:30', 'ACLARACION_SOLICITADA', 0, { approverId: j2.id, comment: 'Aclaración requerida: el centro de costo indicado no corresponde a la actividad descrita.' });

  // Bloque 6: registros RETENIDOS (exceden límite mensual acumulado)
  await insertRecord(norte[4].id, habilesDaysAgo(6), '17:00', '23:00', 'RETENIDO', 3, null);

  // Bloque 7: registros ANULADOS
  await insertRecord(sur[2].id, habilesDaysAgo(18), '18:00', '20:00', 'ANULADO', 0, null);
  await insertRecord(centro[4].id, habilesDaysAgo(22), '18:00', '19:30', 'ANULADO', 0, null);
  // Actualizar razón de anulación
  await exec(`UPDATE overtime_records SET cancellation_reason='Registro duplicado, se anula para evitar doble pago', cancelled_by=1 WHERE status='ANULADO'`);

  // Bloque 8: registros de sábados y domingos
  const pasadoSabado = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 6 ? 7 : day + 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();
  await insertRecord(norte[0].id, pasadoSabado, '08:00', '13:00', 'APROBADO', 0, { approverId: j1.id, comment: 'Guardia de sábado aprobada. Factor 2.0 aplicado.' });
  await insertRecord(sur[1].id, pasadoSabado, '09:00', '14:00', 'APROBADO', 0, { approverId: j2.id, comment: 'Trabajo de sábado validado.' });
  await insertRecord(centro[0].id, pasadoSabado, '08:00', '12:00', 'PENDIENTE', 0, null);

  // Registros históricos (últimos 3 meses para el dashboard)
  for (let month = 1; month <= 3; month++) {
    for (const [i, func] of funcs.slice(0, 8).entries()) {
      const daysBack = month * 30 + (i * 3);
      if (daysBack > 90) continue;
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      // Asegurar día hábil
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      const dateStr = d.toISOString().slice(0, 10);
      const hours = 1 + (i % 3);
      const endHour = 18 + hours;
      await insertRecord(
        func.id, dateStr, '18:00', `${String(endHour).padStart(2, '0')}:00`,
        'APROBADO', 0,
        { approverId: [j1.id, j2.id, j3.id][i % 3], comment: 'Aprobado.' }
      );
    }
  }

  // También registros para las jefaturas
  await insertRecord(j1.id, habilesDaysAgo(6), '18:00', '20:00', 'PENDIENTE', 0, null);
  await insertRecord(j2.id, habilesDaysAgo(5), '18:00', '19:30', 'APROBADO', 0, { approverId: admins[0].id, comment: 'Validado por administración.' });

  console.log(`✅ ${recordCount} registros de horas extras creados\n`);
};

run().catch(err => { console.error('❌ Error:', err); process.exit(1); });
