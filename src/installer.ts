import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname, isAbsolute, relative, sep } from "path";
import type {
  AgentType,
  AgentConfig,
  McpServerConfig,
  ParsedSource,
  TransportType,
} from "./types.js";
import { agents } from "./agents.js";
import { writeConfig, buildConfigWithKey } from "./formats/index.js";
import { looksLikePath } from "./source-parser.js";
import { applyFieldSupport, type OptionalField } from "./schema.js";

const home = homedir();

export interface InstallOptions {
  /** Install to local (project-level) config instead of global */
  local?: boolean;
  /** Current working directory for local installs */
  cwd?: string;
}

export interface InstallServerOptions {
  /** Per-agent routing map (local vs global) */
  routing?: Map<AgentType, "local" | "global">;
  /** Current working directory for local installs */
  cwd?: string;
}

export interface InstallResult {
  success: boolean;
  path: string;
  error?: string;
  /**
   * Optional fields that were requested but dropped because the target agent
   * does not support them. Empty/undefined when nothing was dropped.
   */
  droppedFields?: OptionalField[];
  /**
   * Additional files written beyond the main config (e.g. a Claude Code
   * permissions settings file for auto-approval). Surfaced so the CLI can
   * report them and include them in `--gitignore`.
   */
  extraPaths?: string[];
}

export interface BuildServerConfigOptions {
  /** Transport type for remote servers (default: http) */
  transport?: TransportType;
  /** HTTP headers for remote servers */
  headers?: Record<string, string>;
  /** Environment variables for local stdio servers */
  env?: Record<string, string>;
  /** Extra command arguments for local stdio servers */
  args?: string[];
  /** Request timeout in milliseconds for remote servers */
  timeout?: number;
  /** OAuth scopes to request for remote servers */
  oauthScopes?: string[];
  /**
   * Tools to auto-approve for agents that support it. An empty array means
   * "all tools". Applies to remote and local servers alike.
   */
  autoApproveTools?: string[];
}

export interface UpdateGitignoreOptions {
  /** Current working directory where .gitignore lives */
  cwd?: string;
}

export interface UpdateGitignoreResult {
  path: string;
  added: string[];
}

