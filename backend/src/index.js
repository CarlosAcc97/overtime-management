import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import costCentersRoutes from './modules/cost-centers/cost-centers.routes.js';
import configRoutes from './modules/system-config/config.routes.js';
import overtimeRoutes from './modules/overtime/overtime.routes.js';
import overtimeBulkRoutes from './modules/overtime/overtime.bulk.js';
import overtimeTypesRoutes from './modules/overtime-types/overtime-types.routes.js';
import approvalsRoutes from './modules/approvals/approvals.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware de seguridad ───────────────────────────────────────────────────
app.use(helmet());
// CORS_ORIGIN puede ser una URL única o varias separadas por coma:
// "https://mi-app.vercel.app,https://mi-dominio.cl"
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (Postman, curl, mismo servidor)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado para: ${origin}`));
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/cost-centers', costCentersRoutes);
app.use('/api/config', configRoutes);
app.use('/api/overtime', overtimeBulkRoutes); // bulk antes que /:id catch-all
app.use('/api/overtime', overtimeRoutes);
app.use('/api/overtime-types', overtimeTypesRoutes);
app.use('/api/approvals', approvalsRoutes);

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);

// ─── Manejo de errores global ─────────────────────────────────────────────────
app.use(errorHandler);

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Ruta ${req.method} ${req.path} no encontrada` });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor iniciado en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB: ${process.env.DATABASE_URL || './data/overtime.db'}\n`);
});

export default app;
