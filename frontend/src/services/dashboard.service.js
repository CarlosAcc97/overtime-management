import api from './api.js';

export const getKpis = async () => {
  const { data } = await api.get('/dashboard/kpis');
  return data.data;
};

export const getMonthlyTrend = async () => {
  const { data } = await api.get('/dashboard/monthly-trend');
  return data.data.trend;
};

export const getByCostCenter = async () => {
  const { data } = await api.get('/dashboard/by-cost-center');
  return data.data.byCostCenter;
};

export const getTopEmployees = async () => {
  const { data } = await api.get('/dashboard/top-employees');
  return data.data.topEmployees;
};

export const getByType = async () => {
  const { data } = await api.get('/dashboard/by-type');
  return data.data.byType;
};

export const getCostProjection = async () => {
  const { data } = await api.get('/dashboard/cost-projection');
  return data.data;
};
