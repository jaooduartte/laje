import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { AdminUserPasswordSetupDTO } from "@/domain/admin-users/AdminUserDTO";
import type { AdminLoginState } from "@/domain/admin-users/adminUser.types";
import { useAuth } from "@/hooks/useAuth";
import { AdminLoginStage, AdminUserPasswordStatus, AppRoutePath } from "@/lib/enums";
import { LoginPageView } from "@/pages/login/LoginPageView";

export function LoginPage() {
  const {
    user,
    canAccessAdminPanel,
    loading,
    roleLoading,
    resolveLoginState,
    setupPassword,
    signIn,
    signOut,
  } = useAuth();
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

  const handleResolveLoginState = async () => {
    const normalizedLoginIdentifier = loginIdentifier.trim().toLowerCase();

    if (!normalizedLoginIdentifier) {
      setError("Informe seu usuário.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { data: nextLoginState, error: loginStateError } = await resolveLoginState(
      normalizedLoginIdentifier,
    );

    setSubmitting(false);

    if (loginStateError) {
      setError(loginStateError.message);
      return;
    }

    if (!nextLoginState) {
      setError("Usuário não encontrado.");
      return;
    }

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

    const { error: signInError } = await signIn(
      resolvedLoginState.login_identifier,
      password,
    );

    setSubmitting(false);

    if (signInError) {
      setError("Credenciais inválidas.");
    }
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

      const { error: passwordSetupError } = await setupPassword(
        passwordSetupPayload._login_identifier,
        passwordSetupPayload._new_password,
      );

      setSubmitting(false);

      if (passwordSetupError) {
        setError(passwordSetupError.message);
      }
    } catch (error) {
      setSubmitting(false);
      setError(
        error instanceof Error ? error.message : "Não foi possível concluir a criação da senha.",
      );
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
