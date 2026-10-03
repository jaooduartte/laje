import { frontendEnvironment } from "@/config/environment";
import {
  createPublicLinkItemFromApi,
  createPublicLinkSectionFromApi,
  deletePublicLinkItemFromApi,
  deletePublicLinkSectionFromApi,
  updatePublicLinkItemFromApi,
  updatePublicLinkSectionFromApi,
  type PublicLinkFilterWriteInput,
} from "@/integrations/laje-api/public-content";
import type { Database } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIGRATED_PUBLIC_LINK_RPCS = new Set([
  "upsert_public_link_section",
  "delete_public_link_section",
  "upsert_public_link_item",
  "delete_public_link_item",
]);

type LajeSupabaseClient = SupabaseClient<Database>;
type RpcArguments = Record<string, unknown> | undefined;

function successResult<DataType>(data: DataType) {
  return {
    data,
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  };
}

function failureResult(error: unknown) {
  return {
    data: null,
    error: {
      message: error instanceof Error ? error.message : "Não foi possível concluir a solicitação.",
      details: "",
      hint: "",
      code: "LAJE_API_REQUEST_FAILED",
    },
    count: null,
    status: 500,
    statusText: "LAJE API request failed",
  };
}

function requireLegacyString(args: RpcArguments, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string") {
    throw new Error(`Parâmetro legado ${key} inválido.`);
  }
  return value;
}

function optionalLegacyString(args: RpcArguments, key: string): string | null {
  const value = args?.[key];
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error(`Parâmetro legado ${key} inválido.`);
  }
  return value;
}

function requireLegacyNumber(args: RpcArguments, key: string): number {
  const value = args?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Parâmetro legado ${key} inválido.`);
  }
  return value;
}

function requireLegacyBoolean(args: RpcArguments, key: string): boolean {
  const value = args?.[key];
  if (typeof value !== "boolean") {
    throw new Error(`Parâmetro legado ${key} inválido.`);
  }
  return value;
}

function parseLegacyFilters(args: RpcArguments): PublicLinkFilterWriteInput[] {
  const filters = args?._filters;
  if (!Array.isArray(filters)) return [];

  return filters.map((rawFilter) => {
    if (rawFilter == null || typeof rawFilter !== "object" || Array.isArray(rawFilter)) {
      throw new Error("Filtro legado de link público inválido.");
    }

    const filter = rawFilter as Record<string, unknown>;
    if (typeof filter.championship_id !== "string" || typeof filter.season_year !== "number") {
      throw new Error("Filtro legado de link público inválido.");
    }

    return {
      championshipId: filter.championship_id,
      seasonYear: filter.season_year,
    };
  });
}

async function executeMigratedPublicLinksRpc(rpcName: string, args: RpcArguments) {
  try {
    switch (rpcName) {
      case "upsert_public_link_section": {
        const sectionId = optionalLegacyString(args, "_section_id");
        const input = {
          name: requireLegacyString(args, "_name"),
          description: optionalLegacyString(args, "_description"),
          sortOrder: requireLegacyNumber(args, "_sort_order"),
          isActive: requireLegacyBoolean(args, "_is_active"),
        };
        const section = sectionId
          ? await updatePublicLinkSectionFromApi(sectionId, input)
          : await createPublicLinkSectionFromApi(input);
        return successResult(section.id);
      }
      case "delete_public_link_section": {
        await deletePublicLinkSectionFromApi(requireLegacyString(args, "_section_id"));
        return successResult(null);
      }
      case "upsert_public_link_item": {
        const itemId = optionalLegacyString(args, "_item_id");
        const filterMode = requireLegacyString(args, "_filter_mode") as "GLOBAL" | "BY_CHAMPIONSHIP_YEAR";
        const input = {
          sectionId: requireLegacyString(args, "_section_id"),
          displayName: requireLegacyString(args, "_display_name"),
          url: requireLegacyString(args, "_url"),
          sortOrder: requireLegacyNumber(args, "_sort_order"),
          isActive: requireLegacyBoolean(args, "_is_active"),
          filterMode,
          filters: filterMode === "BY_CHAMPIONSHIP_YEAR" ? parseLegacyFilters(args) : [],
        };
        const item = itemId
          ? await updatePublicLinkItemFromApi(itemId, input)
          : await createPublicLinkItemFromApi(input);
        return successResult(item.id);
      }
      case "delete_public_link_item": {
        await deletePublicLinkItemFromApi(requireLegacyString(args, "_item_id"));
        return successResult(null);
      }
      default:
        throw new Error(`RPC não migrada: ${rpcName}`);
    }
  } catch (error) {
    return failureResult(error);
  }
}

/**
 * Compatibilidade transitória da LAJE-87.
 *
 * O AdminLinks ainda usa a assinatura dos RPCs legados para preservar o contrato
 * da tela durante a migração. Quando VITE_API_URL está configurada, esses quatro
 * RPCs são executados pela laje-api e não fazem requisição ao Supabase. Demais
 * operações continuam inalteradas até suas respectivas tarefas de migração.
 */
export function withLaje87RpcCompatibility(client: LajeSupabaseClient): LajeSupabaseClient {
  if (!frontendEnvironment.apiUrl) {
    return client;
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "rpc") {
        return Reflect.get(target, property, receiver);
      }

      return (rpcName: string, args?: RpcArguments, options?: unknown) => {
        if (MIGRATED_PUBLIC_LINK_RPCS.has(rpcName)) {
          return executeMigratedPublicLinksRpc(rpcName, args);
        }

        return target.rpc(
          rpcName as never,
          args as never,
          options as never,
        );
      };
    },
  }) as LajeSupabaseClient;
}
