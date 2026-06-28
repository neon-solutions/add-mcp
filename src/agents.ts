import * as p from "@clack/prompts";
import { homedir } from "os";
import { dirname, join } from "path";
import { existsSync } from "fs";
import type { AgentConfig, AgentType, McpServerConfig } from "./types.js";
import { getLastSelectedAgents, saveSelectedAgents } from "./config.js";

const home = homedir();

function shortenPath(fullPath: string): string {
  if (fullPath.startsWith(home)) {
    return fullPath.replace(home, "~");
  }
  return fullPath;
}

function getPlatformPaths() {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return {
      appSupport: appData,
      vscodePath: join(appData, "Code", "User"),
      gooseConfigPath: join(appData, "Block", "goose", "config", "config.yaml"),
    };
  } else if (platform === "darwin") {
    return {
      appSupport: join(home, "Library", "Application Support"),
      vscodePath: join(home, "Library", "Application Support", "Code", "User"),
      gooseConfigPath: join(home, ".config", "goose", "config.yaml"),
    };
  } else {
    // Linux
    const configDir = process.env.XDG_CONFIG_HOME || join(home, ".config");
    return {
      appSupport: configDir,
      vscodePath: join(configDir, "Code", "User"),
      gooseConfigPath: join(configDir, "goose", "config.yaml"),
    };
  }
}

const { appSupport, vscodePath, gooseConfigPath } = getPlatformPaths();
const antigravityConfigPath = join(
  home,
  ".gemini",
  "antigravity",
  "mcp_config.json",
);
const antigravityIdeConfigPath = join(
  home,
  ".gemini",
  "antigravity-ide",
  "mcp_config.json",
);
const antigravityCliConfigPath = join(
  home,
  ".gemini",
  "antigravity-cli",
  "mcp_config.json",
);
const clineCliConfigPath = join(
  process.env.CLINE_DIR || join(home, ".cline"),
  "data",
  "settings",
  "cline_mcp_settings.json",
);
const clineExtensionConfigPath = join(
  vscodePath,
  "globalStorage",
  "saoudrizwan.claude-dev",
  "settings",
  "cline_mcp_settings.json",
);
const copilotConfigPath = join(
  process.env.XDG_CONFIG_HOME || join(home, ".copilot"),
  "mcp-config.json",
);
const windsurfConfigPath = join(
  home,
  ".codeium",
  "windsurf",
  "mcp_config.json",
);

/**
 * Build the spec-aligned remote shape shared by clients that consume MCP
 * servers more or less verbatim (`{ type?, url, headers?, timeout? }`). Only
 * keys with meaningful values are emitted so nothing unknown leaks through.
 */
function buildStandardRemote(config: McpServerConfig): Record<string, unknown> {
  const remote: Record<string, unknown> = {};
  if (config.type) remote.type = config.type;
  if (config.url) remote.url = config.url;
  if (config.headers && Object.keys(config.headers).length > 0) {
    remote.headers = config.headers;
  }
  if (typeof config.timeout === "number") {
    remote.timeout = config.timeout;
  }
  return remote;
}

/** Build the standard local (stdio) shape: `{ command, args, env? }`. */
function buildStandardLocal(config: McpServerConfig): Record<string, unknown> {
  const local: Record<string, unknown> = {
    command: config.command,
    args: config.args || [],
  };
  if (config.env && Object.keys(config.env).length > 0) {
    local.env = config.env;
  }
  return local;
}

/**
 * Default transform for spec-aligned clients (Claude Code, Claude Desktop, VS
 * Code). Builds a fresh object with only known keys, so unsupported optional
 * fields can never leak even though these clients otherwise mirror the schema.
 */
function transformStandardConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  return config.url ? buildStandardRemote(config) : buildStandardLocal(config);
}

/**
 * Gemini CLI mirrors the standard shape but nests OAuth scopes under an
 * `oauth.scopes` array (its documented location for remote auth scopes).
 */
function transformGeminiConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (!config.url) {
    return buildStandardLocal(config);
  }

  const remote = buildStandardRemote(config);
  if (config.oauthScopes && config.oauthScopes.length > 0) {
    remote.oauth = { scopes: config.oauthScopes };
  }
  return remote;
}

