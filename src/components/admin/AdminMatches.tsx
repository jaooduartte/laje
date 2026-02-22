import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Match, Sport, Team } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  matches: Match[];
  sports: Sport[];
  teams: Team[];
  onRefetch: () => void;
}

export function AdminMatches({ matches, sports, teams, onRefetch }: Props) {
  const [sportId, setSportId] = useState('');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const handleAdd = async () => {
    if (!sportId || !homeId || !awayId || !location || !startTime || !endTime) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (homeId === awayId) {
      toast.error('Times devem ser diferentes.');
      return;
    }
    const { error } = await supabase.from('matches').insert({
      sport_id: sportId,
      home_team_id: homeId,
      away_team_id: awayId,
      location,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Jogo criado!');
    setLocation('');
    setStartTime('');
    setEndTime('');
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo removido.');
    onRefetch();
  };

  const statusLabels: Record<string, string> = {
    SCHEDULED: 'Agendado',
    LIVE: 'Ao Vivo',
    FINISHED: 'Encerrado',
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-display font-semibold">Novo Jogo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select value={sportId} onValueChange={setSportId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Modalidade" /></SelectTrigger>
            <SelectContent>
              {sports.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={homeId} onValueChange={setHomeId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Time Casa" /></SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={awayId} onValueChange={setAwayId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Time Visitante" /></SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Local" value={location} onChange={e => setLocation(e.target.value)} className="bg-secondary border-border" />
          <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-secondary border-border" />
          <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-secondary border-border" />
        </div>
        <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Criar Jogo</Button>
      </div>

      <div className="space-y-2">
        {matches.map(m => (
          <div key={m.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">{m.sports?.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  m.status === 'LIVE' ? 'bg-live/10 text-live' : m.status === 'FINISHED' ? 'text-finished bg-secondary' : 'text-scheduled bg-secondary'
                }`}>{statusLabels[m.status]}</span>
              </div>
              <p className="font-display font-semibold text-sm">
                {m.home_team?.name} {m.home_score} × {m.away_score} {m.away_team?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.location} • {format(new Date(m.start_time), "dd/MM HH:mm", { locale: ptBR })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
