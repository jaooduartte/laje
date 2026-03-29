import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminLoginStage } from "@/lib/enums";

interface LoginPageViewProps {
  isLoading: boolean;
  isUnauthorized: boolean;
  loginStage: AdminLoginStage;
  loginIdentifier: string;
  password: string;
  newPassword: string;
  confirmPassword: string;
  error: string;
  submitting: boolean;
  onLoginIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onResetLoginFlow: () => void;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
}

function resolveLoginTitle(loginStage: AdminLoginStage): string {
  if (loginStage == AdminLoginStage.PASSWORD_SETUP) {
    return "Crie sua senha";
  }

  return "LAJE Admin";
}

function resolveLoginDescription(loginStage: AdminLoginStage): string {
  if (loginStage == AdminLoginStage.PASSWORD) {
    return "Digite sua senha para acessar o painel.";
  }

  if (loginStage == AdminLoginStage.PASSWORD_SETUP) {
    return "Primeiro acesso ou senha resetada. Defina sua nova senha para continuar.";
  }

  return "Informe seu usuário para continuar.";
}

function resolveSubmitLabel(loginStage: AdminLoginStage, submitting: boolean): string {
  if (submitting) {
    return "";
  }

  if (loginStage == AdminLoginStage.LOGIN_IDENTIFIER) {
    return "Continuar";
  }

  if (loginStage == AdminLoginStage.PASSWORD_SETUP) {
    return "Criar senha e entrar";
  }

  return "Entrar";
}

export function LoginPageView({
  isLoading,
  isUnauthorized,
  loginStage,
  loginIdentifier,
  password,
  newPassword,
  confirmPassword,
  error,
  submitting,
  onLoginIdentifierChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onResetLoginFlow,
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
            <h1 className="text-2xl font-display font-bold">{resolveLoginTitle(loginStage)}</h1>
            <p className="text-sm text-muted-foreground">{resolveLoginDescription(loginStage)}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Usuário"
              value={loginIdentifier}
              onChange={(event) => onLoginIdentifierChange(event.target.value)}
              required
              className="app-input-field"
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loginStage != AdminLoginStage.LOGIN_IDENTIFIER}
            />

            {loginStage == AdminLoginStage.PASSWORD ? (
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                required
                className="app-input-field"
                autoComplete="current-password"
              />
            ) : null}

            {loginStage == AdminLoginStage.PASSWORD_SETUP ? (
              <div className="space-y-4">
                <Input
                  type="password"
                  placeholder="Nova senha"
                  value={newPassword}
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  required
                  className="app-input-field"
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  placeholder="Confirmar nova senha"
                  value={confirmPassword}
                  onChange={(event) => onConfirmPasswordChange(event.target.value)}
                  required
                  className="app-input-field"
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : resolveSubmitLabel(loginStage, submitting)}
              </Button>

              {loginStage != AdminLoginStage.LOGIN_IDENTIFIER ? (
                <Button type="button" variant="outline" className="w-full bg-background/70" onClick={onResetLoginFlow}>
                  Alterar usuário
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
