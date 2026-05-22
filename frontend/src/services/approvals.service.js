import api from './api.js';

export const getPendingApprovals = async (params = {}) => {
  const { data } = await api.get('/approvals', { params });
  return data;
};

export const getApprovalStats = async () => {
  const { data } = await api.get('/approvals/stats');
  return data.data;
};

export const getApprovalHistory = async (overtimeId) => {
  const { data } = await api.get(`/approvals/history/${overtimeId}`);
  return data.data.history;
};

export const approveRecord = async (id, payload) => {
  const { data } = await api.post(`/approvals/${id}/approve`, payload);
  return data.data.record;
};

export const rejectRecord = async (id, payload) => {
  const { data } = await api.post(`/approvals/${id}/reject`, payload);
  return data.data.record;
};

export const requestClarification = async (id, payload) => {
  const { data } = await api.post(`/approvals/${id}/clarify`, payload);
  return data.data.record;
};
