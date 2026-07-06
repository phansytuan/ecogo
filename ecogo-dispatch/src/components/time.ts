export const waitSeconds = (createdAt: string) =>
  Math.max(0, (Date.now() - Date.parse(createdAt)) / 1000);

export const fmtWait = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m < 1) return `${sec}s`;
  return `${m}'${sec.toString().padStart(2, '0')}`;
};

export const slaClass = (s: number) => (s > 900 ? 'sla brk' : s > 600 ? 'sla warn' : 'sla');
