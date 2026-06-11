import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken, isOwnerMode } from '../../api/client';

export default function OwnerRoute() {
  const location = useLocation();
  const token = getToken();
  const isOwner = isOwnerMode();

  // Must have a token AND be in owner mode
  if (!token || !isOwner) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
