import { Link, useLocation } from 'react-router-dom';
import { Radio, Calendar, Shield } from 'lucide-react';

export function Header() {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Ao Vivo', icon: Radio },
    { to: '/agenda', label: 'Agenda', icon: Calendar },
    { to: '/admin', label: 'Admin', icon: Shield },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Radio className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            LAJE <span className="text-primary">Ao Vivo</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === to
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
