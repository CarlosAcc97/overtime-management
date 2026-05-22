export const authConfig = {
  accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_prod',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_prod',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  bcryptRounds: 12,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'none' permite enviar la cookie cross-domain (Vercel ↔ Render).
    // Requiere secure:true, por eso en dev usamos 'lax'.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
  },
};
