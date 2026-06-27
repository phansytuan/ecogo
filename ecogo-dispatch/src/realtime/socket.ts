import { io, Socket } from 'socket.io-client';

const WS = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

export function createSocket(token: string): Socket {
  return io(WS, { auth: { token }, transports: ['websocket'] });
}
