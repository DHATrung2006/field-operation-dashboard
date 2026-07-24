import React from 'react';
import useUserRole from '../hooks/useUserRole';

/**
 * ProtectedRoute – render children only if the authenticated user has one of the allowedRoles.
 * Uses the `useUserRole` hook which fetches the role from the backend via the Firebase ID token.
 * While loading, a simple spinner / loading text is shown. If the role is not permitted, an
 * access‑denied message is displayed.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { role, loading, error } = useUserRole();

  if (loading) {
    return <div className="p-4 text-center text-slate-600">Loading permissions…</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <div className="p-4 text-center text-slate-500">Access denied – insufficient permissions.</div>;
  }

  return <>{children}</>;
}
