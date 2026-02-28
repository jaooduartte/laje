import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { AppRoutePath } from "@/lib/enums";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
}

export function AdminRouteGuard({ children }: Props) {
  const { user, canAccessAdminPanel, loading, roleLoading } = useAuth();
  const [hasBackendAccess, setHasBackendAccess] = useState<boolean | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    let isMounted = true;

    const verifyBackendAccess = async () => {
      if (!userId || !canAccessAdminPanel) {
        setHasBackendAccess(false);
        return;
      }

      setHasBackendAccess(null);

      const { data, error } = await supabase.rpc("can_access_admin_panel");

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Erro ao validar acesso ao admin:", error.message);
        setHasBackendAccess(false);
        return;
      }

      setHasBackendAccess(data == true);
    };

    verifyBackendAccess();

    return () => {
      isMounted = false;
    };
  }, [canAccessAdminPanel, userId]);

  const shouldShowLoading = loading || roleLoading || (userId && canAccessAdminPanel && hasBackendAccess === null);

  if (shouldShowLoading) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-10">
          <div className="glass-panel flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!userId || !canAccessAdminPanel || hasBackendAccess != true) {
    return <Navigate to={AppRoutePath.LOGIN} replace />;
  }

  return <>{children}</>;
}
