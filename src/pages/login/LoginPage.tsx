import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppRoutePath } from "@/lib/enums";
import { LoginPageView } from "@/pages/login/LoginPageView";

export function LoginPage() {
  const { user, canAccessAdminPanel, loading, roleLoading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && canAccessAdminPanel) {
    return <Navigate to={AppRoutePath.ADMIN} replace />;
  }

  const isLoading = loading || roleLoading;
  const isUnauthorized = !!user && !canAccessAdminPanel;

  const handleSubmit = async (event: FormEvent) => {
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
    <LoginPageView
      isLoading={isLoading}
      isUnauthorized={isUnauthorized}
      email={email}
      password={password}
      error={error}
      submitting={submitting}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
      onSignOut={signOut}
    />
  );
}
