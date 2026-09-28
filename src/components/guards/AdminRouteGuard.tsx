import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { AdminShellSkeleton } from "@/components/skeletons/AdminShellSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { AppRoutePath } from "@/lib/enums";

interface Props {
  children: ReactNode;
}

export function AdminRouteGuard({ children }: Props) {
  const { user, canAccessAdminPanel, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <AdminShellSkeleton />
        </main>
      </div>
    );
  }

  if (!user?.id || !canAccessAdminPanel) {
    return <Navigate to={AppRoutePath.LOGIN} replace />;
  }

  return <>{children}</>;
}
