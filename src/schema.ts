import type { McpServerConfig } from "./types.js";

/**
 * Optional, capability-gated fields on {@link McpServerConfig}.
 *
 * The canonical {@link McpServerConfig} is the single, agent-agnostic schema
 * that the CLI and library populate. Not every MCP client understands every
 * optional field, so each agent declares which of these it supports via
 * `AgentConfig.supportedFields`. Anything an agent does not support is dropped
 * before its transform runs, guaranteeing that only known fields are ever
 * written to a client config.
 */
export type OptionalField =
  | "timeout"
  | "scopes"
  | "autoApprove"
  | "bearerTokenEnv";

interface OptionalFieldSpec {
  /** Human-friendly label used in user-facing "dropped" warnings. */
  label: string;
  /** True when the canonical config carries a meaningful value for this field. */
  isSet: (config: McpServerConfig) => boolean;
  /** Remove the field from a config copy. Never mutates the caller's object. */
  clear: (config: McpServerConfig) => void;
}

const OPTIONAL_FIELD_SPECS: Record<OptionalField, OptionalFieldSpec> = {
  timeout: {
    label: "request timeout",
    isSet: (config) => typeof config.timeout === "number",
    clear: (config) => {
      delete config.timeout;
    },
  },
  scopes: {
    label: "OAuth scopes",
    isSet: (config) =>
      Array.isArray(config.oauthScopes) && config.oauthScopes.length > 0,
    clear: (config) => {
      delete config.oauthScopes;
    },
  },
  autoApprove: {
    label: "tool auto-approval",
    // An empty array is meaningful ("approve all tools"), so presence alone
    // counts as set — unlike scopes where an empty list means "nothing".
    isSet: (config) => Array.isArray(config.autoApproveTools),
    clear: (config) => {
      delete config.autoApproveTools;
    },
  },
  bearerTokenEnv: {
    label: "bearer token env",
    isSet: (config) => resolvedBearerTokenEnv(config) !== undefined,
    clear: (config) => {
      delete config.bearerTokenEnv;
    },
  },
};

export function resolvedBearerTokenEnv(
  config: McpServerConfig,
): string | undefined {
  if (typeof config.bearerTokenEnv !== "string") {
    return undefined;
  }
  const name = config.bearerTokenEnv.trim();
  return name.length > 0 ? name : undefined;
}

export const INVALID_BEARER_TOKEN_ENV =
  "Invalid bearerTokenEnv. The name cannot be empty.";

const ALL_OPTIONAL_FIELDS = Object.keys(
  OPTIONAL_FIELD_SPECS,
) as OptionalField[];

export function describeOptionalField(field: OptionalField): string {
  return OPTIONAL_FIELD_SPECS[field].label;
}

export interface FieldSupportResult {
  /** A copy of the input with unsupported optional fields removed. */
  config: McpServerConfig;
  /** Optional fields that were set but dropped because the agent lacks support. */
  dropped: OptionalField[];
}

/**
 * Produce an agent-ready copy of `config` containing only the optional fields
 * the agent supports, alongside the list of fields that were dropped.
 *
 * The input is never mutated — {@link installServerForAgent} reuses one
 * canonical config across many agents, so each agent must gate against its own
 * copy.
 */
export function applyFieldSupport(
  config: McpServerConfig,
  supportedFields: readonly OptionalField[],
): FieldSupportResult {
  const supported = new Set(supportedFields);
  const copy: McpServerConfig = { ...config };

  // Defensively clone the containers we might clear so we never touch the
  // caller's nested objects/arrays.
  if (copy.oauthScopes) copy.oauthScopes = [...copy.oauthScopes];
  if (copy.autoApproveTools) copy.autoApproveTools = [...copy.autoApproveTools];

  if (typeof copy.bearerTokenEnv === "string") {
    const name = resolvedBearerTokenEnv(copy);
    if (name) {
      copy.bearerTokenEnv = name;
    } else {
      delete copy.bearerTokenEnv;
    }
  }

  const dropped: OptionalField[] = [];
  for (const field of ALL_OPTIONAL_FIELDS) {
    const spec = OPTIONAL_FIELD_SPECS[field];
    if (spec.isSet(copy) && !supported.has(field)) {
      spec.clear(copy);
      dropped.push(field);
    }
  }

  return { config: copy, dropped };
}
