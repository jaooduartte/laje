import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Login = () => {
  const { user, canAccessAdminPanel, loading, roleLoading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (user && canAccessAdminPanel) {
    return <Navigate to="/admin" replace />;
  }

  if (user && !canAccessAdminPanel) {
    return (
      <div className="min-h-screen">
        <Header />

        <main className="container flex items-center justify-center py-10">
          <div className="w-full max-w-sm space-y-4 p-8 text-center">
            <h1 className="text-2xl font-display font-bold">Acesso não autorizado</h1>
            <p className="text-sm text-muted-foreground">
              Seu usuário não possui perfil para acessar o painel.
            </p>
            <Button type="button" className="w-full" onClick={signOut}>
              Voltar
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError("Credenciais inválidas.");
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container flex items-center justify-center py-10">
        <div className="w-full max-w-sm space-y-8 p-8">
          <div className="space-y-2 text-center">
            <img src="/logo.png" alt="Logo LAJE" className="mx-auto h-14 w-14 rounded-xl object-cover" />
            <h1 className="text-2xl font-display font-bold">LAJE Admin</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito à CO da LAJE.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="bg-secondary border-border"
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="bg-secondary border-border"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
