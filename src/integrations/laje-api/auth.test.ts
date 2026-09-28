import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/environment", () => ({
  frontendEnvironment: {
    apiUrl: "https://api.example.com/api/v1",
  },
}));

import {
  createDedicatedSession,
  resolveDedicatedLoginState,
} from "@/integrations/laje-api/auth";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("laje-api auth integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("normaliza o contrato de resolução do login administrativo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          loginIdentifier: "admin",
          passwordStatus: "ACTIVE",
        },
      }),
    );

    const state = await resolveDedicatedLoginState("admin");

    expect(state).toEqual({
      auth_email: "",
      login_identifier: "admin",
      password_status: "ACTIVE",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/auth/login-state",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("mantém o access token em resposta e o refresh token restrito ao cookie HTTP", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          accessToken: "access-token",
          tokenType: "Bearer",
          expiresAt: "2026-09-28T19:00:00.000Z",
          user: {
            id: "00000000-0000-0000-0000-000000000001",
            email: "admin@example.com",
            role: "admin",
            profile: {
              id: "00000000-0000-0000-0000-000000000002",
              name: "Administrador",
            },
            permissions: [{ scope: "control", level: "EDIT" }],
            canAccessAdminPanel: true,
          },
        },
      }),
    );

    const session = await createDedicatedSession("admin", "secret-password");

    expect(session.accessToken).toBe("access-token");
    expect(session).not.toHaveProperty("refreshToken");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/auth/sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
