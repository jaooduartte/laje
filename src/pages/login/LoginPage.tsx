import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminLoginStage, AdminUserPasswordStatus, AppRoutePath } from "@/lib/enums";
import { LoginPageView } from "@/pages/login/LoginPageView";
import {
  AdminLoginStateDTO,
  AdminUserPasswordSetupDTO,
} from "@/domain/admin-users/AdminUserDTO";
import type { AdminLoginState } from "@/domain/admin-users/adminUser.types";

export function LoginPage() {
  const { user, canAccessAdminPanel, loading, roleLoading, signIn, signOut } = useAuth();
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginStage, setLoginStage] = useState(AdminLoginStage.LOGIN_IDENTIFIER);
  const [resolvedLoginState, setResolvedLoginState] = useState<AdminLoginState | null>(null);

  if (user && canAccessAdminPanel) {
    return <Navigate to={AppRoutePath.ADMIN} replace />;
  }

  const isLoading = loading || roleLoading;
  const isUnauthorized = !!user && !canAccessAdminPanel;

  const handleResetLoginFlow = () => {
    setLoginStage(AdminLoginStage.LOGIN_IDENTIFIER);
    setResolvedLoginState(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const registerAdminLoginAction = async () => {
    const { error: loginActionError } = await supabase.rpc("register_admin_login_action");

    if (loginActionError) {
      console.error("Erro ao registrar login administrativo:", loginActionError.message);
    }
  };

  const handleResolveLoginState = async () => {
    const normalizedLoginIdentifier = loginIdentifier.trim().toLowerCase();

    if (!normalizedLoginIdentifier) {
      setError("Informe seu usuário.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { data, error: loginStateError } = await supabase.rpc("resolve_admin_login_state", {
      _login_identifier: normalizedLoginIdentifier,
    });

    setSubmitting(false);

    if (loginStateError) {
      setError(loginStateError.message);
      return;
    }

    const loginStateRow = data?.[0] ?? null;

    if (!loginStateRow) {
      setError("Usuário não encontrado.");
      return;
    }

    const nextLoginState = AdminLoginStateDTO.fromResponse(loginStateRow).bindToRead();

    setResolvedLoginState(nextLoginState);
    setLoginIdentifier(nextLoginState.login_identifier);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLoginStage(
      nextLoginState.password_status == AdminUserPasswordStatus.PENDING
        ? AdminLoginStage.PASSWORD_SETUP
        : AdminLoginStage.PASSWORD,
    );
  };

  const handleSubmitExistingPassword = async () => {
    if (!resolvedLoginState) {
      setError("Informe seu usuário.");
      return;
    }

    if (!password.trim()) {
      setError("Informe sua senha.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { error: signInError } = await signIn(resolvedLoginState.auth_email, password);

    setSubmitting(false);

    if (signInError) {
      setError("Credenciais inválidas.");
      return;
    }

    void registerAdminLoginAction();
  };

  const handleSubmitPasswordSetup = async () => {
    try {
      const passwordSetupDTO = AdminUserPasswordSetupDTO.fromFormValues({
        login_identifier: loginIdentifier,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      const passwordSetupPayload = passwordSetupDTO.bindToSave();

      setSubmitting(true);
      setError("");

      const { data, error: passwordSetupError } = await supabase.rpc("complete_admin_user_password_setup", passwordSetupPayload);

      if (passwordSetupError) {
        setSubmitting(false);
        setError(passwordSetupError.message);
        return;
      }

      if (!data) {
        setSubmitting(false);
        setError("Não foi possível concluir a criação da senha.");
        return;
      }

      const { error: signInError } = await signIn(data, passwordSetupPayload._new_password);

      setSubmitting(false);

      if (signInError) {
        setError("Não foi possível concluir o acesso com a nova senha.");
        return;
      }

      void registerAdminLoginAction();
    } catch (error) {
      setSubmitting(false);
      setError(error instanceof Error ? error.message : "Não foi possível concluir a criação da senha.");
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (loginStage == AdminLoginStage.LOGIN_IDENTIFIER) {
      await handleResolveLoginState();
      return;
    }

    if (loginStage == AdminLoginStage.PASSWORD) {
      await handleSubmitExistingPassword();
      return;
    }

    await handleSubmitPasswordSetup();
  };

  return (
    <LoginPageView
      isLoading={isLoading}
      isUnauthorized={isUnauthorized}
      loginStage={loginStage}
      loginIdentifier={loginIdentifier}
      error={error}
      password={password}
      newPassword={newPassword}
      confirmPassword={confirmPassword}
      submitting={submitting}
      onLoginIdentifierChange={setLoginIdentifier}
      onPasswordChange={setPassword}
      onNewPasswordChange={setNewPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onResetLoginFlow={handleResetLoginFlow}
      onSubmit={handleSubmit}
      onSignOut={signOut}
    />
  );
}
