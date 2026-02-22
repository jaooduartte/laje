import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Sport } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  sports: Sport[];
  onRefetch: () => void;
}

export function AdminSports({ sports, onRefetch }: Props) {
  const [name, setName] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('sports').insert({ name: name.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Modalidade criada!');
    setName('');
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('sports').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Modalidade removida.');
    onRefetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome da modalidade" value={name} onChange={e => setName(e.target.value)} className="bg-secondary border-border" />
        <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>

      <div className="space-y-2">
        {sports.map(s => (
          <div key={s.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
            <span className="font-display font-semibold">{s.name}</span>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
