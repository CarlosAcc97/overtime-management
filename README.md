# Sistema de Gestión de Horas Extras
### Gerencia de Distribución

---

## Stack tecnológico
| Capa | Tecnología |
|---|---|
| Backend | Node.js 20+ + Express 5 |
| ORM | Drizzle ORM |
| Base de datos | SQLite (via @libsql/client) → migrable a PostgreSQL |
| Autenticación | JWT (access 15m + refresh 7d en cookie httpOnly) |
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui |
| Gráficos | Recharts (Fase 5) |
| Exportación | ExcelJS + jsPDF (Fase 6) |

---

## Requisitos
- Node.js **v20+** (probado en v24)
- npm

---

## Instalación y puesta en marcha

### 1. Backend
```bash
cd backend
npm install
# Copiar variables de entorno
cp .env.example .env
# Inicializar base de datos con datos de prueba
npm run db:seed
# Iniciar servidor (puerto 3001)
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
# Iniciar servidor de desarrollo (puerto 5173)
npm run dev
```

### 3. Acceder a la aplicación
Abrir: http://localhost:5173

---

## Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| **Administrador** | admin@empresa.cl | Admin2024! |
| **Jefatura Norte** | jefe.norte@empresa.cl | Jefe2024! |
| **Jefatura Sur** | jefe.sur@empresa.cl | Jefe2024! |
| **Jefatura Centro** | jefe.centro@empresa.cl | Jefe2024! |
| **Funcionario 1-15** | func01@empresa.cl … func15@empresa.cl | Func2024! |

---

## Variables de entorno (backend/.env)

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | 3001 |
| `DATABASE_URL` | Ruta al archivo SQLite | ./data/overtime.db |
| `JWT_ACCESS_SECRET` | Secreto JWT access token | (cambiar en prod) |
| `JWT_REFRESH_SECRET` | Secreto JWT refresh token | (cambiar en prod) |
| `JWT_ACCESS_EXPIRES` | Expiración access token | 15m |
| `JWT_REFRESH_EXPIRES` | Expiración refresh token | 7d |
| `CORS_ORIGIN` | URL del frontend | http://localhost:5173 |

---

## Endpoints API (Fase 2)

### Autenticación
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión | Público |
| POST | `/api/auth/refresh` | Renovar tokens (cookie) | Público |
| POST | `/api/auth/logout` | Cerrar sesión | Auth |
| GET | `/api/auth/me` | Datos del usuario actual | Auth |

### Usuarios
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/api/users` | Listar usuarios (paginado) | Jefatura+ |
| GET | `/api/users/:id` | Detalle de usuario | Jefatura+ |
| POST | `/api/users` | Crear usuario | Admin |
| PUT | `/api/users/:id` | Actualizar usuario | Admin |
| PATCH | `/api/users/:id/toggle-active` | Activar/desactivar | Admin |
| GET | `/api/users/supervisors` | Lista de jefaturas | Auth |
| GET | `/api/users/my-team` | Equipo del usuario actual | Jefatura+ |

### Centros de costo
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/api/cost-centers` | Listar | Auth |
| GET | `/api/cost-centers/:id` | Detalle | Auth |
| POST | `/api/cost-centers` | Crear | Admin |
| PUT | `/api/cost-centers/:id` | Actualizar | Admin |

### Configuración
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/api/config` | Ver configuración | Auth |
| PUT | `/api/config` | Actualizar parámetros | Admin |

---

## Estructura del proyecto

```
overtime-management/
├── backend/
│   ├── src/
│   │   ├── config/         # DB, auth, constantes
│   │   ├── db/             # Schema Drizzle + seed
│   │   ├── middleware/     # JWT, roles, auditoría, errores
│   │   ├── modules/        # auth, users, cost-centers, system-config
│   │   ├── services/       # alert.service, notification.service
│   │   └── utils/          # response, dateHelpers
│   ├── data/               # overtime.db (generado por seed)
│   └── .env
└── frontend/
    └── src/
        ├── components/     # UI (shadcn/ui), layout, common
        ├── context/        # AuthContext
        ├── hooks/          # use-toast
        ├── pages/          # Login, Dashboard, admin/*
        ├── services/       # api.js, auth, users
        └── utils/          # formatters
```

---

## Fases de desarrollo

| Fase | Estado | Descripción |
|---|---|---|
| Fase 1 | ✅ | Stack, modelo de datos, estructura |
| Fase 2 | ✅ | Autenticación + gestión de usuarios |
| Fase 3 | 🔲 | Módulo de registro de horas extras |
| Fase 4 | 🔲 | Módulo de validación (bandeja jefatura) |
| Fase 5 | 🔲 | Dashboard de indicadores (Recharts) |
| Fase 6 | 🔲 | Exportación Excel/PDF + pulido final |

---

## Flujo de prueba completo (Fase 2)

1. Abrir http://localhost:5173
2. Ingresar con `admin@empresa.cl / Admin2024!`
3. Navegar a **Usuarios** → ver los 19 usuarios del seed
4. Crear un nuevo usuario con el botón "Nuevo usuario"
5. Cerrar sesión → ingresar como jefatura (`jefe.norte@empresa.cl / Jefe2024!`)
6. Verificar que las secciones de Admin no son accesibles
