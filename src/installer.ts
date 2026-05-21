import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

    return config;
  }

  if (parsed.type === "command") {
    const parts = parsed.value.split(" ");
    const command = parts[0]!;
    const args = [...parts.slice(1), ...(options.args ?? [])];
    const config: McpServerConfig = {
      command,
      args,
    };

    if (options.env && Object.keys(options.env).length > 0) {
      config.env = options.env;
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

  return config;
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

    const transformedConfig = agent.transformConfig
      ? agent.transformConfig(serverName, serverConfig, {
          local: Boolean(options.local),
        })
      : serverConfig;

    const configKey = getConfigKey(agent, options);
    const config = buildConfigWithKey(configKey, serverName, transformedConfig);

    writeConfig(configPath, config, agent.format, configKey);

    return {
      success: true,
      path: configPath,
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
