/**
 * seed-real.js
 * Carga la nómina real desde el Excel de la Gerencia de Distribución.
 * Borra y recrea la base de datos completa.
 *
 * Uso:  node src/db/seed-real.js
 */

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Ruta del Excel ────────────────────────────────────────────────────────────
const EXCEL_PATH = path.join(
  'C:', 'Users', 'Carlos Cumillanca', 'Programas',
  'Subgerencia de Ingenieria',
  'Nomina de Funcionarios Gerencia de Distribución .xlsx'
);

// ─── Contraseña por defecto para todos los usuarios ───────────────────────────
const DEFAULT_PASSWORD = 'Distrib2024!';

// ─── Conexión ──────────────────────────────────────────────────────────────────
const rawUrl = process.env.DATABASE_URL || './data/overtime.db';
const absPath = path.resolve(__dirname, '../../', rawUrl.replace(/^file:/, ''));
const dbDir = path.dirname(absPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const client = createClient({ url: `file:${absPath}` });

const run = (sql, args = []) => client.execute({ sql, args });

// ─── Normalización de texto ────────────────────────────────────────────────────
function normalize(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // quitar tildes
    .replace(/[^a-z\s]/g, '')         // solo letras y espacios
    .trim();
}

function makeEmail(nombres, apellidos) {
  const firstName = normalize(nombres).split(/\s+/)[0];   // primer nombre
  const lastName  = normalize(apellidos).split(/\s+/)[0]; // primer apellido
  return `${firstName}.${lastName}@cooprel.cl`;
}

// Normaliza un nombre completo "Apellidos Nombres" o "Nombres Apellidos" para matching
function normalizeName(str) {
  return normalize(str).split(/\s+/).sort().join(' ');
}

// ─── Determinar rol ────────────────────────────────────────────────────────────
function getRole(apellidos, nombres, categoria) {
  const fullName = `${nombres} ${apellidos}`.toLowerCase();
  // Carlos Cumillanca es el administrador del sistema
  if (fullName.includes('cumillanca')) return 'administrador';
  // Ejecutivos y jefaturas de departamento
  if (['jefatura', 'ejecutivo'].includes((categoria || '').toLowerCase())) return 'jefatura';
  return 'funcionario';
}

// ─── DDL completo (sincronizado con schema.js) ────────────────────────────────
const TABLES = [
  `CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, parent_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS cost_centers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
    is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS overtime_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, factor REAL NOT NULL DEFAULT 1.5,
    description TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE, rut TEXT UNIQUE,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('funcionario','jefatura','administrador')),
    supervisor_id INTEGER REFERENCES users(id),
    department_id INTEGER REFERENCES departments(id),
    cost_center_id INTEGER REFERENCES cost_centers(id),
    hourly_rate REAL DEFAULT 5000, is_active INTEGER DEFAULT 1,
    refresh_token TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS overtime_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_by_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
    hours_calculated REAL NOT NULL,
    overtime_type TEXT NOT NULL,
    factor REAL NOT NULL,
    cost_center_id INTEGER REFERENCES cost_centers(id),
    activity_description TEXT, excess_justification TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    alert_level INTEGER DEFAULT 0, requires_double_validation INTEGER DEFAULT 0,
    first_approval_by INTEGER, first_approval_at TEXT,
    cancellation_reason TEXT, cancelled_by INTEGER REFERENCES users(id), cancelled_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    overtime_record_id INTEGER NOT NULL REFERENCES overtime_records(id),
    approver_id INTEGER NOT NULL REFERENCES users(id),
    approval_level INTEGER DEFAULT 1,
    action TEXT NOT NULL CHECK(action IN ('APROBAR','RECHAZAR','SOLICITAR_ACLARACION')),
    comment TEXT NOT NULL, ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    overtime_record_id INTEGER REFERENCES overtime_records(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    alert_level INTEGER NOT NULL, hours_day REAL, weekly_accumulated REAL,
    monthly_accumulated REAL, justification TEXT,
    reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, resolution TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
    entity_type TEXT, entity_id INTEGER, old_values TEXT, new_values TEXT,
    ip_address TEXT, user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    sender_id INTEGER REFERENCES users(id),
    overtime_record_id INTEGER REFERENCES overtime_records(id),
    type TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    sent_at TEXT, status TEXT DEFAULT 'PENDIENTE', error_message TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
];

// ─── Seed principal ────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n🚀  Iniciando seed con nómina real...\n');

  // ── 1. Recrear tablas ──────────────────────────────────────────────────────
  console.log('📋  Recreando tablas...');
  await run('PRAGMA foreign_keys=OFF');
  for (const table of [
    'notifications', 'alert_logs', 'audit_logs', 'approvals',
    'overtime_records', 'system_config', 'users',
    'overtime_types', 'cost_centers', 'departments',
  ]) {
    await run(`DROP TABLE IF EXISTS ${table}`);
  }
  for (const stmt of TABLES) await run(stmt);
  await run('PRAGMA foreign_keys=ON');

  // ── 2. Departamentos ───────────────────────────────────────────────────────
  console.log('🏢  Insertando departamentos...');
  const depts = [
    { name: 'Gerencia de Distribución',                      code: 'GDI' },
    { name: 'Subgerencia de Ingeniería y Proyectos',          code: 'SIP' },
    { name: 'Subgerencia de Operaciones y Mantenimiento',     code: 'SOM' },
    { name: 'Departamento Administrativo',                    code: 'DAD' },
    { name: 'Departamento de Proyectos y Planificación',      code: 'DPP' },
    { name: 'Departamento de Construcción y Mantenimiento',   code: 'DCM' },
    { name: 'Departamento de Atención Clientes y Ctrl Pérd.', code: 'DAC' },
    { name: 'Departamento de Scada y Tecnología',             code: 'DST' },
    { name: 'Departamento de Prevención de Riesgos',          code: 'DPR' },
    { name: 'Departamento de Regulación',                     code: 'DRG' },
    { name: 'Gerencia Comercial',                             code: 'GCO' },
    { name: 'Centro de Control de Operaciones',               code: 'CCO' },
  ];
  const deptMap = {};
  for (const d of depts) {
    const r = await run(
      `INSERT INTO departments (name, code) VALUES (?, ?) RETURNING id`,
      [d.name, d.code]
    );
    deptMap[d.name] = r.rows[0].id;
  }

  // ── 3. Centros de costo ────────────────────────────────────────────────────
  console.log('💼  Insertando centros de costo...');
  const ccs = [
    { code: 'TER', name: 'Terreno',                sort_order: 1 },
    { code: 'ADM', name: 'Administrativo',          sort_order: 2 },
    { code: 'REC', name: 'Atención de reclamo',     sort_order: 3 },
    { code: 'OPE', name: 'Trabajo operacional',     sort_order: 4 },
  ];
  const ccMap = {};
  for (const cc of ccs) {
    const r = await run(
      `INSERT INTO cost_centers (code, name, sort_order) VALUES (?, ?, ?) RETURNING id`,
      [cc.code, cc.name, cc.sort_order]
    );
    ccMap[cc.name.toLowerCase()] = r.rows[0].id;
  }
  // Alias
  ccMap['terreno']       = ccMap['terreno'];
  ccMap['administrativo'] = ccMap['administrativo'];

  // ── 4. Tipos de hora extra ─────────────────────────────────────────────────
  console.log('⏱   Insertando tipos de hora extra...');
  for (const [i, ot] of [
    { code: 'extra',       name: 'Horas extras (1.5x)',        factor: 1.5, sort_order: 1 },
    { code: 'super_extra', name: 'Horas super extras (2.0x)',  factor: 2.0, sort_order: 2 },
    { code: 'especial',    name: 'Horas especiales (2.5x)',    factor: 2.5, sort_order: 3 },
  ].entries()) {
    await run(
      `INSERT INTO overtime_types (code, name, factor, sort_order) VALUES (?, ?, ?, ?)`,
      [ot.code, ot.name, ot.factor, ot.sort_order]
    );
  }

  // ── 5. Configuración del sistema ───────────────────────────────────────────
  console.log('⚙️   Insertando configuración del sistema...');
  const configs = {
    max_daily_hours_soft:    '2',
    max_daily_hours_warning: '3',
    max_weekly_hours:        '12',
    max_monthly_hours:       '40',
    default_hourly_rate:     '5000',
    pending_alert_hours:     '48',
  };
  for (const [key, value] of Object.entries(configs)) {
    await run(`INSERT INTO system_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
  }

  // ── 6. Leer Excel ──────────────────────────────────────────────────────────
  console.log('📊  Leyendo nómina desde Excel...');
  const buf  = readFileSync(EXCEL_PATH);
  const wb   = xlsx.read(buf, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 })
    .slice(3)
    .filter(r => r[0] && r[1] && r[2]);

  console.log(`   → ${rows.length} funcionarios encontrados`);

  // Mapeo de nombre completo normalizado a departamento ID
  const getDeptId = (deptName) => {
    const n = (deptName || '').trim();
    // Búsqueda parcial
    for (const [name, id] of Object.entries(deptMap)) {
      if (n.toLowerCase().includes(name.toLowerCase().slice(0, 15))) return id;
    }
    return null;
  };

  const getCcId = (ccName) => {
    const n = (ccName || '').trim().toLowerCase();
    return ccMap[n] ?? ccMap['administrativo'];
  };

  // ── 7. Insertar usuarios (pase 1: sin supervisor) ──────────────────────────
  console.log('👥  Insertando usuarios (paso 1/2 — sin supervisores)...');
  const passHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const userIdMap = {};   // normalizedSortedName → id
  const emailCount = {};  // para detectar duplicados de email

  // Construir lista de emails únicos
  const usersToInsert = rows.map((r, idx) => {
    const apellidos = (r[1] || '').trim();
    const nombres   = (r[2] || '').trim();
    const rut       = r[3] ? String(r[3]).trim() : null;
    const dept      = (r[5] || '').trim();
    const cargo     = (r[6] || '').trim();
    const cc        = (r[7] || '').trim();
    const categoria = (r[8] || '').trim();
    const jefStr    = (r[9] || '').trim();

    let email = makeEmail(nombres, apellidos);
    emailCount[email] = (emailCount[email] || 0) + 1;
    if (emailCount[email] > 1) {
      // Añadir segundo nombre para desambiguar
      const secondName = normalize(nombres).split(/\s+/)[1] || String(idx);
      const firstApellido = normalize(apellidos).split(/\s+/)[0];
      email = `${normalize(nombres).split(/\s+/)[0]}${secondName[0]}.${firstApellido}@distrib.cl`;
    }

    const role    = getRole(apellidos, nombres, categoria);
    const deptId  = getDeptId(dept);
    const ccId    = getCcId(cc);
    const empId   = `F-${String(idx + 1).padStart(3, '0')}`;

    return { apellidos, nombres, rut, email, role, deptId, ccId, empId, jefStr, cargo };
  });

  for (const u of usersToInsert) {
    const result = await run(
      `INSERT INTO users
         (employee_id, rut, first_name, last_name, email, password_hash,
          role, department_id, cost_center_id, hourly_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        u.empId, u.rut,
        u.nombres, u.apellidos,
        u.email, passHash,
        u.role, u.deptId, u.ccId,
        5000,
      ]
    );
    const id = result.rows[0].id;
    // Registrar por nombre normalizado (ambos órdenes)
    const key1 = normalizeName(`${u.nombres} ${u.apellidos}`);
    const key2 = normalizeName(`${u.apellidos} ${u.nombres}`);
    userIdMap[key1] = id;
    userIdMap[key2] = id;
  }

  // ── 8. Actualizar supervisores (pase 2) ────────────────────────────────────
  console.log('🔗  Vinculando supervisores (paso 2/2)...');
  let linked = 0, unlinked = 0;

  for (const u of usersToInsert) {
    if (!u.jefStr || u.jefStr.toLowerCase().includes('gerencia general')) {
      unlinked++;
      continue;
    }
    const jefKey = normalizeName(u.jefStr);
    const supId  = userIdMap[jefKey];

    if (supId) {
      await run(
        `UPDATE users SET supervisor_id = ? WHERE email = ?`,
        [supId, u.email]
      );
      linked++;
    } else {
      console.log(`   ⚠  No se encontró supervisor: "${u.jefStr}" para ${u.nombres} ${u.apellidos}`);
      unlinked++;
    }
  }

  // ── 9. Crear cuenta admin adicional ───────────────────────────────────────
  console.log('🔐  Verificando cuenta administrador...');
  // Si Carlos Cumillanca ya fue insertado con rol administrador, perfecto.
  // Adicionalmente creamos una cuenta de sistema para acceso de emergencia.
  const adminHash = await bcrypt.hash('Admin2024!', 12);
  try {
    await run(
      `INSERT OR IGNORE INTO users
         (employee_id, first_name, last_name, email, password_hash, role, hourly_rate)
       VALUES ('SYS-001', 'Admin', 'Sistema', 'admin@distrib.cl', ?, 'administrador', 8000)`,
      [adminHash]
    );
    console.log('   → admin@distrib.cl / Admin2024! (cuenta de emergencia)');
  } catch {
    console.log('   → Cuenta admin ya existe');
  }

  // ── 10. Resumen ────────────────────────────────────────────────────────────
  const totals = await run(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN role='administrador' THEN 1 ELSE 0 END) as admins,
      SUM(CASE WHEN role='jefatura'      THEN 1 ELSE 0 END) as jefaturas,
      SUM(CASE WHEN role='funcionario'   THEN 1 ELSE 0 END) as funcionarios
    FROM users
  `);
  const t = totals.rows[0];

  console.log('\n✅  Seed completado exitosamente');
  console.log('─'.repeat(45));
  console.log(`   Total usuarios:    ${t.total}`);
  console.log(`   Administradores:   ${t.admins}`);
  console.log(`   Jefaturas:         ${t.jefaturas}`);
  console.log(`   Funcionarios:      ${t.funcionarios}`);
  console.log(`   Supervisores vinculados:    ${linked}`);
  console.log(`   Sin supervisor (top/s.d.):  ${unlinked}`);
  console.log('─'.repeat(45));
  console.log(`\n   🔑  Contraseña por defecto: ${DEFAULT_PASSWORD}`);
  console.log(`   🔑  Admin sistema: admin@distrib.cl / Admin2024!`);
  console.log(`\n   📧  Formato de emails: nombre.apellido@distrib.cl\n`);

  // Listar todos los usuarios con su email y rol
  const allUsers = await run(`
    SELECT first_name, last_name, email, role
    FROM users ORDER BY role, last_name
  `);
  console.log('─'.repeat(65));
  console.log('  NOMBRE'.padEnd(35), 'EMAIL'.padEnd(35), 'ROL');
  console.log('─'.repeat(65));
  for (const u of allUsers.rows) {
    const nombre = `${u.first_name} ${u.last_name}`.slice(0, 33).padEnd(35);
    const email  = (u.email || '').slice(0, 33).padEnd(35);
    console.log(' ', nombre, email, u.role);
  }
  console.log('─'.repeat(65));

  process.exit(0);
}

seed().catch(e => {
  console.error('\n❌  Error durante el seed:', e.message);
  console.error(e);
  process.exit(1);
});
