import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/api/auth";

export function Protected({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (!me) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (roles && !roles.includes(me.role)) {
    return <div className="p-8 text-red-600">Access denied — {roles.join(" or ")} required.</div>;
  }
  return <>{children}</>;
}
