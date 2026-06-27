import { api } from './client';
import { Candidate, QueueItem } from './types';

export const getQueue = () => api<QueueItem[]>('/dispatch/queue');
export const getCandidates = (id: string) =>
  api<Candidate[]>(`/dispatch/requests/${id}/candidates`);
export const claimRequest = (id: string) =>
  api(`/dispatch/requests/${id}/claim`, { method: 'POST' });
export const assignRequest = (id: string, rideId: string) =>
  api(`/dispatch/requests/${id}/assign`, { method: 'POST', body: JSON.stringify({ rideId }) });
