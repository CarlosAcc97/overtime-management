import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authService from '../services/auth.service.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Intenta recuperar la sesión al cargar la app
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }

    authService.getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem('accessToken'))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: loggedUser } = await authService.login(email, password);
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  // Helpers de rol
  const isAdmin = user?.role === 'administrador';
  const isJefatura = user?.role === 'jefatura';
  const isFuncionario = user?.role === 'funcionario';
  const canApprove = isAdmin || isJefatura;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, isAdmin, isJefatura, isFuncionario, canApprove }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
