import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminMatches.tsx"),
  "utf8",
);

describe("AdminMatches edit modal", () => {
  it("mantém o formulário rolável dentro da altura disponível", () => {
    expect(componentSource).toContain(
      'max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)]',
    );
    expect(componentSource).toContain(
      'className="min-h-0 flex-1 overflow-y-auto pr-1"',
    );
    expect(componentSource).toContain(
      '<DialogFooter className="shrink-0">',
    );
  });
});
