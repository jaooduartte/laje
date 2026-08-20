import type { ReactNode } from "react";
import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { usePublicAccessSettings } from "@/hooks/usePublicAccessSettings";
import { AppRoutePath } from "@/lib/enums";
import { resolveIsPublicRouteBlocked } from "@/lib/publicAccess";

interface Props {
  children: ReactNode;
  routePath: AppRoutePath;
}

export function PublicRouteGuard({ children, routePath }: Props) {
  const { publicAccessSettings, loading } = usePublicAccessSettings();
  const { user, loading: authLoading } = useAuth();

  if (loading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <PageContentSkeleton filterCount={3} contentCount={3} />
        </main>
      </div>
    );
  }

  const isRouteBlocked = resolveIsPublicRouteBlocked(
    publicAccessSettings,
    routePath,
  );

  if (!isRouteBlocked) {
    return <>{children}</>;
  }

  if (authLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <PageContentSkeleton filterCount={3} contentCount={3} />
        </main>
      </div>
    );
  }

  if (user != null) {
    return <>{children}</>;
  }

  return (
    <div className="app-page">
      <Header />
      <main className="container flex min-h-[calc(100dvh-5.5rem)] items-center justify-center py-6">
        <section className="glass-panel mx-auto flex w-full max-w-2xl flex-col items-center gap-5 p-6 text-center sm:p-8">
          <img
            src="/offline.svg"
            alt="Ilustração de página indisponível"
            className="h-auto w-full max-w-[320px] object-contain"
            loading="lazy"
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Em manutenção
            </p>
            <h1 className="text-2xl font-display font-bold text-primary">
              Essa página foi temporariamente bloqueada
            </h1>
            <p className="text-sm text-muted-foreground">
              {publicAccessSettings.blocked_message ??
                "Tente novamente em instantes."}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
