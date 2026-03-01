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

export function AdminPublicAccessSettings({ canManageSettings = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publicAccessSettings, setPublicAccessSettings] = useState<PublicAccessSettings>(DEFAULT_PUBLIC_ACCESS_SETTINGS);

  useEffect(() => {
    const fetchPublicAccessSettings = async () => {
      setLoading(true);

      const { data, error } = await supabase.rpc("get_public_access_settings");

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const normalizedSettings = resolvePublicAccessSettings(data as PublicAccessSettings[] | PublicAccessSettings | null);
      setPublicAccessSettings(normalizedSettings);
      setLoading(false);
    };

    fetchPublicAccessSettings();
  }, []);

  const handleSaveSettings = async () => {
    if (!canManageSettings) {
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("set_public_access_settings", {
      _is_public_access_blocked: publicAccessSettings.is_public_access_blocked,
      _is_live_page_blocked: publicAccessSettings.is_live_page_blocked,
      _is_championships_page_blocked: publicAccessSettings.is_championships_page_blocked,
      _is_schedule_page_blocked: publicAccessSettings.is_schedule_page_blocked,
      _is_league_calendar_page_blocked: publicAccessSettings.is_league_calendar_page_blocked,
      _blocked_message:
        publicAccessSettings.blocked_message && publicAccessSettings.blocked_message.trim().length > 0
          ? publicAccessSettings.blocked_message.trim()
          : null,
    });

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Configuração pública atualizada.");
  };

  if (loading) {
    return (
      <div className="glass-card enter-section flex min-h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass-card enter-section space-y-5 p-4">
      <div>
        <p className="text-sm font-semibold">Acesso às telas públicas</p>
        <p className="text-xs text-muted-foreground">
          Bloqueie o acesso por manutenção. O bloqueio afeta menu e acesso direto por URL.
        </p>
      </div>

      <div className="rounded-2xl border border-white/40 bg-white/30 p-3 backdrop-blur">
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

      <div className="rounded-2xl border border-white/40 bg-white/30 p-3 backdrop-blur space-y-3">
        <p className="text-sm font-medium">Bloqueio por tela pública</p>
        <p className="text-xs text-muted-foreground">Você pode bloquear apenas uma, várias ou todas as telas.</p>

        <div className="space-y-3">
          {PUBLIC_PAGE_ACCESS_FIELD_ORDER.map((publicPageAccessSettingField) => (
            <div key={publicPageAccessSettingField} className="flex items-center justify-between gap-3">
              <p className="text-sm">{PUBLIC_PAGE_ACCESS_LABELS[publicPageAccessSettingField]}</p>
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
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-access-blocked-message">Mensagem de manutenção (opcional)</Label>
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
          className="min-h-24 resize-none border-white/40 bg-white/45 backdrop-blur"
          disabled={!canManageSettings}
        />
      </div>

      {canManageSettings ? (
        <div className="flex justify-end">
          <Button type="button" onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
