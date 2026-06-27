import { api } from '../api/client';

export const requestOtp = (phone: string) =>
  api<{ sent: boolean; devCode?: string }>('/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

export const verifyOtp = (phone: string, code: string) =>
  api<{ accessToken: string; user: { roles: string[] } }>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
