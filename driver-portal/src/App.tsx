import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DeliveryDetail from './pages/DeliveryDetail';
import Chat from './pages/Chat';
import { getToken } from './services/auth';

function RequireDriver({ children }: { children: ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<RequireDriver><Dashboard /></RequireDriver>} />
      <Route path="/delivery/:id" element={<RequireDriver><DeliveryDetail /></RequireDriver>} />
      <Route path="/chat" element={<RequireDriver><Chat /></RequireDriver>} />
      <Route path="*" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
