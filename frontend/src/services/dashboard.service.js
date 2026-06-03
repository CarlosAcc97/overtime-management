import api from './api.js';

export const getKpis = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/kpis', { params: { period } });
  return data.data;
};

export const getMonthlyTrend = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/monthly-trend', { params: { period } });
  return data.data.trend;
};

export const getByCostCenter = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/by-cost-center', { params: { period } });
  return data.data.byCostCenter;
};

export const getTopEmployees = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/top-employees', { params: { period } });
  return data.data.topEmployees;
};

export const getByType = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/by-type', { params: { period } });
  return data.data.byType;
};

export const getCostProjection = async (period = 'mes') => {
  const { data } = await api.get('/dashboard/cost-projection', { params: { period } });
  return data.data;
};
