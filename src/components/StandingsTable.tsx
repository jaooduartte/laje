import type { Standing } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AppBadge } from '@/components/ui/app-badge';
import { resolveMatchNaipeBadgeTone, resolveMatchNaipeLabel } from '@/lib/championship';

interface Props {
  standings: Standing[];
}

export function StandingsTable({ standings }: Props) {
  if (standings.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma classificação disponível.</p>;
  }

  return (
    <div className="glass-panel enter-section overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/45">
            <TableHead className="w-8 text-center">#</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-28 text-center">Naipe</TableHead>
            <TableHead className="text-center w-10">J</TableHead>
            <TableHead className="text-center w-10">V</TableHead>
            <TableHead className="text-center w-10">E</TableHead>
            <TableHead className="text-center w-10">D</TableHead>
            <TableHead className="text-center w-10">GP</TableHead>
            <TableHead className="text-center w-10">GC</TableHead>
            <TableHead className="text-center w-10">SG</TableHead>
            <TableHead className="text-center w-12 font-bold">PTS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((s, i) => (
            <TableRow key={s.id} className="hover:bg-secondary/25">
              <TableCell className="text-center font-display font-bold text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-display font-semibold">{s.teams?.name}</TableCell>
              <TableCell className="text-center">
                <AppBadge tone={resolveMatchNaipeBadgeTone(String(s.naipe))}>
                  {resolveMatchNaipeLabel(String(s.naipe))}
                </AppBadge>
              </TableCell>
              <TableCell className="text-center score-text">{s.played}</TableCell>
              <TableCell className="text-center score-text">{s.wins}</TableCell>
              <TableCell className="text-center score-text">{s.draws}</TableCell>
              <TableCell className="text-center score-text">{s.losses}</TableCell>
              <TableCell className="text-center score-text">{s.goals_for}</TableCell>
              <TableCell className="text-center score-text">{s.goals_against}</TableCell>
              <TableCell className="text-center score-text">{s.goal_diff}</TableCell>
              <TableCell className="text-center font-display font-bold text-primary">{s.points}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
