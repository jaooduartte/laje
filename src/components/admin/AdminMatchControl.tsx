import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Square, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  matches: Match[];
  onRefetch: () => void;
}

export function AdminMatchControl({ matches, onRefetch }: Props) {
  const [scores, setScores] = useState<Record<string, { home: number; away: number }>>({});

  const getScore = (match: Match) => {
    return scores[match.id] ?? { home: match.home_score, away: match.away_score };
  };

  const updateScore = (matchId: string, side: 'home' | 'away', delta: number) => {
    setScores(prev => {
      const match = matches.find(m => m.id === matchId)!;
      const current = prev[matchId] ?? { home: match.home_score, away: match.away_score };
      const newVal = Math.max(0, current[side] + delta);
      return { ...prev, [matchId]: { ...current, [side]: newVal } };
    });
  };

  const handleSetLive = async (matchId: string) => {
    const { error } = await supabase.from('matches').update({ status: 'LIVE' as any }).eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo iniciado!');
    onRefetch();
  };

  const handleSaveScore = async (matchId: string) => {
    const s = getScore(matches.find(m => m.id === matchId)!);
    const { error } = await supabase.from('matches').update({
      home_score: s.home,
      away_score: s.away,
    }).eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Placar atualizado!');
    onRefetch();
  };

  const handleFinish = async (matchId: string) => {
    const s = getScore(matches.find(m => m.id === matchId)!);
    const { error } = await supabase.from('matches').update({
      home_score: s.home,
      away_score: s.away,
      status: 'FINISHED' as any,
    }).eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo finalizado! Classificação atualizada.');
    onRefetch();
  };

  if (matches.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum jogo ao vivo ou agendado.</p>;
  }

  return (
    <div className="space-y-4">
      {matches.map(match => {
        const score = getScore(match);
        return (
          <div key={match.id} className={`bg-card border rounded-lg p-5 space-y-4 ${
            match.status === 'LIVE' ? 'border-live/50 live-glow' : 'border-border'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground uppercase">{match.sports?.name} • {match.location}</span>
                {match.status === 'LIVE' && (
                  <span className="ml-2 text-xs font-bold text-live live-pulse">● AO VIVO</span>
                )}
              </div>
              <div className="flex gap-2">
                {match.status === 'SCHEDULED' && (
                  <Button size="sm" onClick={() => handleSetLive(match.id)} className="bg-live text-primary-foreground hover:bg-live-glow">
                    <Play className="h-3 w-3 mr-1" /> Iniciar
                  </Button>
                )}
                {match.status === 'LIVE' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleSaveScore(match.id)}>
                      Salvar Placar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleFinish(match.id)}>
                      <Square className="h-3 w-3 mr-1" /> Finalizar
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <div className="text-right flex-1">
                <p className="font-display font-bold">{match.home_team?.name}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateScore(match.id, 'home', -1)} disabled={match.status !== 'LIVE'}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    value={score.home}
                    onChange={e => setScores(prev => ({ ...prev, [match.id]: { ...score, home: parseInt(e.target.value) || 0 } }))}
                    className="w-14 text-center font-display text-2xl font-bold bg-secondary border-border score-text h-12"
                    disabled={match.status !== 'LIVE'}
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateScore(match.id, 'home', 1)} disabled={match.status !== 'LIVE'}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <span className="text-xl text-muted-foreground font-display">×</span>

                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateScore(match.id, 'away', -1)} disabled={match.status !== 'LIVE'}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    value={score.away}
                    onChange={e => setScores(prev => ({ ...prev, [match.id]: { ...score, away: parseInt(e.target.value) || 0 } }))}
                    className="w-14 text-center font-display text-2xl font-bold bg-secondary border-border score-text h-12"
                    disabled={match.status !== 'LIVE'}
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateScore(match.id, 'away', 1)} disabled={match.status !== 'LIVE'}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex-1">
                <p className="font-display font-bold">{match.away_team?.name}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
