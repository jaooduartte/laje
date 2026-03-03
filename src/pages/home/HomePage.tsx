import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePublicAccessSettings } from "@/hooks/usePublicAccessSettings";
import { APP_NAVIGATION_ITEMS } from "@/lib/navigation";
import { resolveIsPublicRouteBlocked } from "@/lib/publicAccess";
import { HomePageView } from "@/pages/home/HomePageView";
import type { HomePageViewItem } from "@/pages/home/HomePageView";

export function HomePage() {
  const { publicAccessSettings, loading: publicAccessLoading } = usePublicAccessSettings();
  const { user, loading: authLoading } = useAuth();

  if (publicAccessLoading || authLoading) {
    return (
      <div className="app-page">
        <main className="container flex min-h-dvh items-center justify-center py-8">
          <div className="glass-panel flex min-h-[360px] w-full max-w-3xl items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  const homePageListItems: HomePageViewItem[] = APP_NAVIGATION_ITEMS.map((appNavigationItem) => {
    const isDisabledByMaintenance =
      appNavigationItem.isPublicPage &&
      !user &&
      resolveIsPublicRouteBlocked(publicAccessSettings, appNavigationItem.routePath);

    return {
      routePath: appNavigationItem.routePath,
      label: appNavigationItem.label,
      icon: appNavigationItem.icon,
      isPublicPage: appNavigationItem.isPublicPage,
      isDisabledByMaintenance,
    };
  });

  return <HomePageView items={homePageListItems} />;
}
