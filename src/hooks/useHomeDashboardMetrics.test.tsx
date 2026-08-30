import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomeDashboardMetrics } from "@/domain/home/homeDashboard.repository";
import { useHomeDashboardMetrics } from "@/hooks/useHomeDashboardMetrics";

vi.mock("@/domain/home/homeDashboard.repository", () => ({
  fetchHomeDashboardMetrics: vi.fn(),
}));

const fetchHomeDashboardMetricsMock = vi.mocked(fetchHomeDashboardMetrics);

describe("useHomeDashboardMetrics", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("não busca novamente as métricas gerais quando a visualização já as recebeu", () => {
    const { result } = renderHook(() =>
      useHomeDashboardMetrics(null, null, false),
    );

    expect(fetchHomeDashboardMetricsMock).not.toHaveBeenCalled();
    expect(result.current.metrics).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("busca métricas ao ativar um filtro específico de campeonato", async () => {
    fetchHomeDashboardMetricsMock.mockResolvedValue({
      data: null,
      error: null,
    });

    renderHook(() => useHomeDashboardMetrics(null, "INTERLAJE", true));

    await waitFor(() => {
      expect(fetchHomeDashboardMetricsMock).toHaveBeenCalledWith(
        null,
        "INTERLAJE",
      );
    });
  });
});
