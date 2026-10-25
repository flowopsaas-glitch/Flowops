import { createContext } from 'react';
import type { Notification } from './NotificationContext';

export interface NotificationContextProps {
  history: Notification[];
  addNotification: (n: Notification) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  getVisibleNotifications: (
    role: import('./NotificationContext').UserRole,
    companyId: string,
    driverId?: string
  ) => Notification[];
}

/**
 * Notification context lives apart from NotificationProvider so the provider
 * file only exports a component (react-refresh). The provider supplies the
 * value; the default below is the inert no-op behaviour outside a provider.
 */
export const NotificationContext = createContext<NotificationContextProps>({
  history: [],
  addNotification: () => {},
  markAsRead: () => {},
  clearAll: () => {},
  getVisibleNotifications: () => [],
});