export function buildServerConfig(
  parsed: ParsedSource,
  options: BuildServerConfigOptions = {},
): McpServerConfig {
  if (parsed.type === "remote") {
    const config: McpServerConfig = {
      type: options.transport ?? "http",
      url: parsed.value,
    };

    if (options.headers && Object.keys(options.headers).length > 0) {
      config.headers = options.headers;
    }

    if (typeof options.timeout === "number") {
      config.timeout = options.timeout;
    }

    if (options.oauthScopes && options.oauthScopes.length > 0) {
      config.oauthScopes = options.oauthScopes;
    }

    if (options.autoApproveTools) {
      config.autoApproveTools = options.autoApproveTools;
    }

    return config;
  }

  if (parsed.type === "command") {
    let command: string;
    let parsedArgs: string[];

    if (looksLikePath(parsed.value)) {
      // Path-like targets (e.g. "/Applications/My App/bin/server") are kept
      // intact as a single executable path. Spaces inside the path are not
      // treated as argument separators. Use --args to pass arguments.
      command = parsed.value;
      parsedArgs = [];
    } else {
      const parts = parsed.value.split(" ");
      command = parts[0]!;
      parsedArgs = parts.slice(1);
    }

    const args = [...parsedArgs, ...(options.args ?? [])];
    const config: McpServerConfig = {
      command,
      args,
    };

    if (options.env && Object.keys(options.env).length > 0) {
      config.env = options.env;
    }

    if (options.autoApproveTools) {
      config.autoApproveTools = options.autoApproveTools;
    }

    return config;
  }

  const config: McpServerConfig = {
    command: "npx",
    args: ["-y", parsed.value, ...(options.args ?? [])],
  };

  if (options.env && Object.keys(options.env).length > 0) {
    config.env = options.env;
  }

  if (options.autoApproveTools) {
    config.autoApproveTools = options.autoApproveTools;
  }

  return config;
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function writeJsonObject(
  filePath: string,
  value: Record<string, unknown>,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function addUniqueStrings(existing: unknown, additions: string[]): string[] {
  const values = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === "string")
    : [];
  for (const addition of additions) {
    if (!values.includes(addition)) {
      values.push(addition);
    }
  }
  return values;
}

/**
 * Claude Code permission allow rules for auto-approval. An empty `tools` list
 * means "all tools from this server" (`mcp__<server>`); otherwise each tool is
 * its own fully-qualified rule (`mcp__<server>__<tool>`).
 *
 * Note: the all-tools form (`mcp__<server>`) is the documented Claude Code
 * format, but there is a known Claude Code bug where non-fully-qualified MCP
 * rules may still prompt at runtime (anthropics/claude-code#34739). Per-tool
 * rules are the reliable path; we still emit the documented all-tools rule for
 * `--auto-approve` without specific tools.
 */
function claudeAutoApproveRules(serverName: string, tools: string[]): string[] {
  if (tools.length === 0) {
    return [`mcp__${serverName}`];
  }
  return tools.map((tool) => `mcp__${serverName}__${tool}`);
}

function getClaudeCodeSettingsPath(options: InstallOptions = {}): string {
  const local = Boolean(options.local);
  const cwd = options.cwd || process.cwd();
  // Local installs use the personal, git-ignored settings.local.json so a
  // contributor's auto-approval choices aren't committed for the whole team.
  return local
    ? join(cwd, ".claude", "settings.local.json")
    : join(home, ".claude", "settings.json");
}

interface ClaudeApprovalResult {
  success: boolean;
  path: string;
  error?: string;
}

function installClaudeCodeAutoApproval(
  serverName: string,
  tools: string[],
  options: InstallOptions = {},
): ClaudeApprovalResult {
  const settingsPath = getClaudeCodeSettingsPath(options);

  try {
    const settings = readJsonObject(settingsPath);
    const permissions =
      settings.permissions &&
      typeof settings.permissions === "object" &&
      !Array.isArray(settings.permissions)
        ? (settings.permissions as Record<string, unknown>)
        : {};

    permissions.allow = addUniqueStrings(
      permissions.allow,
      claudeAutoApproveRules(serverName, tools),
    );
    settings.permissions = permissions;
    writeJsonObject(settingsPath, settings);

    return { success: true, path: settingsPath };
  } catch (error) {
    return {
      success: false,
      path: settingsPath,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function updateGitignoreWithPaths(
  paths: string[],
  options: UpdateGitignoreOptions = {},
): UpdateGitignoreResult {
  const cwd = options.cwd || process.cwd();
  const gitignorePath = join(cwd, ".gitignore");
  const existingContent = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";

  const existingEntries = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  const entriesToAdd: string[] = [];

  for (const filePath of paths) {
    const relativePath = isAbsolute(filePath)
      ? relative(cwd, filePath)
      : filePath;
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      continue;
    }

    const normalizedPath = relativePath.split(sep).join("/");
    const cleanPath = normalizedPath.startsWith("./")
      ? normalizedPath.slice(2)
      : normalizedPath;

    if (
      !cleanPath ||
      cleanPath === ".gitignore" ||
      existingEntries.has(cleanPath)
    ) {
      continue;
    }

    existingEntries.add(cleanPath);
    entriesToAdd.push(cleanPath);
  }

  if (entriesToAdd.length > 0) {
    let nextContent = existingContent;
    if (nextContent.length > 0 && !nextContent.endsWith("\n")) {
      nextContent += "\n";
    }
    nextContent += `${entriesToAdd.join("\n")}\n`;
    writeFileSync(gitignorePath, nextContent, "utf-8");
  }

  return {
    path: gitignorePath,
    added: entriesToAdd,
  };
}

export function getConfigPath(
  agent: AgentConfig,
  options: InstallOptions = {},
): string {
  const local = Boolean(options.local);
  const cwd = options.cwd || process.cwd();

  if (agent.resolveConfigPath) {
    return agent.resolveConfigPath(agent, { local, cwd });
  }

  if (local && agent.localConfigPath) {
    return join(cwd, agent.localConfigPath);
  }

  return agent.configPath;
}

export function getConfigKey(
  agent: AgentConfig,
  options: InstallOptions = {},
): string {
  if (options.local && agent.localConfigKey) {
    return agent.localConfigKey;
  }

  return agent.configKey;
}

export function installServerForAgent(
  serverName: string,
  serverConfig: McpServerConfig,
  agentType: AgentType,
  options: InstallOptions = {},
): InstallResult {
  const agent = agents[agentType];
  const configPath = getConfigPath(agent, options);

  try {
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Strip optional fields the agent can't represent, then transform the
    // gated config into the agent's native schema. Because every transform
    // builds a fresh object with only known keys, unsupported fields can never
    // leak into the written config.
    const { config: gatedConfig, dropped } = applyFieldSupport(
      serverConfig,
      agent.supportedFields,
    );

    const transformedConfig = agent.transformConfig(serverName, gatedConfig, {
      local: Boolean(options.local),
    });

    const configKey = getConfigKey(agent, options);
    const config = buildConfigWithKey(configKey, serverName, transformedConfig);

    writeConfig(configPath, config, agent.format, configKey);

    // Claude Code expresses auto-approval as permission rules in a separate
    // settings file rather than inside the MCP server entry, so apply it as a
    // side-effect once the (clean) server config is written.
    const extraPaths: string[] = [];
    if (agentType === "claude-code" && gatedConfig.autoApproveTools) {
      const approval = installClaudeCodeAutoApproval(
        serverName,
        gatedConfig.autoApproveTools,
        options,
      );
      if (!approval.success) {
        return {
          success: false,
          path: approval.path,
          error: approval.error,
        };
      }
      extraPaths.push(approval.path);
    }

    return {
      success: true,
      path: configPath,
      ...(dropped.length > 0 ? { droppedFields: dropped } : {}),
      ...(extraPaths.length > 0 ? { extraPaths } : {}),
    };
  } catch (error) {
    return {
      success: false,
      path: configPath,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function installServer(
  serverName: string,
  serverConfig: McpServerConfig,
  agentTypes: AgentType[],
  options: InstallServerOptions = {},
): Map<AgentType, InstallResult> {
  const results = new Map<AgentType, InstallResult>();

  for (const agentType of agentTypes) {
    const routing = options.routing?.get(agentType);
    const installOptions: InstallOptions = {
      local: routing === "local",
      cwd: options.cwd,
    };

    const result = installServerForAgent(
      serverName,
      serverConfig,
      agentType,
      installOptions,
    );
    results.set(agentType, result);
  }

  return results;
}
