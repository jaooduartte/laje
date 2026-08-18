import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAutomaticThemeContext } from "@/components/theme/AutomaticThemeProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AppBadgeTone, ThemeMode } from "@/lib/enums";
import type { CurrentAdminAccount } from "@/lib/types";
import {
  resolveAdminUserPasswordStatusBadgeTone,
  resolveAdminUserPasswordStatusLabel,
  resolveShouldDisplayInternalAdminUserEmail,
} from "@/lib/adminUsers";
import { resolveThemeModeLabel } from "@/lib/theme";
import {
  AdminUserLoginIdentifierSaveDTO,
  AdminUserNameSaveDTO,
  AdminUserPasswordSaveDTO,
  AdminUserThemeModePreferenceSaveDTO,
  CurrentAdminAccountDTO,
} from "@/domain/admin-users/AdminUserDTO";
import { AppBadge } from "@/components/ui/app-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  canManageAccount?: boolean;
}

export function AdminAccount({ canManageAccount = false }: Props) {
  const { setPreferredThemeMode } = useAutomaticThemeContext();
  const [currentAdminAccount, setCurrentAdminAccount] =
    useState<CurrentAdminAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [themeModePreference, setThemeModePreference] = useState<ThemeMode>(
    ThemeMode.AUTO,
  );
  const [savingAccount, setSavingAccount] = useState(false);

  const fetchCurrentAdminAccount = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc("get_current_admin_account");

    if (error) {
      toast.error(error.message);
      setCurrentAdminAccount(null);
      setLoading(false);
      return;
    }

    const currentAdminAccountRow = data?.[0] ?? null;

    if (!currentAdminAccountRow) {
      setCurrentAdminAccount(null);
      setLoading(false);
      return;
    }

    const normalizedCurrentAdminAccount = CurrentAdminAccountDTO.fromResponse(
      currentAdminAccountRow,
    ).bindToRead();

    setCurrentAdminAccount(normalizedCurrentAdminAccount);
    setName(normalizedCurrentAdminAccount.name);
    setLoginIdentifier(normalizedCurrentAdminAccount.login_identifier);
    setThemeModePreference(normalizedCurrentAdminAccount.theme_mode_preference);
    setPreferredThemeMode(normalizedCurrentAdminAccount.theme_mode_preference);
    setNewPassword("");
    setLoading(false);
  }, [setPreferredThemeMode]);

  useEffect(() => {
    fetchCurrentAdminAccount();
  }, [fetchCurrentAdminAccount]);

  const handleSaveChanges = async () => {
    if (!currentAdminAccount || !canManageAccount) {
      return;
    }

    try {
      const hasNameChanged = name.trim() != currentAdminAccount.name;
      const hasLoginIdentifierChanged =
        loginIdentifier.trim().toLowerCase() !=
        currentAdminAccount.login_identifier.trim().toLowerCase();
      const hasNewPassword = newPassword.trim().length > 0;
      const hasThemeModePreferenceChanged =
        themeModePreference != currentAdminAccount.theme_mode_preference;

      if (
        !hasNameChanged &&
        !hasLoginIdentifierChanged &&
        !hasNewPassword &&
        !hasThemeModePreferenceChanged
      ) {
        return;
      }

      const namePayload = hasNameChanged
        ? AdminUserNameSaveDTO.fromFormValues({
            target_user_id: currentAdminAccount.user_id,
            name,
          }).bindToSave()
        : null;
      const loginIdentifierPayload = hasLoginIdentifierChanged
        ? AdminUserLoginIdentifierSaveDTO.fromFormValues({
            target_user_id: currentAdminAccount.user_id,
            login_identifier: loginIdentifier,
          }).bindToSave()
        : null;
      const passwordPayload = hasNewPassword
        ? AdminUserPasswordSaveDTO.fromFormValues({
            target_user_id: currentAdminAccount.user_id,
            new_password: newPassword,
          }).bindToSave()
        : null;
      const themeModePreferencePayload = hasThemeModePreferenceChanged
        ? AdminUserThemeModePreferenceSaveDTO.fromFormValues({
            theme_mode_preference: themeModePreference,
          }).bindToSave()
        : null;

      setSavingAccount(true);

      if (namePayload) {
        const { error } = await supabase.rpc(
          "admin_update_user_name",
          namePayload,
        );

        if (error) {
          setSavingAccount(false);
          await fetchCurrentAdminAccount();
          toast.error(error.message);
          return;
        }
      }

      if (loginIdentifierPayload) {
        const { error } = await supabase.rpc(
          "admin_update_user_login_identifier",
          loginIdentifierPayload,
        );

        if (error) {
          setSavingAccount(false);
          await fetchCurrentAdminAccount();
          toast.error(error.message);
          return;
        }
      }

      if (passwordPayload) {
        const { error } = await supabase.rpc(
          "admin_update_user_password",
          passwordPayload,
        );

        if (error) {
          setSavingAccount(false);
          await fetchCurrentAdminAccount();
          toast.error(error.message);
          return;
        }
      }

      if (themeModePreferencePayload) {
        const { error } = await supabase.rpc(
          "admin_update_current_user_theme_mode_preference",
          themeModePreferencePayload,
        );

        if (error) {
          setSavingAccount(false);
          await fetchCurrentAdminAccount();
          toast.error(error.message);
          return;
        }

        setPreferredThemeMode(themeModePreference);
      }

      setSavingAccount(false);
      toast.success("Alterações salvas com sucesso.");
      fetchCurrentAdminAccount();
    } catch (error) {
      setSavingAccount(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as alterações.",
      );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass-card enter-section space-y-4 p-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-60 max-w-full" />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`admin-account-field-skeleton-${index}`}
                className="space-y-2 rounded-2xl app-card-muted p-3"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Skeleton className="h-10 w-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentAdminAccount) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a conta administrativa atual.
      </p>
    );
  }

  const hasNameChanged = name.trim() != currentAdminAccount.name;
  const hasLoginIdentifierChanged =
    loginIdentifier.trim().toLowerCase() !=
    currentAdminAccount.login_identifier.trim().toLowerCase();
  const hasNewPassword = newPassword.trim().length > 0;
  const hasThemeModePreferenceChanged =
    themeModePreference != currentAdminAccount.theme_mode_preference;
  const hasPendingChanges =
    hasNameChanged ||
    hasLoginIdentifierChanged ||
    hasNewPassword ||
    hasThemeModePreferenceChanged;

  return (
    <div className="space-y-4">
      <div className="glass-card enter-section space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Minha conta</h2>
            <AppBadge
              tone={resolveAdminUserPasswordStatusBadgeTone(
                currentAdminAccount.password_status,
              )}
            >
              {resolveAdminUserPasswordStatusLabel(
                currentAdminAccount.password_status,
              )}
            </AppBadge>
            <AppBadge tone={AppBadgeTone.PRIMARY}>você</AppBadge>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Perfil atual: {currentAdminAccount.profile_name ?? "Sem perfil"}
            </p>
            {resolveShouldDisplayInternalAdminUserEmail(
              currentAdminAccount.email,
              currentAdminAccount.login_identifier,
            ) ? (
              <p className="truncate">
                E-mail técnico: {currentAdminAccount.email}
              </p>
            ) : null}
            {!canManageAccount ? (
              <p>Seu perfil possui apenas visualização para esta aba.</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-4">
          <div className="space-y-2 rounded-2xl app-card-muted p-3">
            <Label htmlFor="admin-account-name-input">Nome</Label>
            <Input
              id="admin-account-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="app-input-field"
              autoComplete="name"
              disabled={!canManageAccount}
            />
          </div>

          <div className="space-y-2 rounded-2xl app-card-muted p-3">
            <Label htmlFor="admin-account-login-input">Login</Label>
            <Input
              id="admin-account-login-input"
              value={loginIdentifier}
              onChange={(event) => setLoginIdentifier(event.target.value)}
              className="app-input-field"
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={!canManageAccount}
            />
          </div>

          <div className="space-y-2 rounded-2xl app-card-muted p-3">
            <Label htmlFor="admin-account-password-input">Nova senha</Label>
            <Input
              id="admin-account-password-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="app-input-field"
              autoComplete="new-password"
              disabled={!canManageAccount}
            />
          </div>

          <div className="space-y-2 rounded-2xl app-card-muted p-3">
            <Label htmlFor="admin-account-theme-mode-select">
              Tema do sistema
            </Label>
            <Select
              value={themeModePreference}
              onValueChange={(value) =>
                setThemeModePreference(value as ThemeMode)
              }
              disabled={!canManageAccount}
            >
              <SelectTrigger
                id="admin-account-theme-mode-select"
                className="app-input-field"
              >
                <SelectValue placeholder="Selecione um tema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ThemeMode.AUTO}>
                  {resolveThemeModeLabel(ThemeMode.AUTO)}
                </SelectItem>
                <SelectItem value={ThemeMode.LIGHT}>
                  {resolveThemeModeLabel(ThemeMode.LIGHT)}
                </SelectItem>
                <SelectItem value={ThemeMode.DARK}>
                  {resolveThemeModeLabel(ThemeMode.DARK)}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {canManageAccount ? (
          <div className="flex justify-center">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleSaveChanges}
              disabled={!hasPendingChanges || savingAccount}
            >
              {savingAccount ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar alterações
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
