import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppBadgeTone } from "@/lib/enums";
import type { CurrentAdminAccount } from "@/lib/types";
import {
  resolveAdminUserPasswordStatusBadgeTone,
  resolveAdminUserPasswordStatusLabel,
  resolveShouldDisplayInternalAdminUserEmail,
} from "@/lib/adminUsers";
import {
  AdminUserLoginIdentifierSaveDTO,
  AdminUserNameSaveDTO,
  AdminUserPasswordSaveDTO,
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
  const [currentAdminAccount, setCurrentAdminAccount] = useState<CurrentAdminAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingSection, setSavingSection] = useState<"NAME" | "LOGIN" | "PASSWORD" | null>(null);

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

    const normalizedCurrentAdminAccount = CurrentAdminAccountDTO.fromResponse(currentAdminAccountRow).bindToRead();

    setCurrentAdminAccount(normalizedCurrentAdminAccount);
    setName(normalizedCurrentAdminAccount.name);
    setLoginIdentifier(normalizedCurrentAdminAccount.login_identifier);
    setNewPassword("");
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCurrentAdminAccount();
  }, [fetchCurrentAdminAccount]);

  const handleSaveName = async () => {
    if (!currentAdminAccount || !canManageAccount) {
      return;
    }

    try {
      const payload = AdminUserNameSaveDTO.fromFormValues({
        target_user_id: currentAdminAccount.user_id,
        name,
      }).bindToSave();

      setSavingSection("NAME");

      const { error } = await supabase.rpc("admin_update_user_name", payload);

      setSavingSection(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Nome atualizado com sucesso.");
      fetchCurrentAdminAccount();
    } catch (error) {
      setSavingSection(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o nome.");
    }
  };

  const handleSaveLoginIdentifier = async () => {
    if (!currentAdminAccount || !canManageAccount) {
      return;
    }

    try {
      const payload = AdminUserLoginIdentifierSaveDTO.fromFormValues({
        target_user_id: currentAdminAccount.user_id,
        login_identifier: loginIdentifier,
      }).bindToSave();

      setSavingSection("LOGIN");

      const { error } = await supabase.rpc("admin_update_user_login_identifier", payload);

      setSavingSection(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Login atualizado com sucesso.");
      fetchCurrentAdminAccount();
    } catch (error) {
      setSavingSection(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o login.");
    }
  };

  const handleSavePassword = async () => {
    if (!currentAdminAccount || !canManageAccount) {
      return;
    }

    try {
      const payload = AdminUserPasswordSaveDTO.fromFormValues({
        target_user_id: currentAdminAccount.user_id,
        new_password: newPassword,
      }).bindToSave();

      setSavingSection("PASSWORD");

      const { error } = await supabase.rpc("admin_update_user_password", payload);

      setSavingSection(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Senha atualizada com sucesso.");
      setNewPassword("");
      fetchCurrentAdminAccount();
    } catch (error) {
      setSavingSection(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    }
  };

  if (loading) {
    return (
      <div className="glass-card enter-section flex min-h-28 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentAdminAccount) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar a conta administrativa atual.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="glass-card enter-section space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Minha conta</h2>
            <AppBadge tone={resolveAdminUserPasswordStatusBadgeTone(currentAdminAccount.password_status)}>
              {resolveAdminUserPasswordStatusLabel(currentAdminAccount.password_status)}
            </AppBadge>
            <AppBadge tone={AppBadgeTone.PRIMARY}>você</AppBadge>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Perfil atual: {currentAdminAccount.profile_name ?? "Sem perfil"}</p>
            {resolveShouldDisplayInternalAdminUserEmail(
              currentAdminAccount.email,
              currentAdminAccount.login_identifier,
            ) ? (
              <p className="truncate">E-mail técnico: {currentAdminAccount.email}</p>
            ) : null}
            {!canManageAccount ? <p>Seu perfil possui apenas visualização para esta aba.</p> : null}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-3 backdrop-blur-md">
            <Label htmlFor="admin-account-name-input">Nome</Label>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="admin-account-name-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="glass-input"
                autoComplete="name"
                disabled={!canManageAccount}
              />

              <Button
                type="button"
                variant="outline"
                className="bg-background/75"
                onClick={handleSaveName}
                disabled={!canManageAccount || savingSection == "NAME"}
              >
                {savingSection == "NAME" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar nome
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-3 backdrop-blur-md">
            <Label htmlFor="admin-account-login-input">Login</Label>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="admin-account-login-input"
                value={loginIdentifier}
                onChange={(event) => setLoginIdentifier(event.target.value)}
                className="glass-input"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={!canManageAccount}
              />

              <Button
                type="button"
                variant="outline"
                className="bg-background/75"
                onClick={handleSaveLoginIdentifier}
                disabled={!canManageAccount || savingSection == "LOGIN"}
              >
                {savingSection == "LOGIN" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar login
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-3 backdrop-blur-md">
          <Label htmlFor="admin-account-password-input">Nova senha</Label>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              id="admin-account-password-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="glass-input"
              autoComplete="new-password"
              disabled={!canManageAccount}
            />

            <Button
              type="button"
              variant="outline"
              className="bg-background/75"
              onClick={handleSavePassword}
              disabled={!canManageAccount || savingSection == "PASSWORD"}
            >
              {savingSection == "PASSWORD" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Atualizar senha
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
