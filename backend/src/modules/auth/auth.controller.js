import { z } from 'zod';
import * as authService from './auth.service.js';
import { ok } from '../../utils/response.js';
import { logAudit } from '../../middleware/auditLogger.js';
import { authConfig } from '../../config/auth.js';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const login = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.login(email, password);

  // Refresh token en cookie httpOnly
  res.cookie('refreshToken', refreshToken, authConfig.cookieOptions);

  await logAudit({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, req });

  ok(res, { user, accessToken }, 'Inicio de sesión exitoso');
};

export const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  const { user, accessToken, refreshToken } = await authService.refreshTokens(token);

  res.cookie('refreshToken', refreshToken, authConfig.cookieOptions);
  ok(res, { user, accessToken }, 'Token renovado');
};

export const logout = async (req, res) => {
  if (req.user?.id) {
    await authService.logout(req.user.id);
    await logAudit({ userId: req.user.id, action: 'auth.logout', entityType: 'user', entityId: req.user.id, req });
  }
  res.clearCookie('refreshToken');
  ok(res, null, 'Sesión cerrada correctamente');
};

export const me = async (req, res) => {
  const user = await authService.getMe(req.user.id);
  ok(res, { user });
};
