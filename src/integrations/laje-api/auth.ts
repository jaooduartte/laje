import { frontendEnvironment } from "@/config/environment";

export interface DedicatedAuthPermission {
  scope: string;
  level: "NONE" | "VIEW" | "EDIT";
}

export interface DedicatedAuthUser {
  id: string;
  email: string | null;
  role: "admin" | "eventos" | "mesa" | null;
  profile: { id: string; name: string } | null;
  permissions: DedicatedAuthPermission[];
  canAccessAdminPanel: boolean;
}

export interface DedicatedAuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: DedicatedAuthUser;
}

export interface DedicatedLoginState {
  loginIdentifier: string;
  passwordStatus: "PENDING" | "ACTIVE";
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

interface ApiEnvelope<T> {
  data: T;
}

export class LajeApiAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LajeApiAuthError";
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;

function baseUrl(): string {
  const value = frontendEnvironment.apiUrl;
  if (!value) {
    throw new Error("VITE_API_URL não está configurada para autenticação pela laje-api.");
  }
  return value.replace(/\/$/, "");
}

async function request<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    authenticated?: boolean;
  },
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.authenticated) {
    if (!accessToken) {
      throw new LajeApiAuthError(401, "ACCESS_TOKEN_REQUIRED", "Sessão administrativa ausente.");
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method,
    credentials: "include",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new LajeApiAuthError(
      response.status,
      body?.error?.code ?? "API_REQUEST_FAILED",
      body?.error?.message ?? "Não foi possível concluir a autenticação.",
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function persistSession(session: DedicatedAuthSession): DedicatedAuthSession {
  accessToken = session.accessToken;
  return session;
}

export function isDedicatedAuthEnabled(): boolean {
  return Boolean(frontendEnvironment.apiUrl);
}

export function clearDedicatedAccessToken(): void {
  accessToken = null;
}

export async function resolveDedicatedLoginState(
  loginIdentifier: string,
): Promise<DedicatedLoginState> {
  const response = await request<ApiEnvelope<DedicatedLoginState>>("/auth/login-state", {
    method: "POST",
    body: { loginIdentifier },
  });
  return response.data;
}

export async function createDedicatedSession(
  loginIdentifier: string,
  password: string,
): Promise<DedicatedAuthSession> {
  const response = await request<ApiEnvelope<DedicatedAuthSession>>("/auth/sessions", {
    method: "POST",
    body: { loginIdentifier, password },
  });
  return persistSession(response.data);
}

export async function setupDedicatedPassword(
  loginIdentifier: string,
  newPassword: string,
): Promise<DedicatedAuthSession> {
  const response = await request<ApiEnvelope<DedicatedAuthSession>>("/auth/password-setup", {
    method: "POST",
    body: { loginIdentifier, newPassword },
  });
  return persistSession(response.data);
}

export async function refreshDedicatedSession(): Promise<DedicatedAuthSession> {
  const response = await request<ApiEnvelope<DedicatedAuthSession>>("/auth/sessions/refresh", {
    method: "POST",
  });
  return persistSession(response.data);
}

export async function deleteDedicatedSession(): Promise<void> {
  try {
    if (accessToken) {
      await request<void>("/auth/sessions/current", {
        method: "DELETE",
        authenticated: true,
      });
    }
  } finally {
    clearDedicatedAccessToken();
  }
}

export async function changeDedicatedPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request<void>("/auth/password", {
    method: "PATCH",
    authenticated: true,
    body: { currentPassword, newPassword },
  });
}

export function getDedicatedAccessToken(): string | null {
  return accessToken;
}
