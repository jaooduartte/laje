import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { useHomeDashboardMetrics } from "@/hooks/useHomeDashboardMetrics";
import { usePublicAccessSettings } from "@/hooks/usePublicAccessSettings";
import { APP_NAVIGATION_ITEMS } from "@/lib/navigation";
import {
  PUBLIC_PAGE_ACCESS_FIELD_ORDER,
  PUBLIC_PAGE_ACCESS_LABELS,
  resolveIsPublicRouteBlocked,
} from "@/lib/publicAccess";
import { PublicPageAccessSettingField } from "@/lib/enums";
import { HomePageView } from "@/pages/home/HomePageView";
import type { HomePageViewItem } from "@/pages/home/HomePageView";

export function HomePage() {
  const { publicAccessSettings, loading: publicAccessLoading } =
    usePublicAccessSettings();
  const { user, loading: authLoading } = useAuth();
  const { metrics, loading: metricsLoading } = useHomeDashboardMetrics();

  if (publicAccessLoading || authLoading || metricsLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  const homePageListItems: HomePageViewItem[] = APP_NAVIGATION_ITEMS.map(
    (appNavigationItem) => {
      const isDisabledByMaintenance =
        appNavigationItem.isPublicPage &&
        !user &&
        resolveIsPublicRouteBlocked(
          publicAccessSettings,
          appNavigationItem.routePath,
        );

      return {
        routePath: appNavigationItem.routePath,
        label: appNavigationItem.label,
        icon: appNavigationItem.icon,
        isPublicPage: appNavigationItem.isPublicPage,
        isDisabledByMaintenance,
      };
    },
  );

  const maintenanceItems = PUBLIC_PAGE_ACCESS_FIELD_ORDER.filter((field) => {
    if (field == PublicPageAccessSettingField.LIVE) {
      return publicAccessSettings.is_live_page_blocked;
    }

    if (field == PublicPageAccessSettingField.CHAMPIONSHIPS) {
      return publicAccessSettings.is_championships_page_blocked;
    }

    if (field == PublicPageAccessSettingField.SCHEDULE) {
      return publicAccessSettings.is_schedule_page_blocked;
    }

    if (field == PublicPageAccessSettingField.LEAGUE_CALENDAR) {
      return publicAccessSettings.is_league_calendar_page_blocked;
    }

    return publicAccessSettings.is_links_page_blocked;
  }).map((field) => ({
    label: PUBLIC_PAGE_ACCESS_LABELS[field],
    reason:
      publicAccessSettings.blocked_message ??
      "Manutenção preventiva ou ajuste operacional em andamento.",
  }));

  return (
    <HomePageView
      items={homePageListItems}
      maintenanceItems={maintenanceItems}
      metrics={metrics}
    />
  );
}
