import React, { createContext, useState, ReactNode } from 'react';

export type UserRole = 'admin' | 'operations' | 'driver';
export type SlaLevel = 'OVERDUE' | 'WARNING' | 'BREACHED' | 'ESCALATED';

export type Notification = {
  id: string;
  message: string;
  type: SlaLevel;
  companyId: string;
  driverId?: string;
  read: boolean;
};

interface NotificationContextProps {
  history: Notification[];
  addNotification: (n: Notification) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  getVisibleNotifications: (
    role: UserRole,
    companyId: string,
    driverId?: string
  ) => Notification[];
}

export const NotificationContext = createContext<NotificationContextProps>({
  history: [],
  addNotification: () => {},
  markAsRead: () => {},
  clearAll: () => {},
  getVisibleNotifications: () => [],
});

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [history, setHistory] = useState<Notification[]>([]);

  const addNotification = (n: Notification) => {
    setHistory(prev => [{ ...n, read: false }, ...prev].slice(0, 20));

    if (n.type === 'ESCALATED') {
      new Audio('/critical-alert.mp3').play().catch(() => { /* autoplay blocked until first user gesture — visual alert still shows */ });
    } else {
      new Audio('/overdue-alert.mp3').play().catch(() => { /* autoplay blocked until first user gesture — visual alert still shows */ });
    }
  };

  const markAsRead = (id: string) => {
    setHistory(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearAll = () => setHistory([]);

  const getVisibleNotifications = (
    role: UserRole,
    companyId: string,
    driverId?: string
  ) => {
    return history.filter(n => {
      if (n.companyId !== companyId) return false;
      if (role === 'driver') return n.driverId === driverId;
      return true;
    });
  };

  return (
    <NotificationContext.Provider
      value={{
        history,
        addNotification,
        markAsRead,
        clearAll,
        getVisibleNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
