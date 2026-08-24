import { describe, expect, it } from "vitest";
import { resolveAdminProfileLogChanges } from "@/components/admin/adminLogsAdminProfile.utils";

describe("resolveAdminProfileLogChanges", () => {
  it("identifica o nome e cada permissão que foi efetivamente alterada", () => {
    expect(
      resolveAdminProfileLogChanges(
        {
          profile_name: "Eventos",
          permissions: { events: "VIEW", logs: "NONE" },
        },
        {
          profile_name: "Comunicação",
          permissions: { events: "EDIT", logs: "VIEW" },
        },
      ),
    ).toEqual([
      "Nome do perfil: Eventos para Comunicação",
      "Permissão de Eventos da Liga: Visualização para Visualização e edição",
      "Permissão de Logs: Sem acesso para Visualização",
    ]);
  });

  it("torna legíveis os registros antigos sem estado anterior", () => {
    expect(
      resolveAdminProfileLogChanges(null, {
        profile_name: "Eventos",
        permissions: { events: "EDIT", logs: "NONE" },
      }),
    ).toEqual(["Permissão de Eventos da Liga: Visualização e edição"]);
  });
});
