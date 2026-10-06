import { frontendEnvironment, isAwsBackendEnabled } from "@/config/environment";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class LajeApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LajeApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let lajeApiAccessToken: string | null = null;

export function setLajeApiAccessToken(accessToken: string | null) {
  lajeApiAccessToken = accessToken;
}

function resolveApiBaseUrl(): string {
  if (!isAwsBackendEnabled()) {
    throw new LajeApiError(
      503,
      "LAJE_API_BACKEND_DISABLED",
      "A laje-api está desabilitada neste deployment. Configure VITE_BACKEND_PROVIDER=aws para usar a API dedicada.",
    );
  }

  const apiUrl = frontendEnvironment.apiUrl?.replace(/\/+$/, "");

  if (!apiUrl) {
    throw new LajeApiError(
      503,
      "LAJE_API_NOT_CONFIGURED",
      "A API dedicada do LAJE não está configurada neste ambiente.",
    );
  }

  return apiUrl;
}

export async function lajeApiRequest<ResponseType>(
  path: string,
  options: RequestInit = {},
  accessToken?: string | null,
): Promise<ResponseType> {
  const headers = new Headers(options.headers);
  const resolvedAccessToken = accessToken ?? lajeApiAccessToken;

  if (options.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (resolvedAccessToken) {
    headers.set("authorization", `Bearer ${resolvedAccessToken}`);
  }

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as ResponseType;
  }

  const payload = (await response.json().catch(() => null)) as
    ApiErrorPayload | ResponseType | null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new LajeApiError(
      response.status,
      errorPayload?.error?.code ?? "LAJE_API_REQUEST_FAILED",
      errorPayload?.error?.message ?? "Não foi possível concluir a solicitação.",
      errorPayload?.error?.details,
    );
  }

  return payload as ResponseType;
}
