import type { Sport } from '@/lib/types';

interface Props {
  sports: Sport[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function SportFilter({ sports, selected, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          selected === null ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        }`}
      >
        Todas
      </button>
      {sports.map((sport) => (
        <button
          key={sport.id}
          onClick={() => onSelect(sport.id)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selected === sport.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {sport.name}
        </button>
      ))}
    </div>
  );
}
