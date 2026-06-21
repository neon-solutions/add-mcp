import type { OptionalField } from "./schema.js";

export type AgentType =
  | "antigravity"
  | "cline"
  | "cline-cli"
  | "claude-code"
  | "claude-desktop"
  | "codex"
  | "cursor"
  | "gemini-cli"
  | "goose"
  | "github-copilot-cli"
  | "mcporter"
  | "opencode"
  | "vscode"
  | "windsurf"
  | "zed";

export const agentAliases: Record<string, AgentType> = {
  "cline-vscode": "cline",
  codeium: "windsurf",
  cascade: "windsurf",
  gemini: "gemini-cli",
  "github-copilot": "vscode",
};

export type ConfigFormat = "json" | "yaml" | "toml";

export interface AgentConfig {
  /** Internal name */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Global config file path */
  configPath: string;
  /** Local (project-level) config file path, if supported */
  localConfigPath?: string;
  /** Paths to check for project-level detection (relative to cwd) */
  projectDetectPaths: string[];
  /** Key in config file where MCP servers are stored (supports dot notation) */
  configKey: string;
  /** Optional key for project-level config when different from global configKey */
  localConfigKey?: string;
  /** Config file format */
  format: ConfigFormat;
  /** Supported transport types for this agent */
  supportedTransports: ("stdio" | "sse" | "http")[];
  /**
   * Optional, capability-gated server fields this agent understands (e.g.
   * `timeout`, `scopes`). Any optional field not listed here is stripped from
   * the canonical config before {@link transformConfig} runs, so a client never
   * receives a field it cannot interpret. Use an empty array for agents that
   * only support the core fields.
   */
  supportedFields: OptionalField[];
  /** Shown when a user tries to use an unsupported transport */
  unsupportedTransportMessage?: string;
  /** Function to detect if agent is installed globally */
  detectGlobalInstall: () => Promise<boolean>;
  /** Optional function to dynamically resolve config path */
  resolveConfigPath?: (
    agent: AgentConfig,
    options: { local: boolean; cwd: string },
  ) => string;
  /**
   * Transform the canonical, field-gated server config into this agent's
   * concrete on-disk schema. Required for every agent: transforms must build a
   * fresh object with only the keys the client understands, which structurally
   * guarantees no unknown fields leak into a written config.
   */
  transformConfig: (
    serverName: string,
    config: McpServerConfig,
    context?: { local: boolean },
  ) => unknown;
}

export type SourceType = "remote" | "package" | "command";

export interface ParsedSource {
  type: SourceType;
  /** For remote: the URL; for package: package name; for command: full command */
  value: string;
  /** Inferred server name */
  inferredName: string;
}

export type TransportType = "sse" | "http";

export interface McpServerConfig {
  /** For remote servers */
  type?: TransportType;
  url?: string;
  headers?: Record<string, string>;
  /** For local stdio servers */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /**
   * Request timeout in milliseconds for remote servers. Capability-gated:
   * only emitted for agents that list `"timeout"` in `supportedFields`.
   */
  timeout?: number;
  /**
   * OAuth scopes to request for remote servers. Capability-gated: only emitted
   * for agents that list `"scopes"` in `supportedFields`, each mapping it into
   * their own native shape (e.g. Cursor `auth.scopes`, Gemini `oauth.scopes`).
   */
  oauthScopes?: string[];
}

export interface ConfigFile {
  [key: string]: unknown;
}
