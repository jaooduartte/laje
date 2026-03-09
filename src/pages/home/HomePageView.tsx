import { Link } from "react-router-dom";
import type { AppNavigationItem } from "@/lib/navigation";

export interface HomePageViewItem extends AppNavigationItem {
  isDisabledByMaintenance: boolean;
}

interface HomePageViewProps {
  items: HomePageViewItem[];
}

export function HomePageView({ items }: HomePageViewProps) {
  return (
    <div className="app-page">
      <main className="container flex min-h-dvh items-center justify-center py-8">
        <section className="glass-panel enter-section mx-auto w-full max-w-3xl space-y-5 p-6 sm:p-8">
          <div className="space-y-3 text-center">
            <img
              src="/logo.png"
              alt="Logo LAJE"
              className="mx-auto h-24 w-24 object-contain sm:h-28 sm:w-28"
            />
            <p className="text-sm text-muted-foreground">
              Acesse rapidamente as páginas da liga.
            </p>
          </div>

          <div className="space-y-3">
            {items.map((homePageListItem) => {
              const Icon = homePageListItem.icon;

              if (homePageListItem.isDisabledByMaintenance) {
                return (
                  <button
                    key={homePageListItem.routePath}
                    type="button"
                    disabled
                    title="Tela temporariamente indisponível por manutenção"
                    className="glass-card flex w-full cursor-not-allowed items-center justify-between rounded-2xl px-4 py-4 text-left opacity-65"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-base font-semibold text-muted-foreground">{homePageListItem.label}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground sm:px-2.5 sm:text-xs">
                      Em manutenção
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={homePageListItem.routePath}
                  to={homePageListItem.routePath}
                  className="glass-card glass-card-hover flex w-full items-center justify-between rounded-2xl px-4 py-4 transition"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-base font-semibold text-foreground">{homePageListItem.label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
