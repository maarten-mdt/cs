import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";

interface RequireAdminProps {
  children: React.ReactNode;
}

export function RequireAdmin({ children }: RequireAdminProps) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "ADMIN") {
    return <Navigate to="/conversations" replace />;
  }
  return <>{children}</>;
}