function transformGooseConfig(
  serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    const gooseType = config.type === "sse" ? "sse" : "streamable_http";
    return {
      name: serverName,
      description: "",
      type: gooseType,
      uri: config.url,
      headers: config.headers || {},
      enabled: true,
      timeout: 300,
    };
  }

  return {
    name: serverName,
    description: "",
    cmd: config.command,
    args: config.args || [],
    enabled: true,
    envs: config.env || {},
    type: "stdio",
    timeout: 300,
  };
}

function transformZedConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    return {
      source: "custom",
      type: config.type || "http",
      url: config.url,
      headers: config.headers || {},
    };
  }

  return {
    source: "custom",
    command: config.command,
    args: config.args || [],
    env: config.env || {},
  };
}

function transformOpenCodeConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    return {
      type: "remote",
      url: config.url,
      enabled: true,
      headers: config.headers,
    };
  }

  return {
    type: "local",
    command: [config.command, ...(config.args || [])],
    enabled: true,
    environment: config.env || {},
  };
}

/**
 * Apply Codex MCP approval config to a server table. Codex resolves approval
 * per-tool first, then falls back to the server-level default:
 *   - all tools  -> `default_tools_approval_mode = "approve"`
 *   - some tools -> `tools.<name>.approval_mode = "approve"`
 * See https://developers.openai.com/codex/mcp.
 */
function applyCodexApproval(
  target: Record<string, unknown>,
  autoApproveTools: string[] | undefined,
): Record<string, unknown> {
  if (!autoApproveTools) return target;

  if (autoApproveTools.length === 0) {
    target.default_tools_approval_mode = "approve";
    return target;
  }

  target.tools = Object.fromEntries(
    autoApproveTools.map((tool) => [tool, { approval_mode: "approve" }]),
  );
  return target;
}

function transformCodexConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    const remoteConfig: Record<string, unknown> = {
      type: config.type || "http",
      url: config.url,
    };

    if (config.headers && Object.keys(config.headers).length > 0) {
      remoteConfig.http_headers = config.headers;
    }

    return applyCodexApproval(remoteConfig, config.autoApproveTools);
  }

  return applyCodexApproval(
    {
      command: config.command,
      args: config.args || [],
      env: config.env,
    },
    config.autoApproveTools,
  );
}

function transformCursorConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    const remoteConfig: Record<string, unknown> = {
      url: config.url,
    };

    if (config.headers && Object.keys(config.headers).length > 0) {
      remoteConfig.headers = config.headers;
    }

    if (config.oauthScopes && config.oauthScopes.length > 0) {
      remoteConfig.auth = { scopes: config.oauthScopes };
    }

    return remoteConfig;
  }

  return buildStandardLocal(config);
}

function transformClineConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    const remoteConfig: Record<string, unknown> = {
      url: config.url,
      type: config.type === "sse" ? "sse" : "streamableHttp",
      disabled: false,
    };

    if (config.headers && Object.keys(config.headers).length > 0) {
      remoteConfig.headers = config.headers;
    }

    return remoteConfig;
  }

  const localConfig: Record<string, unknown> = {
    command: config.command,
    args: config.args || [],
    disabled: false,
  };

  if (config.env && Object.keys(config.env).length > 0) {
    localConfig.env = config.env;
  }

  return localConfig;
}

function transformAntigravityConfig(
  _serverName: string,
  config: McpServerConfig,
): unknown {
  if (config.url) {
    const remoteConfig: Record<string, unknown> = {
      serverUrl: config.url,
    };

    if (config.headers && Object.keys(config.headers).length > 0) {
      remoteConfig.headers = config.headers;
    }

    return remoteConfig;
  }

  const localConfig: Record<string, unknown> = {
    command: config.command,
    args: config.args || [],
  };

  if (config.env && Object.keys(config.env).length > 0) {
    localConfig.env = config.env;
  }

  return localConfig;
}

function transformGitHubCopilotCliConfig(
  _serverName: string,
  config: McpServerConfig,
  context?: { local: boolean },
): unknown {
  // Project-level config shares VS Code mcp.json schema.
  if (context?.local) {
    return config;
  }

  if (config.url) {
    const remoteConfig: Record<string, unknown> = {
      type: config.type || "http",
      url: config.url,
      tools: ["*"],
    };

    if (config.headers && Object.keys(config.headers).length > 0) {
      remoteConfig.headers = config.headers;
    }

    return remoteConfig;
  }

  const localConfig: Record<string, unknown> = {
    type: "stdio",
    command: config.command,
    args: config.args || [],
    tools: ["*"],
  };

  if (config.env && Object.keys(config.env).length > 0) {
    localConfig.env = config.env;
  }

  return localConfig;
}

