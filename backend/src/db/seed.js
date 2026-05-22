/**
 * Script de inicialización de base de datos
 * npm run db:seed      → usuarios, tipos, centros de costo, configuración
 * npm run db:seed:all  → todo lo anterior + 80+ registros de ejemplo
 */
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { DEFAULT_CONFIG } from '../config/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../data/overtime.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const client = createClient({ url: `file:${dbPath}` });
const exec = (sql) => client.execute(sql);
const ins = (sql, args) => client.execute({ sql, args });

// ─── DDL ─────────────────────────────────────────────────────────────────────
const createTables = async () => {
  const stmts = [
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
  for (const sql of stmts) await exec(sql);
  console.log('✅ Tablas creadas/verificadas');
};

const run = async () => {
  console.log('\n🌱 Iniciando seed...\n');
  await exec('PRAGMA foreign_keys = ON');
  await createTables();

  // Limpiar en orden correcto (FK)
  const tables = ['notifications','alert_logs','approvals','overtime_records','audit_logs',
    'system_config','users','cost_centers','overtime_types','departments'];
  for (const t of tables) {
    await exec(`DELETE FROM ${t}`);
    await exec(`DELETE FROM sqlite_sequence WHERE name='${t}'`).catch(() => {});
  }

  const PASS_ADMIN = await bcrypt.hash('Admin2024!', 12);
  const PASS_JEFE  = await bcrypt.hash('Jefe2024!', 12);
  const PASS_FUNC  = await bcrypt.hash('Func2024!', 12);

  // ─── Departamentos ──────────────────────────────────────────────────────────
  const dNorte  = (await ins(`INSERT INTO departments (code,name) VALUES (?,?) RETURNING id`, ['DIST-NORTE','Distribución Norte'])).rows[0];
  const dSur    = (await ins(`INSERT INTO departments (code,name) VALUES (?,?) RETURNING id`, ['DIST-SUR','Distribución Sur'])).rows[0];
  const dCentro = (await ins(`INSERT INTO departments (code,name) VALUES (?,?) RETURNING id`, ['DIST-CENTRO','Distribución Centro'])).rows[0];
  console.log('✅ Departamentos');

  // ─── Centros de costo (tipo de trabajo) ────────────────────────────────────
  await ins(`INSERT INTO cost_centers (code,name,description,sort_order) VALUES (?,?,?,?)`,
    ['TER','Terreno','Trabajos realizados en terreno, instalaciones externas y campo',1]);
  await ins(`INSERT INTO cost_centers (code,name,description,sort_order) VALUES (?,?,?,?)`,
    ['ADM','Administrativo','Labores administrativas, informes, reuniones y coordinación interna',2]);
  await ins(`INSERT INTO cost_centers (code,name,description,sort_order) VALUES (?,?,?,?)`,
    ['REC','Atención de reclamo','Gestión y resolución de reclamos de clientes',3]);
  await ins(`INSERT INTO cost_centers (code,name,description,sort_order) VALUES (?,?,?,?)`,
    ['OPE','Trabajo operacional','Operación y mantención de equipos e infraestructura',4]);
  const { rows: ccRows } = await exec('SELECT id FROM cost_centers ORDER BY sort_order');
  const cc = ccRows.map(r => r.id);
  console.log('✅ Centros de costo: Terreno, Administrativo, Atención de reclamo, Operacional');

  // ─── Tipos de hora extra ────────────────────────────────────────────────────
  await ins(`INSERT INTO overtime_types (code,name,factor,description,sort_order) VALUES (?,?,?,?,?)`,
    ['extra','Horas extras',1.5,'Horas extras en días hábiles (lunes a viernes). Factor 1.5x según Art. 31 CT.',1]);
  await ins(`INSERT INTO overtime_types (code,name,factor,description,sort_order) VALUES (?,?,?,?,?)`,
    ['super_extra','Horas super extras',2.0,'Horas extras realizadas en días sábado. Factor 2.0x.',2]);
  await ins(`INSERT INTO overtime_types (code,name,factor,description,sort_order) VALUES (?,?,?,?,?)`,
    ['especial','Horas especiales',2.5,'Horas extras en domingos, festivos o condiciones especiales. Factor 2.5x.',3]);
  console.log('✅ Tipos de hora extra: extra (1.5x), super extra (2.0x), especial (2.5x)');

  // ─── Administrador ──────────────────────────────────────────────────────────
  const admin = (await ins(
    `INSERT INTO users (employee_id,rut,first_name,last_name,email,password_hash,role,department_id,cost_center_id,hourly_rate) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ['A-001','11.111.111-1','Carolina','Reyes','admin@empresa.cl',PASS_ADMIN,'administrador',dCentro.id,cc[1],8000]
  )).rows[0];
  console.log('✅ Admin: admin@empresa.cl / Admin2024!');

  // ─── Jefaturas ──────────────────────────────────────────────────────────────
  const j1 = (await ins(
    `INSERT INTO users (employee_id,rut,first_name,last_name,email,password_hash,role,supervisor_id,department_id,cost_center_id,hourly_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ['J-001','12.222.222-2','Roberto','Fuentes','jefe.norte@empresa.cl',PASS_JEFE,'jefatura',admin.id,dNorte.id,cc[0],7500]
  )).rows[0];
  const j2 = (await ins(
    `INSERT INTO users (employee_id,rut,first_name,last_name,email,password_hash,role,supervisor_id,department_id,cost_center_id,hourly_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ['J-002','13.333.333-3','Patricia','Morales','jefe.sur@empresa.cl',PASS_JEFE,'jefatura',admin.id,dSur.id,cc[2],7500]
  )).rows[0];
  const j3 = (await ins(
    `INSERT INTO users (employee_id,rut,first_name,last_name,email,password_hash,role,supervisor_id,department_id,cost_center_id,hourly_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ['J-003','14.444.444-4','Andrés','Vásquez','jefe.centro@empresa.cl',PASS_JEFE,'jefatura',admin.id,dCentro.id,cc[1],7500]
  )).rows[0];
  console.log('✅ Jefaturas: jefe.norte/sur/centro@empresa.cl / Jefe2024!');

  // ─── Funcionarios ───────────────────────────────────────────────────────────
  const funcs = [
    ['F-001','15.001.001-1','Miguel','Torres','func01@empresa.cl',j1.id,dNorte.id,cc[0],5000],
    ['F-002','15.002.002-2','Daniela','Castro','func02@empresa.cl',j1.id,dNorte.id,cc[0],5200],
    ['F-003','15.003.003-3','Jorge','Muñoz','func03@empresa.cl',j1.id,dNorte.id,cc[1],4800],
    ['F-004','15.004.004-4','Valentina','Soto','func04@empresa.cl',j1.id,dNorte.id,cc[2],5100],
    ['F-005','15.005.005-5','Cristóbal','Díaz','func05@empresa.cl',j1.id,dNorte.id,cc[0],4900],
    ['F-006','15.006.006-6','Camila','Rojas','func06@empresa.cl',j2.id,dSur.id,cc[2],5300],
    ['F-007','15.007.007-7','Felipe','Herrera','func07@empresa.cl',j2.id,dSur.id,cc[0],5000],
    ['F-008','15.008.008-8','Natalia','Espinoza','func08@empresa.cl',j2.id,dSur.id,cc[3],4700],
    ['F-009','15.009.009-9','Sebastián','Vargas','func09@empresa.cl',j2.id,dSur.id,cc[2],5400],
    ['F-010','15.010.010-K','Francisca','Pizarro','func10@empresa.cl',j2.id,dSur.id,cc[1],5000],
    ['F-011','16.011.011-1','Ricardo','Núñez','func11@empresa.cl',j3.id,dCentro.id,cc[3],5600],
    ['F-012','16.012.012-2','Alejandra','Medina','func12@empresa.cl',j3.id,dCentro.id,cc[1],5200],
    ['F-013','16.013.013-3','Gonzalo','Pérez','func13@empresa.cl',j3.id,dCentro.id,cc[0],4800],
    ['F-014','16.014.014-4','Isidora','González','func14@empresa.cl',j3.id,dCentro.id,cc[3],5100],
    ['F-015','16.015.015-5','Matías','Ramírez','func15@empresa.cl',j3.id,dCentro.id,cc[2],5000],
  ];
  for (const [emp,rut,fn,ln,email,supId,deptId,ccId,rate] of funcs) {
    await ins(
      `INSERT INTO users (employee_id,rut,first_name,last_name,email,password_hash,role,supervisor_id,department_id,cost_center_id,hourly_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [emp,rut,fn,ln,email,PASS_FUNC,'funcionario',supId,deptId,ccId,rate]
    );
  }
  console.log('✅ 15 funcionarios: func01-15@empresa.cl / Func2024!');

  // ─── Configuración del sistema ──────────────────────────────────────────────
  const configDescriptions = {
    max_daily_hours_soft: 'Tope diario suave (alerta informativa nivel 1)',
    max_daily_hours_warning: 'Tope diario fuerte (alerta nivel 2 + doble validación)',
    max_weekly_hours: 'Máximo horas semanales (Art. 31 CT Chile)',
    max_monthly_hours: 'Máximo mensual (genera estado RETENIDO)',
    pending_alert_hours: 'Horas sin gestionar antes de alerta de backlog en dashboard',
  };
  // Los factores ahora viven en overtime_types, no en system_config
  const cfgItems = Object.entries(DEFAULT_CONFIG).filter(([k]) => !k.startsWith('factor_') && k !== 'default_hourly_rate');
  for (const [key, value] of cfgItems) {
    await ins(`INSERT OR REPLACE INTO system_config (key,value,description,updated_by) VALUES (?,?,?,?)`,
      [key, value, configDescriptions[key] || key, admin.id]);
  }
  // hourly_rate sigue como config general (valor promedio para proyecciones)
  await ins(`INSERT OR REPLACE INTO system_config (key,value,description,updated_by) VALUES (?,?,?,?)`,
    ['default_hourly_rate','5000','Valor hora base promedio en CLP para proyección de costos',admin.id]);
  console.log('✅ Configuración del sistema');

  console.log('\n🎉 Seed base completado.\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('CREDENCIALES:');
  console.log('  ADMIN:       admin@empresa.cl          / Admin2024!');
  console.log('  JEFATURAS:   jefe.norte@empresa.cl     / Jefe2024!');
  console.log('               jefe.sur@empresa.cl       / Jefe2024!');
  console.log('               jefe.centro@empresa.cl    / Jefe2024!');
  console.log('  FUNCIONARIOS: func01-15@empresa.cl     / Func2024!');
  console.log('═══════════════════════════════════════════════════════\n');
};

run().catch(err => { console.error('❌ Error:', err); process.exit(1); });
