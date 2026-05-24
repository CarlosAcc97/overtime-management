/**
 * overtime.bulk.js
 * Generación de plantilla Excel y procesamiento de carga masiva de horas extras.
 */

import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import xlsx from 'xlsx';
import { db } from '../../config/database.js';
import { users, costCenters, overtimeTypes, overtimeRecords } from '../../db/schema.js';
import { eq, and, or, notInArray, ne, sql } from 'drizzle-orm';
import { authenticate } from '../../middleware/authenticate.js';
import { onlyAdmin } from '../../middleware/authorize.js';
import { calcHours, timesOverlap, daysFromToday } from '../../utils/dateHelpers.js';
import { calculateAlertLevel } from '../../services/alert.service.js';
import { STATUS } from '../../config/constants.js';

const router = Router();
// Nota: authenticate + onlyAdmin se aplican por ruta para no bloquear el paso
// hacia overtime.routes.js (que comparte el mismo prefijo /api/overtime).

// ─── Multer: almacena en memoria (límite 5 MB) ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.originalname.endsWith('.xlsx');
    cb(ok ? null : new Error('Solo se aceptan archivos .xlsx'), ok);
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza RUT: elimina puntos y guión para comparar */
const normalizeRut = (rut) =>
  (rut || '').toString().replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();

