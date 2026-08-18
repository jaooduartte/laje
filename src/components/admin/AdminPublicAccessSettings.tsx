import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PUBLIC_ACCESS_SETTINGS,
  PUBLIC_PAGE_ACCESS_FIELD_ORDER,
  PUBLIC_PAGE_ACCESS_LABELS,
  resolvePublicAccessSettings,
} from "@/lib/publicAccess";
import type { PublicAccessSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  canManageSettings?: boolean;
}

interface PublicAccessSettingsSavePayload {
  is_public_access_blocked: boolean;
  is_live_page_blocked: boolean;
  is_championships_page_blocked: boolean;
  is_schedule_page_blocked: boolean;
  is_league_calendar_page_blocked: boolean;
  is_links_page_blocked: boolean;
  blocked_message: string | null;
  announcement_message: string | null;
}

function normalizeOptionalMessage(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function resolvePublicAccessSettingsSavePayload(
  publicAccessSettings: PublicAccessSettings,
): PublicAccessSettingsSavePayload {
  return {
    is_public_access_blocked: publicAccessSettings.is_public_access_blocked,
    is_live_page_blocked: publicAccessSettings.is_live_page_blocked,
    is_championships_page_blocked:
      publicAccessSettings.is_championships_page_blocked,
    is_schedule_page_blocked: publicAccessSettings.is_schedule_page_blocked,
    is_league_calendar_page_blocked:
      publicAccessSettings.is_league_calendar_page_blocked,
    is_links_page_blocked: publicAccessSettings.is_links_page_blocked,
    blocked_message: normalizeOptionalMessage(
      publicAccessSettings.blocked_message,
    ),
    announcement_message: normalizeOptionalMessage(
      publicAccessSettings.announcement_message,
    ),
  };
}

export function AdminPublicAccessSettings({
  canManageSettings = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publicAccessSettings, setPublicAccessSettings] =
    useState<PublicAccessSettings>(DEFAULT_PUBLIC_ACCESS_SETTINGS);
  const [lastSavedPayload, setLastSavedPayload] =
    useState<PublicAccessSettingsSavePayload>(
      resolvePublicAccessSettingsSavePayload(DEFAULT_PUBLIC_ACCESS_SETTINGS),
    );

  useEffect(() => {
    const fetchPublicAccessSettings = async () => {
      setLoading(true);

      const { data, error } = await supabase.rpc("get_public_access_settings");

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const normalizedSettings = resolvePublicAccessSettings(
        data as PublicAccessSettings[] | PublicAccessSettings | null,
      );
      setPublicAccessSettings(normalizedSettings);
      setLastSavedPayload(
        resolvePublicAccessSettingsSavePayload(normalizedSettings),
      );
      setLoading(false);
    };

    fetchPublicAccessSettings();
  }, []);

  const handleSaveSettings = async () => {
    if (!canManageSettings || saving) {
      return;
    }

    const nextPayload =
      resolvePublicAccessSettingsSavePayload(publicAccessSettings);

    if (JSON.stringify(nextPayload) == JSON.stringify(lastSavedPayload)) {
      toast.info("Nenhuma alteração para salvar.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("set_public_access_settings", {
        _is_public_access_blocked: nextPayload.is_public_access_blocked,
        _is_live_page_blocked: nextPayload.is_live_page_blocked,
        _is_championships_page_blocked:
          nextPayload.is_championships_page_blocked,
        _is_schedule_page_blocked: nextPayload.is_schedule_page_blocked,
        _is_league_calendar_page_blocked:
          nextPayload.is_league_calendar_page_blocked,
        _is_links_page_blocked: nextPayload.is_links_page_blocked,
        _blocked_message: nextPayload.blocked_message,
        _announcement_message: nextPayload.announcement_message,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setLastSavedPayload(nextPayload);
      toast.success("Configuração pública atualizada.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card enter-section space-y-5 p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className="rounded-2xl app-card-muted p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>

            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        </div>

        <div className="rounded-2xl app-card-muted space-y-3 p-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>

          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`public-access-page-skeleton-${index}`}
                className="flex items-center justify-between gap-3"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>

        {canManageSettings ? (
          <div className="flex justify-center">
            <Skeleton className="h-10 w-44 rounded-xl" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="glass-card enter-section space-y-5 p-4">
      <div>
        <p className="text-sm font-semibold">Acesso às telas públicas</p>
        <p className="text-xs text-muted-foreground">
          Bloqueie o acesso por manutenção. O bloqueio afeta menu e acesso
          direto por URL.
        </p>
      </div>

      <div className="rounded-2xl app-card-muted p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Bloquear telas públicas</p>
            <p className="text-xs text-muted-foreground">
              Ao ativar, páginas públicas ficam indisponíveis para usuários.
            </p>
          </div>
          <Switch
            checked={publicAccessSettings.is_public_access_blocked}
            onCheckedChange={(nextIsPublicAccessBlocked) =>
              setPublicAccessSettings((currentPublicAccessSettings) => ({
                ...currentPublicAccessSettings,
                is_public_access_blocked: nextIsPublicAccessBlocked,
              }))
            }
            disabled={!canManageSettings}
            aria-label="Bloquear telas públicas"
          />
        </div>
      </div>

      <div className="rounded-2xl app-card-muted space-y-3 p-3">
        <p className="text-sm font-medium">Bloqueio por tela pública</p>
        <p className="text-xs text-muted-foreground">
          Você pode bloquear apenas uma, várias ou todas as telas.
        </p>

        <div className="space-y-3">
          {PUBLIC_PAGE_ACCESS_FIELD_ORDER.map(
            (publicPageAccessSettingField) => (
              <div
                key={publicPageAccessSettingField}
                className="flex items-center justify-between gap-3"
              >
                <p className="text-sm">
                  {PUBLIC_PAGE_ACCESS_LABELS[publicPageAccessSettingField]}
                </p>
                <Switch
                  checked={publicAccessSettings[publicPageAccessSettingField]}
                  onCheckedChange={(isPageBlocked) =>
                    setPublicAccessSettings((currentPublicAccessSettings) => ({
                      ...currentPublicAccessSettings,
                      [publicPageAccessSettingField]: isPageBlocked,
                    }))
                  }
                  disabled={!canManageSettings}
                  aria-label={`Bloquear tela ${PUBLIC_PAGE_ACCESS_LABELS[publicPageAccessSettingField]}`}
                />
              </div>
            ),
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-access-blocked-message">
          Mensagem de manutenção (opcional)
        </Label>
        <Textarea
          id="public-access-blocked-message"
          value={publicAccessSettings.blocked_message ?? ""}
          onChange={(event) =>
            setPublicAccessSettings((currentPublicAccessSettings) => ({
              ...currentPublicAccessSettings,
              blocked_message: event.target.value,
            }))
          }
          placeholder="Ex.: Estamos em manutenção. Voltamos às 20h."
          className="app-input-field min-h-24 resize-none"
          disabled={!canManageSettings}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-access-announcement-message">
          Aviso no app (opcional)
        </Label>
        <Textarea
          id="public-access-announcement-message"
          value={publicAccessSettings.announcement_message ?? ""}
          onChange={(event) =>
            setPublicAccessSettings((currentPublicAccessSettings) => ({
              ...currentPublicAccessSettings,
              announcement_message: event.target.value,
            }))
          }
          placeholder="Ex.: Novo regulamento disponível na aba Links."
          className="app-input-field min-h-24 resize-none"
          disabled={!canManageSettings}
        />
        <p className="text-xs text-muted-foreground">
          Quando preenchido, aparece abaixo do cabeçalho em todas as telas do
          app.
        </p>
      </div>

      {canManageSettings ? (
        <div className="flex justify-center">
          <Button type="button" onClick={handleSaveSettings} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar configuração
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Perfil em visualização: sem permissão para editar configurações.
        </p>
      )}
    </div>
  );
}
