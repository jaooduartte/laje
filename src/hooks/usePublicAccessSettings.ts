import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicAccessSettings } from "@/lib/types";
import {
  DEFAULT_PUBLIC_ACCESS_SETTINGS,
  resolvePublicAccessSettings,
} from "@/lib/publicAccess";

interface PublicAccessSettingsStoreState {
  loading: boolean;
  publicAccessSettings: PublicAccessSettings;
}

const PUBLIC_ACCESS_SETTINGS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let publicAccessSettingsStoreState: PublicAccessSettingsStoreState = {
  loading: true,
  publicAccessSettings: DEFAULT_PUBLIC_ACCESS_SETTINGS,
};
let publicAccessSettingsRequest: Promise<void> | null = null;
let publicAccessSettingsPollingIntervalId: number | null = null;
let publicAccessSettingsSubscriberCount = 0;
let publicAccessSettingsLastFetchedAt: number | null = null;
const publicAccessSettingsSubscribers = new Set<
  (nextState: PublicAccessSettingsStoreState) => void
>();

function notifyPublicAccessSettingsSubscribers() {
  publicAccessSettingsSubscribers.forEach((subscriber) => {
    subscriber(publicAccessSettingsStoreState);
  });
}

async function fetchPublicAccessSettings(force = false) {
  if (publicAccessSettingsRequest != null) {
    return publicAccessSettingsRequest;
  }

  if (
    !force &&
    publicAccessSettingsLastFetchedAt != null &&
    Date.now() - publicAccessSettingsLastFetchedAt <
      PUBLIC_ACCESS_SETTINGS_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  publicAccessSettingsRequest = (async () => {
    const { data, error } = await supabase.rpc("get_public_access_settings");

    if (error) {
      console.error(
        "Erro ao carregar configurações de acesso público:",
        error.message,
      );

      // Keep the last known-good value during transient API/database failures.
      // On the first load this is already the safe application default.
      publicAccessSettingsStoreState = {
        ...publicAccessSettingsStoreState,
        loading: false,
      };
    } else {
      publicAccessSettingsStoreState = {
        loading: false,
        publicAccessSettings: resolvePublicAccessSettings(
          data as PublicAccessSettings[] | PublicAccessSettings | null,
        ),
      };
    }

    // Back off after both success and failure so a degraded Data API is not
    // hammered by every mounted consumer or browser tab.
    publicAccessSettingsLastFetchedAt = Date.now();
    notifyPublicAccessSettingsSubscribers();
  })().finally(() => {
    publicAccessSettingsRequest = null;
  });

  return publicAccessSettingsRequest;
}

function startPublicAccessSettingsPolling() {
  publicAccessSettingsSubscriberCount += 1;

  if (publicAccessSettingsSubscriberCount != 1) {
    return;
  }

  void fetchPublicAccessSettings();
  publicAccessSettingsPollingIntervalId = window.setInterval(() => {
    if (document.visibilityState == "visible") {
      void fetchPublicAccessSettings();
    }
  }, PUBLIC_ACCESS_SETTINGS_REFRESH_INTERVAL_MS);
}

function stopPublicAccessSettingsPolling() {
  publicAccessSettingsSubscriberCount = Math.max(
    0,
    publicAccessSettingsSubscriberCount - 1,
  );

  if (publicAccessSettingsSubscriberCount != 0) {
    return;
  }

  if (publicAccessSettingsPollingIntervalId != null) {
    window.clearInterval(publicAccessSettingsPollingIntervalId);
    publicAccessSettingsPollingIntervalId = null;
  }
}

export function usePublicAccessSettings() {
  const [storeState, setStoreState] = useState(publicAccessSettingsStoreState);

  const refetchPublicAccessSettings = useCallback(async () => {
    await fetchPublicAccessSettings(true);
  }, []);

  useEffect(() => {
    const subscriber = (nextState: PublicAccessSettingsStoreState) => {
      setStoreState(nextState);
    };

    publicAccessSettingsSubscribers.add(subscriber);
    startPublicAccessSettingsPolling();

    const handleVisibilityChange = () => {
      if (document.visibilityState == "visible") {
        void fetchPublicAccessSettings();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      publicAccessSettingsSubscribers.delete(subscriber);
      stopPublicAccessSettingsPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return {
    publicAccessSettings: storeState.publicAccessSettings,
    loading: storeState.loading,
    refetchPublicAccessSettings,
  };
}