/** Convierte fecha de varios formatos a YYYY-MM-DD */
const parseDate = (val) => {
  if (!val) return null;
  // Si es número (serial de Excel)
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // DD/MM/AAAA
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // DD-MM-AAAA
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2,'0')}-${dmy2[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
};

/** Convierte hora: número decimal de Excel o string HH:MM → "HH:MM" */
const parseTime = (val) => {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    const total = Math.round(val * 1440); // fracción del día → minutos
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${h.padStart(2,'0')}:${m}`;
  }
  return null;
};

// ─── GET /template ────────────────────────────────────────────────────────────
router.get('/template', authenticate, onlyAdmin, async (req, res) => {
  // Obtener datos actuales del sistema para las hojas de referencia
  const ccList   = await db.select({ code: costCenters.code, name: costCenters.name }).from(costCenters).where(sql`is_active = 1`);
  const typeList = await db.select({ code: overtimeTypes.code, name: overtimeTypes.name, factor: overtimeTypes.factor }).from(overtimeTypes).where(sql`is_active = 1`);
  const userList = await db.select({
    employeeId: users.employeeId, firstName: users.firstName,
    lastName: users.lastName, email: users.email, rut: users.rut,
  }).from(users).where(sql`is_active = 1`).orderBy(users.lastName);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Horas Extras — Gerencia de Distribución';
  wb.created = new Date();

  // ── Hoja 1: Carga de datos ──────────────────────────────────────────────────
  const ws = wb.addWorksheet('Carga Horas Extras', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  // Estilos
  const titleFont  = { bold: true, size: 13, color: { argb: 'FF1e3a8a' } };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e40af' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const reqFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } };
  const optFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fdf4' } };
  const exFill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef9c3' } };
  const thin       = { style: 'thin', color: { argb: 'FFd1d5db' } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

  // Fila 1: Título
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'PLANTILLA DE CARGA MASIVA — HORAS EXTRAS';
  ws.getCell('A1').font  = titleFont;
  ws.getCell('A1').alignment = { horizontal: 'center' };

  // Fila 2: instrucciones
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = 'Ingrese los datos desde la fila 4. Consulte la hoja "Funcionarios" para copiar nombres, RUT y email. Use "Valores válidos" para códigos de Tipo y Centro de Costo. Columnas B o C son obligatorias (al menos una).';
  ws.getCell('A2').font  = { italic: true, size: 9, color: { argb: 'FF6b7280' } };
  ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(2).height = 28;

  // Fila 3: Encabezados de columna
  const COLS = [
    { header: 'Nombre Funcionario',  key: 'nombre',    width: 30, note: 'Nombre del funcionario (referencia). No es usado para identificar — use RUT o Email.' },
    { header: 'RUT *',               key: 'rut',       width: 18, note: 'RUT del funcionario (ej: 12.345.678-9). Requerido si no se ingresa Email.' },
    { header: 'Email *',             key: 'email',     width: 32, note: 'Email del funcionario (ej: jessica.alvarez@distrib.cl). Requerido si no se ingresa RUT.' },
    { header: 'Fecha *',             key: 'fecha',     width: 14, note: 'Formato DD/MM/AAAA (ej: 21/05/2026).' },
    { header: 'Hora Inicio *',       key: 'inicio',    width: 14, note: 'Formato HH:MM en 24 horas (ej: 18:00).' },
    { header: 'Hora Término *',      key: 'termino',   width: 14, note: 'Formato HH:MM en 24 horas (ej: 20:30).' },
    { header: 'Tipo Hora Extra *',   key: 'tipo',      width: 20, note: 'Código del tipo. Ver hoja "Valores válidos".' },
    { header: 'Centro de Costo *',   key: 'cc',        width: 20, note: 'Código del centro. Ver hoja "Valores válidos".' },
  ];

  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

  const headerRow = ws.getRow(3);
  COLS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font  = headerFont;
    cell.fill  = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = allBorders;
    cell.note   = col.note;
  });
  headerRow.height = 30;

  // Filas de ejemplo (fila 4 y 5)
  const examples = [
    ['Jessica Álvarez',  '12.345.678-9', 'jessica.alvarez@distrib.cl', '21/05/2026', '18:00', '20:00', 'extra',       'TER'],
    ['Julio Valdés',     null,           'julio.valdes@distrib.cl',    '21/05/2026', '19:00', '21:30', 'super_extra', 'ADM'],
  ];
  examples.forEach((ex, rowIdx) => {
    const row = ws.getRow(4 + rowIdx);
    ex.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value  = val;
      cell.fill   = exFill;
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle' };
      // Columnas de hora (E y F, índices 4 y 5): formato texto
      if (colIdx === 4 || colIdx === 5) cell.numFmt = '@';
    });
    row.height = 18;
  });

  // Filas vacías para ingresar datos (6–205: 200 filas)
  for (let r = 6; r <= 205; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      // Col A (nombre), B (rut), C (email): fondo verde claro (opcional/referencia)
      cell.fill   = c <= 3 ? optFill : reqFill;
      cell.border = allBorders;
      // Cols E y F (hora inicio/término): formato texto
      if (c === 5 || c === 6) cell.numFmt = '@';
    }
    row.height = 18;
  }

  // Validaciones de lista para Tipo (col G) y Centro de Costo (col H)
  const typeCodes = typeList.map(t => t.code).join(',');
  const ccCodes   = ccList.map(c => c.code).join(',');
  for (let r = 4; r <= 205; r++) {
    ws.getCell(`G${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: [`"${typeCodes}"`],
      showErrorMessage: true, errorTitle: 'Valor inválido',
      error: `Usa uno de: ${typeCodes}`,
    };
    ws.getCell(`H${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: [`"${ccCodes}"`],
      showErrorMessage: true, errorTitle: 'Valor inválido',
      error: `Usa uno de: ${ccCodes}`,
    };
  }

  // ── Hoja 2: Valores válidos ──────────────────────────────────────────────────
  const wsRef = wb.addWorksheet('Valores válidos');
  wsRef.columns = [
    { header: 'Código Tipo', key: 'tc', width: 16 },
    { header: 'Nombre',      key: 'tn', width: 30 },
    { header: 'Factor',      key: 'tf', width: 10 },
    { header: '',            key: 'sp', width: 4  },
    { header: 'Código CC',  key: 'cc', width: 14 },
    { header: 'Nombre CC',  key: 'cn', width: 28 },
  ];
  [[1],[2],[3],[4],[5],[6]].forEach((_, i) => {
    const cell = wsRef.getRow(1).getCell(i + 1);
    cell.font = headerFont; cell.fill = headerFill; cell.border = allBorders;
    cell.alignment = { horizontal: 'center' };
  });
  typeList.forEach((t, i) => {
    wsRef.getRow(i + 2).values = [t.code, t.name, `${t.factor}x`, '', ccList[i]?.code || '', ccList[i]?.name || ''];
  });
  wsRef.columns.forEach(c => { wsRef.getColumn(c.key).width = c.width; });

  // ── Hoja 3: Nómina de funcionarios ──────────────────────────────────────────
  const wsUsers = wb.addWorksheet('Funcionarios');
  wsUsers.columns = [
    { header: 'ID Empleado', key: 'eid',   width: 14 },
    { header: 'Apellidos',   key: 'last',  width: 26 },
    { header: 'Nombres',     key: 'first', width: 22 },
    { header: 'Email',       key: 'email', width: 38 },
    { header: 'RUT',         key: 'rut',   width: 16 },
  ];
  [1,2,3,4,5].forEach(i => {
    const cell = wsUsers.getRow(1).getCell(i);
    cell.font = headerFont; cell.fill = headerFill; cell.border = allBorders;
    cell.alignment = { horizontal: 'center' };
  });
  userList.forEach((u, i) => {
    const row = wsUsers.getRow(i + 2);
    row.values = [u.employeeId || '', u.lastName, u.firstName, u.email, u.rut || ''];
    if (i % 2 === 0) {
      [1,2,3,4,5].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf8fafc' } }; });
    }
    [1,2,3,4,5].forEach(c => { row.getCell(c).border = allBorders; });
  });

  // ── Enviar ──────────────────────────────────────────────────────────────────
  const filename = `plantilla-horas-extras-${new Date().toISOString().slice(0,10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── POST /bulk ────────────────────────────────────────────────────────────────
router.post('/bulk', authenticate, onlyAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });

  // ── Leer Excel ──────────────────────────────────────────────────────────────
  const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: false });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Buscar la fila de encabezados (fila con "RUT" o "Email")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map(c => String(c || '').trim().toLowerCase());
    if (row.some(c => c.includes('rut') || c.includes('email'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return res.status(400).json({ success: false, message: 'No se encontró la fila de encabezados (debe contener "RUT" o "Email").' });
  }

  // Mapear columnas por nombre de encabezado
  const headers = rows[headerIdx].map(h => String(h || '').trim().toLowerCase());
  const col = (names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const C = {
    rut:    col(['rut']),
    email:  col(['email', 'correo']),
    fecha:  col(['fecha']),
    inicio: col(['inicio', 'start', 'entrada']),
    fin:    col(['término', 'termino', 'fin', 'end', 'salida']),
    tipo:   col(['tipo']),
    cc:     col(['centro', 'costo', 'cc']),
  };

  // Pre-cargar datos del sistema para lookups (consultas secuenciales — libsql/SQLite no soporta concurrencia)
  const allUsers = await db.select({
    id: users.id, email: users.email, rut: users.rut,
    firstName: users.firstName, lastName: users.lastName,
    isActive: users.isActive,
  }).from(users);
  const allCostCenters  = await db.select({ id: costCenters.id, code: costCenters.code }).from(costCenters).where(sql`is_active = 1`);
  const allOvertimeTypes = await db.select({ code: overtimeTypes.code, factor: overtimeTypes.factor, name: overtimeTypes.name }).from(overtimeTypes).where(sql`is_active = 1`);

  const userByEmail = Object.fromEntries(allUsers.map(u => [u.email.toLowerCase(), u]));
  const userByRut   = Object.fromEntries(allUsers.filter(u => u.rut).map(u => [normalizeRut(u.rut), u]));
  const ccByCode    = Object.fromEntries(allCostCenters.map(c => [c.code.toUpperCase(), c.id]));
  const typeByCode  = Object.fromEntries(allOvertimeTypes.map(t => [t.code.toLowerCase(), t]));

  // ── Procesar filas ──────────────────────────────────────────────────────────
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== null && c !== ''));
  const results  = [];
  let created = 0, skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row   = dataRows[i];
    const rowNum = headerIdx + 2 + i; // número de fila en Excel (1-indexed)
    const errors = [];

    // ── Identificar funcionario ────────────────────────────────────────────
    const rutVal   = C.rut   !== -1 ? row[C.rut]   : null;
    const emailVal = C.email !== -1 ? row[C.email]  : null;

    let employee = null;
    if (emailVal) employee = userByEmail[(emailVal || '').toString().toLowerCase().trim()];
    if (!employee && rutVal) employee = userByRut[normalizeRut(rutVal)];
    if (!employee) errors.push('Funcionario no encontrado (revisa RUT o email)');
    else if (!employee.isActive) errors.push('Funcionario inactivo');

    // ── Fecha ──────────────────────────────────────────────────────────────
    const fecha = parseDate(row[C.fecha]);
    if (!fecha) errors.push('Fecha inválida (usa DD/MM/AAAA)');
    else if (daysFromToday(fecha) < 0) errors.push('No se permiten fechas futuras');

    // ── Horas ──────────────────────────────────────────────────────────────
    const startTime = parseTime(row[C.inicio]);
    const endTime   = parseTime(row[C.fin]);
    if (!startTime) errors.push('Hora inicio inválida (usa HH:MM)');
    if (!endTime)   errors.push('Hora término inválida (usa HH:MM)');
    if (startTime && endTime) {
      const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
      if (toMin(endTime) <= toMin(startTime)) errors.push('La hora de término debe ser posterior a la hora de inicio');
    }

    // ── Tipo de hora extra ────────────────────────────────────────────────
    const tipoCode = (row[C.tipo] || '').toString().trim().toLowerCase();
    const tipoObj  = typeByCode[tipoCode];
    if (!tipoObj) errors.push(`Tipo inválido "${row[C.tipo]}" — usa: ${Object.keys(typeByCode).join(', ')}`);

    // ── Centro de costo ────────────────────────────────────────────────────
    const ccCode = (row[C.cc] || '').toString().trim().toUpperCase();
    const ccId   = ccByCode[ccCode];
    if (!ccId) errors.push(`Centro de costo inválido "${row[C.cc]}" — usa: ${Object.keys(ccByCode).join(', ')}`);

    // ── Si hay errores, registrar y continuar ──────────────────────────────
    if (errors.length) {
      results.push({ fila: rowNum, estado: 'error', funcionario: emailVal || rutVal || '—', fecha, errors });
      skipped++;
      continue;
    }

    // ── Verificar solapamiento ─────────────────────────────────────────────
    const existentes = await db.select({
      id: overtimeRecords.id, startTime: overtimeRecords.startTime, endTime: overtimeRecords.endTime,
    }).from(overtimeRecords).where(
      and(
        eq(overtimeRecords.userId, employee.id),
        eq(overtimeRecords.date, fecha),
        notInArray(overtimeRecords.status, [STATUS.RECHAZADO, STATUS.ANULADO]),
      )
    );

    const overlap = existentes.find(r => timesOverlap(r.startTime, r.endTime, startTime, endTime));
    if (overlap) {
      results.push({
        fila: rowNum, estado: 'error',
        funcionario: `${employee.firstName} ${employee.lastName}`,
        fecha,
        errors: [`Ya existe un registro en ese horario (${overlap.startTime}–${overlap.endTime})`],
      });
      skipped++;
      continue;
    }

    // ── Calcular horas y nivel de alerta ──────────────────────────────────
    const hoursCalculated = calcHours(startTime, endTime);
    const factor          = tipoObj.factor;

    const { alertLevel, requiresDoubleValidation, status } = await calculateAlertLevel(
      employee.id, fecha, hoursCalculated
    );

    const finalStatus = status || STATUS.PENDIENTE;

    // ── Insertar registro ─────────────────────────────────────────────────
    await db.insert(overtimeRecords).values({
      userId:          employee.id,
      createdById:     req.user.id,
      date:            fecha,
      startTime,
      endTime,
      hoursCalculated,
      overtimeType:    tipoCode,
      factor,
      costCenterId:    ccId,
      status:          finalStatus,
      alertLevel,
      requiresDoubleValidation,
    });

    created++;
    results.push({
      fila:         rowNum,
      estado:       'ok',
      funcionario:  `${employee.firstName} ${employee.lastName}`,
      fecha,
      horas:        hoursCalculated,
      tipo:         tipoObj.name,
      alertLevel,
      status:       finalStatus,
    });
  }

  res.json({
    success: true,
    message: `Carga completada: ${created} registros creados, ${skipped} con errores.`,
    data: { created, skipped, total: dataRows.length, results },
  });
});

export default router;
