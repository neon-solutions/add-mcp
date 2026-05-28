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
  /** Shown when a user tries to use an unsupported transport */
  unsupportedTransportMessage?: string;
  /** Function to detect if agent is installed globally */
  detectGlobalInstall: () => Promise<boolean>;
  /** Optional function to dynamically resolve config path */
  resolveConfigPath?: (
    agent: AgentConfig,
    options: { local: boolean; cwd: string },
  ) => string;
  /** Optional function to transform server config to agent-specific format */
  transformConfig?: (
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
  /** Alternate property name for remote server url (supported by select HTTP remote clients) */
  httpUrl?: string;
  headers?: Record<string, string>;
  /** Authentication provider type for remote connections (e.g. for enterprise proxy auth) */
  authProviderType?: string;
  /** OAuth configuration scopes for authenticated remote server connections */
  oauth?: {
    scopes: string[];
  };
  /** Timeout for server connection in milliseconds (supported by select agents) */
  timeout?: number;
  /** For local stdio servers */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}


export interface ConfigFile {
  [key: string]: unknown;
}
