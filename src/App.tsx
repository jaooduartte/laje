import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminRouteGuard } from "@/components/guards/AdminRouteGuard";
import { PublicRouteGuard } from "@/components/guards/PublicRouteGuard";
import { OnlineVisitorsProvider } from "@/components/online-visitors/OnlineVisitorsProvider";
import { AutomaticThemeProvider } from "@/components/theme/AutomaticThemeProvider";
import { AuthProvider } from "@/hooks/useAuth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppRoutePath } from "@/lib/enums";
import { HomePage } from "@/pages/home/HomePage";
import { LivePage } from "@/pages/live/LivePage";
import { ChampionshipsPage } from "@/pages/championships/ChampionshipsPage";
import { SchedulePage } from "@/pages/schedule/SchedulePage";
import { LeagueCalendarPage } from "@/pages/league-calendar/LeagueCalendarPage";
import { LoginPage } from "@/pages/login/LoginPage";
import { AdminPage } from "@/pages/admin/AdminPage";
import { NotFoundPage } from "@/pages/not-found/NotFoundPage";

const queryClient = new QueryClient();

const App = () => (
  <AutomaticThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OnlineVisitorsProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter
              future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
              }}
            >
              <Routes>
                <Route
                  path={AppRoutePath.HOME}
                  element={
                    <PublicRouteGuard routePath={AppRoutePath.HOME}>
                      <HomePage />
                    </PublicRouteGuard>
                  }
                />
                <Route
                  path={AppRoutePath.LIVE}
                  element={
                    <PublicRouteGuard routePath={AppRoutePath.LIVE}>
                      <LivePage />
                    </PublicRouteGuard>
                  }
                />
                <Route
                  path={AppRoutePath.CHAMPIONSHIPS}
                  element={
                    <PublicRouteGuard routePath={AppRoutePath.CHAMPIONSHIPS}>
                      <ChampionshipsPage />
                    </PublicRouteGuard>
                  }
                />
                <Route
                  path={AppRoutePath.SCHEDULE}
                  element={
                    <PublicRouteGuard routePath={AppRoutePath.SCHEDULE}>
                      <SchedulePage />
                    </PublicRouteGuard>
                  }
                />
                <Route
                  path={AppRoutePath.LEAGUE_CALENDAR}
                  element={
                    <PublicRouteGuard routePath={AppRoutePath.LEAGUE_CALENDAR}>
                      <LeagueCalendarPage />
                    </PublicRouteGuard>
                  }
                />
                <Route path={AppRoutePath.LOGIN} element={<LoginPage />} />
                <Route
                  path={AppRoutePath.ADMIN}
                  element={
                    <AdminRouteGuard>
                      <AdminPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={AppRoutePath.LEGACY_CHAMPIONSHIPS}
                  element={<Navigate to={AppRoutePath.CHAMPIONSHIPS} replace />}
                />
                <Route
                  path={AppRoutePath.LEGACY_SCHEDULE}
                  element={<Navigate to={AppRoutePath.SCHEDULE} replace />}
                />
                <Route
                  path={AppRoutePath.LEGACY_LEAGUE_CALENDAR}
                  element={<Navigate to={AppRoutePath.LEAGUE_CALENDAR} replace />}
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </OnlineVisitorsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </AutomaticThemeProvider>
);

export default App;
