import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { DEFAULT_PUBLIC_ACCESS_SETTINGS } from "@/lib/publicAccess";

const mockUseAuth = vi.fn();
const mockUsePublicAccessSettings = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/usePublicAccessSettings", () => ({
  usePublicAccessSettings: () => mockUsePublicAccessSettings(),
}));

function renderHeader() {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{
        v7_relativeSplatPath: true,
        v7_startTransition: true,
      }}
    >
      <Header />
    </MemoryRouter>,
  );
}

function mockAnnouncementDimensions(viewportWidth: number, textWidth: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function clientWidth() {
    return this.classList.contains("app-announcement-viewport") ? viewportWidth : 0;
  });

  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function scrollWidth() {
    return this.classList.contains("app-announcement-measure") ? textWidth : 0;
  });
}

describe("Header", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
    });
    mockUsePublicAccessSettings.mockReturnValue({
      publicAccessSettings: DEFAULT_PUBLIC_ACCESS_SETTINGS,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reserva o afastamento visual sem deslocar o header sticky", () => {
    const { container } = renderHeader();

    expect(container.querySelector("header")).toHaveClass("top-0", "pt-4");
  });

  it.each([null, "", "   "])("não renderiza banner quando announcement_message é %p", (announcementMessage) => {
    mockUsePublicAccessSettings.mockReturnValue({
      publicAccessSettings: {
        ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
        announcement_message: announcementMessage,
      },
    });

    renderHeader();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza o banner em modo estático quando a mensagem cabe na largura disponível", async () => {
    mockAnnouncementDimensions(320, 140);
    mockUsePublicAccessSettings.mockReturnValue({
      publicAccessSettings: {
        ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
        announcement_message: "Novo regulamento disponível.",
      },
    });

    renderHeader();

    expect(screen.getAllByText("Novo regulamento disponível.").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(document.querySelector(".app-announcement-viewport")).toHaveAttribute("data-overflowing", "false");
    });

    expect(document.querySelector(".app-announcement-marquee-track")).not.toBeInTheDocument();
  });

  it("ativa marquee quando a mensagem ultrapassa a largura disponível", async () => {
    mockAnnouncementDimensions(140, 360);
    mockUsePublicAccessSettings.mockReturnValue({
      publicAccessSettings: {
        ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
        announcement_message: "Aviso importante com texto longo para validar o comportamento rolando em linha única.",
      },
    });

    renderHeader();

    await waitFor(() => {
      expect(document.querySelector(".app-announcement-viewport")).toHaveAttribute("data-overflowing", "true");
    });

    expect(document.querySelector(".app-announcement-marquee-track")).toBeInTheDocument();
    expect(
      screen.getAllByText("Aviso importante com texto longo para validar o comportamento rolando em linha única.").length,
    ).toBeGreaterThan(1);
  });
});