function resolveMcporterConfigPath(
  agent: AgentConfig,
  options: { local: boolean; cwd: string },
): string {
  if (options.local && agent.localConfigPath) {
    return join(options.cwd, agent.localConfigPath);
  }

  const globalJsonPath = agent.configPath;
  const globalJsoncPath = join(dirname(globalJsonPath), "mcporter.jsonc");

  if (existsSync(globalJsonPath)) {
    return globalJsonPath;
  }
  if (existsSync(globalJsoncPath)) {
    return globalJsoncPath;
  }
  return globalJsonPath;
}

export const agents: Record<AgentType, AgentConfig> = {
  antigravity: {
    name: "antigravity",
    displayName: "Antigravity",
    configPath: antigravityConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".gemini", "antigravity"));
    },
    transformConfig: transformAntigravityConfig,
  },

  "antigravity-ide": {
    name: "antigravity-ide",
    displayName: "Antigravity IDE",
    configPath: antigravityIdeConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".gemini", "antigravity-ide"));
    },
    transformConfig: transformAntigravityConfig,
  },

  "antigravity-cli": {
    name: "antigravity-cli",
    displayName: "Antigravity CLI",
    configPath: antigravityCliConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".gemini", "antigravity-cli"));
    },
    transformConfig: transformAntigravityConfig,
  },

  cline: {
    name: "cline",
    displayName: "Cline VSCode Extension",
    configPath: clineExtensionConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(dirname(clineExtensionConfigPath));
    },
    transformConfig: transformClineConfig,
  },

  "cline-cli": {
    name: "cline-cli",
    displayName: "Cline CLI",
    configPath: clineCliConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(dirname(clineCliConfigPath));
    },
    transformConfig: transformClineConfig,
  },

  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    configPath: join(home, ".claude.json"),
    localConfigPath: ".mcp.json",
    projectDetectPaths: [".mcp.json", ".claude"],
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: ["timeout", "autoApprove"],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".claude"));
    },
    transformConfig: transformStandardConfig,
  },

  "claude-desktop": {
    name: "claude-desktop",
    displayName: "Claude Desktop",
    configPath: join(appSupport, "Claude", "claude_desktop_config.json"),
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio"],
    supportedFields: [],
    unsupportedTransportMessage:
      "Claude Desktop only supports local (stdio) servers via its config file. Add remote servers through Settings → Connectors in the app instead.",
    detectGlobalInstall: async () => {
      return existsSync(join(appSupport, "Claude"));
    },
    transformConfig: transformStandardConfig,
  },

  codex: {
    name: "codex",
    displayName: "Codex",
    configPath: join(
      process.env.CODEX_HOME || join(home, ".codex"),
      "config.toml",
    ),
    localConfigPath: ".codex/config.toml",
    projectDetectPaths: [".codex"],
    configKey: "mcp_servers",
    format: "toml",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: ["autoApprove"],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".codex"));
    },
    transformConfig: transformCodexConfig,
  },

  cursor: {
    name: "cursor",
    displayName: "Cursor",
    configPath: join(home, ".cursor", "mcp.json"),
    localConfigPath: ".cursor/mcp.json",
    projectDetectPaths: [".cursor"],
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: ["scopes"],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".cursor"));
    },
    transformConfig: transformCursorConfig,
  },

  "gemini-cli": {
    name: "gemini-cli",
    displayName: "Gemini CLI",
    configPath: join(home, ".gemini", "settings.json"),
    localConfigPath: ".gemini/settings.json",
    projectDetectPaths: [".gemini"],
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: ["timeout", "scopes"],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".gemini"));
    },
    transformConfig: transformGeminiConfig,
  },

  goose: {
    name: "goose",
    displayName: "Goose",
    configPath: gooseConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "extensions",
    format: "yaml",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(gooseConfigPath);
    },
    transformConfig: transformGooseConfig,
  },

  "github-copilot-cli": {
    name: "github-copilot-cli",
    displayName: "GitHub Copilot CLI",
    configPath: copilotConfigPath,
    localConfigPath: ".vscode/mcp.json",
    projectDetectPaths: [".vscode"],
    configKey: "mcpServers",
    localConfigKey: "servers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(dirname(copilotConfigPath));
    },
    transformConfig: transformGitHubCopilotCliConfig,
  },

  mcporter: {
    name: "mcporter",
    displayName: "MCPorter",
    configPath: join(home, ".mcporter", "mcporter.json"),
    localConfigPath: "config/mcporter.json",
    projectDetectPaths: ["config/mcporter.json"],
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".mcporter"));
    },
    resolveConfigPath: resolveMcporterConfigPath,
    transformConfig: transformStandardConfig,
  },

  opencode: {
    name: "opencode",
    displayName: "OpenCode",
    configPath: join(home, ".config", "opencode", "opencode.json"),
    localConfigPath: "opencode.json",
    projectDetectPaths: ["opencode.json", ".opencode"],
    configKey: "mcp",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".config", "opencode"));
    },
    transformConfig: transformOpenCodeConfig,
  },

  vscode: {
    name: "vscode",
    displayName: "VS Code",
    configPath: join(vscodePath, "mcp.json"),
    localConfigPath: ".vscode/mcp.json",
    projectDetectPaths: [".vscode"],
    configKey: "servers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(vscodePath);
    },
    transformConfig: transformStandardConfig,
  },

  windsurf: {
    name: "windsurf",
    displayName: "Windsurf",
    configPath: windsurfConfigPath,
    projectDetectPaths: [], // Global only - no project support
    configKey: "mcpServers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      return existsSync(join(home, ".codeium", "windsurf"));
    },
    transformConfig: transformAntigravityConfig,
  },

  zed: {
    name: "zed",
    displayName: "Zed",
    configPath:
      process.platform === "darwin" || process.platform === "win32"
        ? join(appSupport, "Zed", "settings.json")
        : join(appSupport, "zed", "settings.json"),
    localConfigPath: ".zed/settings.json",
    projectDetectPaths: [".zed"],
    configKey: "context_servers",
    format: "json",
    supportedTransports: ["stdio", "http", "sse"],
    supportedFields: [],
    detectGlobalInstall: async () => {
      const configDir =
        process.platform === "darwin" || process.platform === "win32"
          ? join(appSupport, "Zed")
          : join(appSupport, "zed");
      return existsSync(configDir);
    },
    transformConfig: transformZedConfig,
  },
};

