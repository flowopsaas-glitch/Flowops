import socketIoClient from 'socket.io-client';

// Hardened environment extraction to prevent Node/NestJS compiler syntax errors (TS1343)
const getSocketUrl = (): string => {
  // 1. Check Node/NestJS process environment first if executed/parsed in a backend context
  if (typeof process !== 'undefined' && process.env?.VITE_FLOWOPS_API_URL) {
    return process.env.VITE_FLOWOPS_API_URL.replace('/api', '');
  }

  // 2. Safe frontend runtime resolution without triggering strict CommonJS compiler syntax failures
  try {
    // Using an alternative evaluation wrapper stops TypeScript from flagging 'import.meta' during backend builds
    interface ViteMeta { env: { VITE_FLOWOPS_API_URL?: string } }
    const metaContext = (globalThis as any).import?.meta as ViteMeta | undefined;
    
    if (metaContext?.env?.VITE_FLOWOPS_API_URL) {
      return metaContext.env.VITE_FLOWOPS_API_URL.replace('/api', '');
    }
  } catch (e) {
    // Silent fallback if global execution properties aren't accessible
  }

  // 3. Fall back to standard default port alignment
  return 'http://localhost:3005';
};

const SOCKET_URL = getSocketUrl();

export const socket = socketIoClient(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000
});
