import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/environment", () => ({
  frontendEnvironment: { apiUrl: "https://api.example.com/api/v1" },
}));

import {
  createDedicatedSession,
  deleteDedicatedSession,
  getDedicatedAccessToken,
  resolveDedicatedLoginState,
} from "@/integrations/laje-api/auth";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("laje-api auth client", () => {
  it("resolves login state without exposing a Supabase auth email", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { loginIdentifier: "admin", passwordStatus: "ACTIVE" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(resolveDedicatedLoginState("admin")).resolves.toEqual({
      loginIdentifier: "admin",
      passwordStatus: "ACTIVE",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/auth/login-state",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("keeps access token in memory and sends it only as Bearer on protected logout", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accessToken: "access-token",
              tokenType: "Bearer",
              expiresAt: "2026-09-28T20:00:00.000Z",
              user: {
                id: "user-id",
                email: null,
                role: "admin",
                profile: { id: "profile-id", name: "Administrador" },
                permissions: [{ scope: "control", level: "EDIT" }],
                canAccessAdminPanel: true,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await createDedicatedSession("admin", "password");
    expect(getDedicatedAccessToken()).toBe("access-token");
    await deleteDedicatedSession();
    expect(getDedicatedAccessToken()).toBeNull();

    const logoutOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(logoutOptions.headers).get("Authorization")).toBe("Bearer access-token");
  });
});