export function getAgentTypes(): AgentType[] {
  return Object.keys(agents) as AgentType[];
}

export function supportsProjectConfig(agentType: AgentType): boolean {
  return agents[agentType].localConfigPath !== undefined;
}

export function getProjectCapableAgents(): AgentType[] {
  return (Object.keys(agents) as AgentType[]).filter((type) =>
    supportsProjectConfig(type),
  );
}

export function getGlobalOnlyAgents(): AgentType[] {
  return (Object.keys(agents) as AgentType[]).filter(
    (type) => !supportsProjectConfig(type),
  );
}

export function detectProjectAgents(cwd?: string): AgentType[] {
  const dir = cwd || process.cwd();
  const detected: AgentType[] = [];

  for (const [type, config] of Object.entries(agents)) {
    if (!config.localConfigPath) continue;

    for (const detectPath of config.projectDetectPaths) {
      if (existsSync(join(dir, detectPath))) {
        detected.push(type as AgentType);
        break;
      }
    }
  }

  return detected;
}

export async function detectGlobalAgents(): Promise<AgentType[]> {
  const detected: AgentType[] = [];

  for (const [type, config] of Object.entries(agents)) {
    if (await config.detectGlobalInstall()) {
      detected.push(type as AgentType);
    }
  }

  return detected;
}

export function isTransportSupported(
  agentType: AgentType,
  transport: "stdio" | "sse" | "http",
): boolean {
  return agents[agentType].supportedTransports.includes(transport);
}

