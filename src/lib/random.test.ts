import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRandomUuid } from "@/lib/random";

describe("resolveRandomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa a API de UUID criptográfico quando disponível", () => {
    const randomUUID = vi.fn(() => "random-uuid");
    vi.stubGlobal("crypto", { randomUUID });

    expect(resolveRandomUuid()).toBe("random-uuid");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("usa bytes criptográficos quando randomUUID não está disponível", () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.fill(0xaa);
      return values;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(resolveRandomUuid()).toBe("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("mantém o fallback quando a API de criptografia não está disponível", () => {
    vi.stubGlobal("crypto", {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(resolveRandomUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });
});
