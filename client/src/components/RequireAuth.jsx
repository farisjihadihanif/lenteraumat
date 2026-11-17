import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/Auth";
import { PageLoader } from "./ui";

export default function RequireAuth({ children, admin = false }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to={`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
