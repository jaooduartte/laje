import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/environment", () => ({
  frontendEnvironment: {
    apiUrl: "https://api.example.com/api/v1",
  },
}));

import { createDedicatedSession, resolveDedicatedLoginState } from "@/integrations/laje-api/auth";
import { lajeApiRequest, setLajeApiAccessToken } from "@/integrations/laje-api/client";

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
    setLajeApiAccessToken(null);
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

  it("mantém o access token em memória e o propaga nas chamadas administrativas", async () => {
    fetchMock
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    const session = await createDedicatedSession("admin", "secret-password");
    await lajeApiRequest("/public/links/admin");

    expect(session.accessToken).toBe("access-token");
    expect(session).not.toHaveProperty("refreshToken");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/v1/public/links/admin",
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );

    const protectedRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(protectedRequest.headers).get("authorization")).toBe("Bearer access-token");
  });
});
