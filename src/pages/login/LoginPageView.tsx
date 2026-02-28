import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginPageViewProps {
  isLoading: boolean;
  isUnauthorized: boolean;
  email: string;
  password: string;
  error: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
}

export function LoginPageView({
  isLoading,
  isUnauthorized,
  email,
  password,
  error,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onSignOut,
}: LoginPageViewProps) {
  if (isLoading) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-10">
          <div className="glass-panel flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className="app-page">
        <Header />

        <main className="container flex items-center justify-center py-10">
          <div className="glass-panel enter-section w-full max-w-sm space-y-4 p-8 text-center">
            <h1 className="text-2xl font-display font-bold">Acesso não autorizado</h1>
            <p className="text-sm text-muted-foreground">Seu usuário não possui perfil para acessar o painel.</p>
            <Button type="button" className="w-full" onClick={onSignOut}>
              Voltar
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <Header />

      <main className="container flex items-center justify-center py-10">
        <div className="glass-panel enter-section w-full max-w-sm space-y-8 p-8">
          <div className="space-y-2 text-center">
            <img src="/logo.png" alt="Logo LAJE" className="mx-auto h-14 w-14 rounded-xl object-cover" />
            <h1 className="text-2xl font-display font-bold">LAJE Admin</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito à CO da LAJE.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
              className="glass-input"
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
              className="glass-input"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
