import { useContext } from 'react';
import { NotificationContext } from '@/context/notification-context';
import type { UserRole } from '@/context/NotificationContext';

export default function ToastHistoryPanel({
  role,
  companyId,
  driverId,
}: {
  role: UserRole;
  companyId: string;
  driverId?: string;
}) {
  const { getVisibleNotifications, markAsRead, clearAll } =
    useContext(NotificationContext);

  const notifications = getVisibleNotifications(role, companyId, driverId);

  if (!notifications.length) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white shadow-xl rounded">
      <div className="flex justify-between p-2 bg-gray-200">
        <strong>Notifications</strong>
        <button onClick={clearAll} className="text-sm text-red-600">
          Clear
        </button>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {notifications.map(n => (
          <li
            key={n.id}
            className={`p-2 border-b ${
              n.read ? 'text-gray-400' : 'font-semibold'
            }`}
          >
            {n.message}
            {!n.read && (
              <button
                className="ml-2 text-xs text-blue-600"
                onClick={() => markAsRead(n.id)}
              >
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