export function buildAgentSelectionChoices(options: {
  availableAgents: AgentType[];
  detectedAgents: AgentType[];
  agentRouting: Map<AgentType, "local" | "global">;
  lastSelected?: string[];
}): {
  choices: Array<{ value: AgentType; label: string; hint: string }>;
  initialValues: AgentType[];
} {
  const { availableAgents, detectedAgents, agentRouting, lastSelected } =
    options;
  const detectedSet = new Set(detectedAgents);
  const validLastSelected =
    lastSelected?.filter(
      (agent) =>
        availableAgents.includes(agent as AgentType) &&
        !detectedSet.has(agent as AgentType),
    ) ?? [];

  const remainingAgents = availableAgents.filter(
    (agent) =>
      !detectedSet.has(agent) &&
      !validLastSelected.includes(agent as AgentType),
  );

  const orderedAgents = [
    ...detectedAgents,
    ...(validLastSelected as AgentType[]),
    ...remainingAgents,
  ];

  const choices = orderedAgents.map((agentType) => {
    const routing = agentRouting.get(agentType);
    const baseHint =
      routing === "local"
        ? "project"
        : routing === "global"
          ? "global"
          : shortenPath(agents[agentType].configPath);
    const lastSelectedHint = validLastSelected.includes(agentType)
      ? "selected last time"
      : "";
    const hint = lastSelectedHint
      ? `${baseHint} · ${lastSelectedHint}`
      : baseHint;
    return {
      value: agentType,
      label: agents[agentType].displayName,
      hint,
    };
  });

  return { choices, initialValues: detectedAgents };
}

export async function promptForAgents(
  message: string,
  choices: Array<{ value: AgentType; label: string; hint?: string }>,
  defaultToAll: boolean = false,
): Promise<AgentType[] | symbol> {
  let lastSelected: string[] | undefined;
  try {
    lastSelected = await getLastSelectedAgents();
  } catch {
    // Ignore lock read errors
  }

  const validAgents = choices.map((c) => c.value);
  let initialValues: AgentType[];

  if (lastSelected && lastSelected.length > 0) {
    initialValues = lastSelected.filter((a) =>
      validAgents.includes(a as AgentType),
    ) as AgentType[];

    if (initialValues.length === 0 && defaultToAll) {
      initialValues = validAgents;
    }
  } else {
    initialValues = defaultToAll ? validAgents : [];
  }

  const selected = await p.multiselect({
    message,
    options: choices,
    required: true,
    initialValues,
  });

  if (!p.isCancel(selected)) {
    try {
      await saveSelectedAgents(selected as string[]);
    } catch {
      // Ignore lock write errors
    }
  }

  return selected as AgentType[] | symbol;
}

export async function selectAgentsInteractive(
  availableAgents: AgentType[],
  options: { global?: boolean },
): Promise<AgentType[] | symbol> {
  let lastSelected: string[] | undefined;
  try {
    lastSelected = await getLastSelectedAgents();
  } catch {
    // Ignore lock read errors
  }

  const validLastSelected = lastSelected?.filter((a) =>
    availableAgents.includes(a as AgentType),
  ) as AgentType[] | undefined;

  const selectOptions: Array<{ value: string; label: string; hint: string }> =
    [];
  const hasPrevious = validLastSelected && validLastSelected.length > 0;

  if (hasPrevious) {
    const agentNames = validLastSelected
      .map((a) => agents[a].displayName)
      .join(", ");
    selectOptions.push({
      value: "previous",
      label: "Same as last time",
      hint: agentNames,
    });
  }

  selectOptions.push({
    value: "all",
    label: hasPrevious ? "All available agents" : "All available agents",
    hint: `Install to all ${availableAgents.length} available agents`,
  });

  selectOptions.push({
    value: "select",
    label: "Select specific agents",
    hint: "Choose which agents to install to",
  });

  const installChoice = await p.select({
    message: "Install to",
    options: selectOptions,
  });

  if (p.isCancel(installChoice)) {
    return installChoice;
  }

  if (installChoice === "all") {
    return availableAgents;
  }

  if (installChoice === "previous" && validLastSelected) {
    return validLastSelected;
  }

  const agentChoices = availableAgents.map((agentType) => {
    const localPath = agents[agentType].localConfigPath;
    const hint = options.global
      ? shortenPath(agents[agentType].configPath)
      : (localPath ?? shortenPath(agents[agentType].configPath));
    return {
      value: agentType,
      label: agents[agentType].displayName,
      hint,
    };
  });

  return promptForAgents("Select agents to install to", agentChoices, false);
}
