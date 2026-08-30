import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Header } from "@/components/Header";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHomeDashboardMetrics } from "@/hooks/useHomeDashboardMetrics";
import { ChampionshipCode } from "@/lib/enums";
import type { HomeDashboardMetrics } from "@/lib/types";
import type { AppNavigationItem } from "@/lib/navigation";
import {
  LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_LABELS,
  LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES,
} from "@/domain/league-events/leagueEvent.constants";

export interface HomePageViewItem extends AppNavigationItem {
  isDisabledByMaintenance: boolean;
}

interface HomePageMaintenanceItem {
  label: string;
  reason: string;
}

interface HomePageViewProps {
  items: HomePageViewItem[];
  maintenanceItems: HomePageMaintenanceItem[];
  metrics: HomeDashboardMetrics | null;
}

const RED_PALETTE = ["#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#f87171"];
const CHAMPIONSHIP_LABELS: Record<ChampionshipCode, string> = {
  [ChampionshipCode.CLV]: "Copa Laje de Verão",
  [ChampionshipCode.SOCIETY]: "Copa Laje Society",
  [ChampionshipCode.INTERLAJE]: "Interlaje",
};

const chartConfig = {
  value: {
    label: "",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const CHART_CHAMPIONSHIP_FILTER_ALL = "ALL";
type ChartChampionshipFilter = ChampionshipCode | typeof CHART_CHAMPIONSHIP_FILTER_ALL;

const CHART_CHAMPIONSHIP_FILTER_OPTIONS: Array<{
  value: ChartChampionshipFilter;
  label: string;
}> = [
  { value: CHART_CHAMPIONSHIP_FILTER_ALL, label: "Todos" },
  { value: ChampionshipCode.CLV, label: "Copa Laje de Verão" },
  { value: ChampionshipCode.SOCIETY, label: "Copa Laje Society" },
  { value: ChampionshipCode.INTERLAJE, label: "Interlaje" },
];

function HorizontalDashboardChart({
  title,
  metricLabel,
  data,
  emptyLabel,
  selectedChampionshipFilter,
  onSelectedChampionshipFilterChange,
}: {
  title: string;
  metricLabel: string;
  data: Array<{ team_name: string; value: number }>;
  emptyLabel: string;
  selectedChampionshipFilter: ChartChampionshipFilter;
  onSelectedChampionshipFilterChange: (value: ChartChampionshipFilter) => void;
}) {
  return (
    <div className="glass-card rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-display font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{metricLabel}</p>
        </div>
        <Select value={selectedChampionshipFilter} onValueChange={(value) => onSelectedChampionshipFilterChange(value as ChartChampionshipFilter)}>
          <SelectTrigger className="h-8 w-[220px] max-w-full rounded-lg border-border/60 bg-muted/20 px-2 text-xs sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_CHAMPIONSHIP_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.length == 0 ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border/50 bg-muted/15 p-6 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[320px] w-full sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 52, top: 6, bottom: 6 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(dataMax + 6, Math.ceil(dataMax * 1.15))]}
              />
              <YAxis
                dataKey="team_name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={98}
                tick={{ fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                <LabelList dataKey="value" position="right" className="fill-foreground text-xs font-semibold" />
                {data.map((entry, index) => (
                  <Cell key={`${entry.team_name}-${index}`} fill={RED_PALETTE[index % RED_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </div>
  );
}

export function HomePageView({ items: _items, maintenanceItems, metrics }: HomePageViewProps) {
  const [topPerformanceFilter, setTopPerformanceFilter] = useState<ChartChampionshipFilter>(CHART_CHAMPIONSHIP_FILTER_ALL);
  const [mostMatchesFilter, setMostMatchesFilter] = useState<ChartChampionshipFilter>(CHART_CHAMPIONSHIP_FILTER_ALL);
  const { metrics: topPerformanceMetrics } = useHomeDashboardMetrics(
    null,
    topPerformanceFilter == CHART_CHAMPIONSHIP_FILTER_ALL ? null : topPerformanceFilter,
    topPerformanceFilter != CHART_CHAMPIONSHIP_FILTER_ALL,
  );
  const { metrics: mostMatchesMetrics } = useHomeDashboardMetrics(
    null,
    mostMatchesFilter == CHART_CHAMPIONSHIP_FILTER_ALL ? null : mostMatchesFilter,
    mostMatchesFilter != CHART_CHAMPIONSHIP_FILTER_ALL,
  );

  const topPerformance = topPerformanceMetrics?.top_performance ?? metrics?.top_performance ?? [];
  const mostMatches = mostMatchesMetrics?.most_matches ?? metrics?.most_matches ?? [];
  const seasonInsights = useMemo(() => {
    return (metrics?.season_insights ?? []).filter(
      (insight) =>
        insight.id != "MOST_MODALITIES" &&
        insight.team_name &&
        insight.value != null,
    );
  }, [metrics?.season_insights]);
  const groupedNextEvents = useMemo(() => {
    const nextEvents = metrics?.next_events ?? [];
    const groupedByDate = new Map<string, typeof nextEvents>();

    nextEvents.forEach((nextEvent) => {
      const items = groupedByDate.get(nextEvent.event_date) ?? [];
      groupedByDate.set(nextEvent.event_date, [...items, nextEvent]);
    });

    return [...groupedByDate.entries()];
  }, [metrics?.next_events]);

  return (
    <div className="app-page">
      <Header />

      <main className="container space-y-5 py-8">
        {maintenanceItems.length > 0 ? (
          <section className="glass-panel rounded-[2rem] p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold">Páginas em manutenção</h2>
                {maintenanceItems[0]?.reason ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{maintenanceItems[0].reason}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {maintenanceItems.map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <HorizontalDashboardChart
            title="Melhores desempenhos"
            metricLabel="Pontuação oficial acumulada no histórico, com filtro por campeonato."
            emptyLabel="Sem desempenho consolidado para exibir."
            data={topPerformance.map((item) => ({ team_name: item.team_name, value: item.value }))}
            selectedChampionshipFilter={topPerformanceFilter}
            onSelectedChampionshipFilterChange={setTopPerformanceFilter}
          />
        </section>

        <section>
          <HorizontalDashboardChart
            title="Atléticas com mais jogos"
            metricLabel="Partidas cadastradas no histórico, incluindo agendadas, ao vivo e encerradas."
            emptyLabel="Sem jogos suficientes para exibir o ranking."
            data={mostMatches.map((item) => ({ team_name: item.team_name, value: item.value }))}
            selectedChampionshipFilter={mostMatchesFilter}
            onSelectedChampionshipFilterChange={setMostMatchesFilter}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="glass-card rounded-3xl p-4 sm:p-5">
            <h3 className="text-lg font-display font-semibold">Próximo dia com eventos</h3>
            <p className="text-sm text-muted-foreground">Agenda pública mais próxima para acompanhamento da liga.</p>
            {groupedNextEvents.length == 0 ? (
              <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-border/50 bg-muted/15 p-4 text-sm text-muted-foreground">
                Não há próximos eventos cadastrados.
              </div>
            ) : (
              <div className="mt-4">
                <div className="relative space-y-3 pl-4">
                  <span className="absolute bottom-0 left-1 top-0 w-px bg-border/50" />
                  {groupedNextEvents.map(([eventDate, eventItems]) => (
                    <div key={eventDate} className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        {format(new Date(`${eventDate}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </p>
                      {eventItems.map((eventItem) => (
                        <div key={`${eventDate}-${eventItem.name}-${eventItem.organizer_name}`} className="relative">
                          <div className={`rounded-xl px-3 py-2 ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[eventItem.event_type]}`}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{eventItem.name}</p>
                              <p className={`text-xs font-semibold ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[eventItem.event_type]}`}>
                                {LEAGUE_EVENT_TYPE_LABELS[eventItem.event_type]}
                              </p>
                            </div>
                            <p className={`text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[eventItem.event_type]}`}>
                              {eventItem.organizer_name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-[2rem] p-4 sm:p-5">
            <div className="mb-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Histórico da liga</p>
              <h2 className="text-2xl font-display font-bold">Destaques da temporada</h2>
            </div>

            {seasonInsights.length == 0 ? (
              <div className="flex min-h-[240px] items-center rounded-2xl border border-border/50 bg-muted/15 p-4">
                <p className="text-sm text-muted-foreground">Ainda não há dados suficientes para o radar da temporada.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {seasonInsights.map((insight) => (
                  <div key={insight.id} className="glass-card rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{insight.label}</p>
                    <p className="mt-1 font-semibold">{insight.team_name}</p>
                    {insight.id == "BIGGEST_WIN_MARGIN" && insight.season_year && insight.championship_code ? (
                      <Badge variant="outline" className="mt-2 rounded-lg border-border/60 text-[11px]">
                        {insight.season_year} • {CHAMPIONSHIP_LABELS[insight.championship_code]}
                        {insight.sport_name ? ` • ${insight.sport_name}` : ""}
                      </Badge>
                    ) : null}
                    <p className="mt-2 text-sm text-muted-foreground">
                      {insight.value} {insight.unit}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
