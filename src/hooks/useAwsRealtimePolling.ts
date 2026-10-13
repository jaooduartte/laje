import { useEffect, useRef } from "react";
import { isAwsBackendEnabled } from "@/config/environment";

/**
 * A single browser-side scheduler for every AWS realtime fallback subscriber.
 * It does not provision AWS infrastructure or poll when the page is hidden/offline.
 */
const SCHEDULER_TICK_MS = 5_000;
const MIN_POLL_MS = 15_000;
const RESUME_MIN_MS = 10_000;

interface Subscription {
  callback: () => void | Promise<void>;
  intervalMs: number;
  lastRunAt: number;
  pending: boolean;
}

const subscribers = new Map<symbol, Subscription>();
let timer: number | null = null;

function isActiveBrowser(): boolean {
  return (
    typeof document !== "undefined" &&
    document.visibilityState !== "hidden" &&
    typeof navigator !== "undefined" &&
    navigator.onLine !== false
  );
}

function runDueSubscribers(onResume: boolean): void {
  if (!isActiveBrowser()) return;
  const now = Date.now();

  for (const subscription of subscribers.values()) {
    const minInterval = onResume
      ? Math.min(subscription.intervalMs, RESUME_MIN_MS)
      : subscription.intervalMs;

    if (subscription.pending || now - subscription.lastRunAt < minInterval) continue;

    subscription.lastRunAt = now;
    subscription.pending = true;

    void Promise.resolve()
      .then(() => subscription.callback())
      .catch((error: unknown) => {
        console.warn("Falha temporária ao atualizar dados AWS:", error);
      })
      .finally(() => {
        subscription.pending = false;
      });
  }
}

function handleResume(): void {
  runDueSubscribers(true);
}

function startScheduler(): void {
  if (timer !== null || typeof window === "undefined") return;
  timer = window.setInterval(() => runDueSubscribers(false), SCHEDULER_TICK_MS);
  window.addEventListener("focus", handleResume);
  window.addEventListener("online", handleResume);
  document.addEventListener("visibilitychange", handleResume);
}

function stopScheduler(): void {
  if (subscribers.size > 0 || timer === null || typeof window === "undefined") return;
  window.clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", handleResume);
  window.removeEventListener("online", handleResume);
  document.removeEventListener("visibilitychange", handleResume);
}

export interface AwsRealtimePollingOptions {
  enabled: boolean;
  intervalMs: number;
  onRefresh: () => void | Promise<void>;
}

/**
 * AWS-only, visibility-aware refresh. Existing data hooks perform their initial
 * fetch; this scheduler handles subsequent updates without Supabase channels.
 */
export function useAwsRealtimePolling({
  enabled,
  intervalMs,
  onRefresh,
}: AwsRealtimePollingOptions): void {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !isAwsBackendEnabled()) return;

    const key = Symbol("laje-aws-polling");
    subscribers.set(key, {
      callback: () => callbackRef.current(),
      intervalMs: Math.max(MIN_POLL_MS, intervalMs),
      lastRunAt: Date.now(),
      pending: false,
    });
    startScheduler();

    return () => {
      subscribers.delete(key);
      stopScheduler();
    };
  }, [enabled, intervalMs]);
}
