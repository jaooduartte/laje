import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPublicAccessSettings } from "@/components/admin/AdminPublicAccessSettings";
import { DEFAULT_PUBLIC_ACCESS_SETTINGS } from "@/lib/publicAccess";

const { mockRpc, toast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock("sonner", () => ({
  toast,
}));

function buildSettings(overrides: Partial<typeof DEFAULT_PUBLIC_ACCESS_SETTINGS> = {}) {
  return {
    ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
    updated_at: "2026-06-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("AdminPublicAccessSettings", () => {
  beforeEach(() => {
    mockRpc.mockImplementation((functionName: string, payload?: Record<string, unknown>) => {
      if (functionName == "get_public_access_settings") {
        return Promise.resolve({
          data: [buildSettings()],
          error: null,
        });
      }

      if (functionName == "set_public_access_settings") {
        return Promise.resolve({
          data: null,
          error: null,
          payload,
        });
      }

      return Promise.resolve({
        data: null,
        error: null,
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("carrega announcement_message do RPC no campo de aviso do app", async () => {
    mockRpc.mockImplementation((functionName: string) => {
      if (functionName == "get_public_access_settings") {
        return Promise.resolve({
          data: [buildSettings({ announcement_message: "Mensagem global para o app" })],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    render(<AdminPublicAccessSettings canManageSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Aviso no app (opcional)")).toHaveValue("Mensagem global para o app");
    });
  });

  it("envia _announcement_message com trim ao salvar", async () => {
    render(<AdminPublicAccessSettings canManageSettings />);

    const announcementField = await screen.findByLabelText("Aviso no app (opcional)");

    fireEvent.change(announcementField, {
      target: { value: "  Novo aviso importante para todos  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "set_public_access_settings",
        expect.objectContaining({
          _announcement_message: "Novo aviso importante para todos",
        }),
      );
    });
  });

  it("envia null quando o aviso é limpo", async () => {
    mockRpc.mockImplementation((functionName: string) => {
      if (functionName == "get_public_access_settings") {
        return Promise.resolve({
          data: [buildSettings({ announcement_message: "Mensagem já publicada" })],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    render(<AdminPublicAccessSettings canManageSettings />);

    const announcementField = await screen.findByLabelText("Aviso no app (opcional)");

    fireEvent.change(announcementField, {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "set_public_access_settings",
        expect.objectContaining({
          _announcement_message: null,
        }),
      );
    });
  });

  it("não salva quando a diferença é apenas de espaços", async () => {
    mockRpc.mockImplementation((functionName: string) => {
      if (functionName == "get_public_access_settings") {
        return Promise.resolve({
          data: [buildSettings({ announcement_message: "Mensagem atual" })],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    render(<AdminPublicAccessSettings canManageSettings />);

    const announcementField = await screen.findByLabelText("Aviso no app (opcional)");

    fireEvent.change(announcementField, {
      target: { value: "  Mensagem atual  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith("Nenhuma alteração para salvar.");
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
