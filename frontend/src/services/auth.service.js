import api from './api.js';

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  localStorage.setItem('accessToken', data.data.accessToken);
  return data.data;
};

export const logout = async () => {
  try { await api.post('/auth/logout'); } catch { /* ignorar errores de red */ }
  localStorage.removeItem('accessToken');
};

export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data.data.user;
};

export const refreshToken = async () => {
  const { data } = await api.post('/auth/refresh');
  localStorage.setItem('accessToken', data.data.accessToken);
  return data.data;
};
