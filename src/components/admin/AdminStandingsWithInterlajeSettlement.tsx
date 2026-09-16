import type { ComponentProps } from "react";
import { AdminStandings as AdminStandingsBase } from "./AdminStandings";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";

/**
 * O INTERLAJE possui fechamento sazonal próprio no banco: ao mudar para
 * FINISHED, o trigger da LAJE-103 usa get_interlaje_overall_standings e aplica
 * o Top 12 de forma transacional. A ação genérica de movimentação do componente
 * legado usa a soma de standings esportivos e, portanto, não pode ficar ativa
 * para o INTERLAJE.
 *
 * Demais campeonatos continuam usando o fluxo legado sem alteração.
 */
export function AdminStandings(
  props: ComponentProps<typeof AdminStandingsBase>,
) {
  if (props.selectedChampionship.code != ChampionshipCode.INTERLAJE) {
    return <AdminStandingsBase {...props} />;
  }

  const canManageStandings = props.canManageStandings ?? true;
  const canManageDisqualifications =
    props.canManageDisqualifications ?? canManageStandings;
  const isFinished =
    props.selectedChampionship.status == ChampionshipStatus.FINISHED;

  return (
    <div className="space-y-4">
      {canManageStandings && isFinished ? (
        <div className="glass-card enter-section p-4">
          <p className="text-sm font-semibold text-foreground">
            Fechamento de divisões do INTERLAJE
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            O Top 12 é aplicado automaticamente no encerramento usando a
            classificação geral oficial do INTERLAJE. As posições 1–12 ficam na
            Divisão Principal e as demais na Divisão de Acesso; somente atléticas
            cuja divisão mudou são atualizadas e registradas no histórico.
          </p>
        </div>
      ) : null}

      <AdminStandingsBase
        {...props}
        canManageStandings={false}
        canManageDisqualifications={canManageDisqualifications}
      />
    </div>
  );
}
