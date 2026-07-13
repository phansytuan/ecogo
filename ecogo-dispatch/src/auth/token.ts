const KEY = 'ecogo_token';
const RKEY = 'ecogo_refresh';
type TokenListener = (token: string | null) => void;
const listeners = new Set<TokenListener>();

const notify = (token: string | null) => listeners.forEach((listener) => listener(token));

export const getToken = () => localStorage.getItem(KEY);
export const getRefresh = () => localStorage.getItem(RKEY);
export const setToken = (t: string) => {
  localStorage.setItem(KEY, t);
  notify(t);
};
export const setSession = (access: string, refresh: string) => {
  localStorage.setItem(KEY, access);
  localStorage.setItem(RKEY, refresh);
  notify(access);
};
export const clearToken = () => {
  localStorage.removeItem(KEY);
  localStorage.removeItem(RKEY);
  notify(null);
};
export const subscribeToken = (listener: TokenListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
