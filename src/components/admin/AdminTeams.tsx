import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Team } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  teams: Team[];
  onRefetch: () => void;
}

export function AdminTeams({ teams, onRefetch }: Props) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Joinville');

  const handleAdd = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('teams').insert({ name: name.trim(), city });
    if (error) { toast.error(error.message); return; }
    toast.success('Atlética criada!');
    setName('');
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Atlética removida.');
    onRefetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome da atlética" value={name} onChange={e => setName(e.target.value)} className="bg-secondary border-border" />
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-40 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Joinville">Joinville</SelectItem>
            <SelectItem value="Blumenau">Blumenau</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>

      <div className="space-y-2">
        {teams.map(t => (
          <div key={t.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
            <div>
              <span className="font-display font-semibold">{t.name}</span>
              <span className="text-muted-foreground text-sm ml-2">({t.city})</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
