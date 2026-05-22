import api from './api.js';

export const getUsers = async (params = {}) => {
  const { data } = await api.get('/users', { params });
  return data;
};

export const getUserById = async (id) => {
  const { data } = await api.get(`/users/${id}`);
  return data.data.user;
};

export const createUser = async (payload) => {
  const { data } = await api.post('/users', payload);
  return data.data.user;
};

export const updateUser = async (id, payload) => {
  const { data } = await api.put(`/users/${id}`, payload);
  return data.data.user;
};

export const toggleUserActive = async (id, isActive) => {
  const { data } = await api.patch(`/users/${id}/toggle-active`, { isActive });
  return data.data.user;
};

export const getMyTeam = async () => {
  const { data } = await api.get('/users/my-team');
  return data.data.team;
};

export const getSupervisors = async () => {
  const { data } = await api.get('/users/supervisors');
  return data.data.supervisors;
};

export const getCostCenters = async () => {
  const { data } = await api.get('/cost-centers');
  return data.data.costCenters;
};

export const getSystemConfig = async () => {
  const { data } = await api.get('/config');
  return data.data.config;
};

export const updateSystemConfig = async (config) => {
  const { data } = await api.put('/config', config);
  return data.data.config;
};
