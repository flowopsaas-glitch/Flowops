import { AsyncLocalStorage } from 'async_hooks';

interface Store {
  companyId?: number;
  userId?: number;
}

export const requestContext = new AsyncLocalStorage<Store>();