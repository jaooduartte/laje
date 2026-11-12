import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportBrowserFailure } from "@/lib/observability";

import { AwsErrorBoundary } from "./AwsErrorBoundary";

vi.mock("@/lib/observability", () => ({
  reportBrowserFailure: vi.fn(),
}));

function ThrowOnRender(): ReactElement {
  throw new Error("Controlled React render failure");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("LAJE-40 AWS error boundary", () => {
  it("renders children normally without recording an error", () => {
    render(
      <AwsErrorBoundary>
        <p>Bem-vindo</p>
      </AwsErrorBoundary>,
    );

    expect(screen.getByText("Bem-vindo")).toBeInTheDocument();
    expect(reportBrowserFailure).not.toHaveBeenCalled();
  });

  it("shows a safe fallback and reports the render-failure category", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AwsErrorBoundary>
        <ThrowOnRender />
      </AwsErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar esta página.");
    expect(reportBrowserFailure).toHaveBeenCalledWith("react-render");
  });
});
