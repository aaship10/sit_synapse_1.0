import { Navigate, useLocation } from 'react-router-dom';
import { getSession } from '../../utils/auth.js';

/** Redirects to /login (preserving the intended destination) when signed out. */
export default function RequireAuth({ children }) {
  const location = useLocation();
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
