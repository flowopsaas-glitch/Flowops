import { io, Socket } from 'socket.io-client';

export function useCompanySocket(url: string): Socket {
  return io(url, { transports: ['websocket'] });
}
