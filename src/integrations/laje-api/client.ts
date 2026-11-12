import { frontendEnvironment, isAwsBackendEnabled } from "@/config/environment";
import { reportBrowserFailure } from "@/lib/observability";

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

  // Envia requisições para a API dedicada e inclui o token de sessão quando disponível.
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    // An intentional cancellation is not an incident; preserve the original error.
    if (!(error instanceof Error && error.name === "AbortError")) {
      reportBrowserFailure("api-network");
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as ResponseType;
  }

  const payload = (await response.json().catch(() => null)) as
    ApiErrorPayload | ResponseType | null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    if (response.status >= 500) {
      reportBrowserFailure("api-http", {
        status: response.status,
        code: errorPayload?.error?.code,
        requestId: response.headers.get("x-request-id"),
      });
    }
    throw new LajeApiError(
      response.status,
      errorPayload?.error?.code ?? "LAJE_API_REQUEST_FAILED",
      errorPayload?.error?.message ?? "Não foi possível concluir a solicitação.",
      errorPayload?.error?.details,
    );
  }

  return payload as ResponseType;
}
