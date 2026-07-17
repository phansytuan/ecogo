import { api } from './client';
import { Candidate, QueueItem, ReviewRide, TripInfo } from './types';

export const getQueue = () => api<QueueItem[]>('/dispatch/queue');
export const getReviews = () => api<ReviewRide[]>('/dispatch/reviews');
export const getCandidates = (id: string) =>
  api<Candidate[]>(`/dispatch/requests/${id}/candidates`);
export const claimRequest = (id: string) =>
  api(`/dispatch/requests/${id}/claim`, { method: 'POST' });
export const releaseRequest = (id: string) =>
  api(`/dispatch/requests/${id}/release`, { method: 'POST' });
export const assignRequest = (id: string, rideId: string) =>
  api(`/dispatch/requests/${id}/assign`, { method: 'POST', body: JSON.stringify({ rideId }) });
export const getTrip = (id: string) => api<TripInfo>(`/dispatch/requests/${id}/trip`);
export const resolveRide = (
  rideId: string,
  outcome: 'completed' | 'cancelled',
  reason: string,
) =>
  api(`/dispatch/rides/${rideId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ outcome, reason }),
  });
