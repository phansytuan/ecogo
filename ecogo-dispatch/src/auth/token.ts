const KEY = 'ecogo_token';
const RKEY = 'ecogo_refresh';

export const getToken = () => localStorage.getItem(KEY);
export const getRefresh = () => localStorage.getItem(RKEY);
export const setToken = (t: string) => localStorage.setItem(KEY, t);
export const setSession = (access: string, refresh: string) => {
  localStorage.setItem(KEY, access);
  localStorage.setItem(RKEY, refresh);
};
export const clearToken = () => {
  localStorage.removeItem(KEY);
  localStorage.removeItem(RKEY);
};
