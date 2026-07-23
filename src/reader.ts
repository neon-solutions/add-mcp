import type { AgentType, ConfigFile } from "./types.js";
import { agents, detectProjectAgents, detectGlobalAgents } from "./agents.js";
import {
  getConfigPath,
  getConfigKey,
  type InstallOptions,
} from "./installer.js";
import { readConfig, getNestedValue } from "./formats/index.js";

export interface InstalledServer {
  serverName: string;
  config: Record<string, unknown>;
  identity: string;
  agentType: AgentType;
  scope: "local" | "global";
  configPath: string;
}

export interface AgentServers {
  agentType: AgentType;
  displayName: string;
  detected: boolean;
  scope: "local" | "global";
  configPath: string;
  servers: InstalledServer[];
}

/**
 * Extract a server's identity (URL or package name) from any agent-specific
 * config shape. Returns the URL for remote servers or the package/command
 * string for stdio servers.
 */
export function extractServerIdentity(
  serverConfig: Record<string, unknown>,
): string {
  // Remote: Gemini CLI gives legacy httpUrl priority when both URL fields exist.
  for (const key of ["httpUrl", "url", "uri", "serverUrl"]) {
    const value = serverConfig[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  // Stdio: reconstruct from command/cmd + args
  const command =
    typeof serverConfig.command === "string"
      ? serverConfig.command
      : typeof serverConfig.cmd === "string"
        ? serverConfig.cmd
        : undefined;

  if (!command) {
    return "";
  }

  const rawArgs = Array.isArray(serverConfig.args)
    ? serverConfig.args.filter((a): a is string => typeof a === "string")
    : Array.isArray(serverConfig.command)
      ? (serverConfig.command as unknown[])
          .slice(1)
          .filter((a): a is string => typeof a === "string")
      : [];

  // Detect npx -y <package> pattern
  if (command === "npx" || command === "bunx") {
    const yIndex = rawArgs.indexOf("-y");
    const pkgIndex = yIndex >= 0 ? yIndex + 1 : 0;
    const pkg = rawArgs[pkgIndex];
    if (pkg && !pkg.startsWith("-")) {
      return pkg;
    }
  }

  // OpenCode uses command as array: ["node", "server.js"]
  if (Array.isArray(serverConfig.command)) {
    return (serverConfig.command as string[]).join(" ");
  }

  if (rawArgs.length > 0) {
    return `${command} ${rawArgs.join(" ")}`;
  }

  return command;
}

/**
 * Read all installed MCP servers for a single agent.
 */
export function readServersForAgent(
  agentType: AgentType,
  options: { scope: "local" | "global"; cwd?: string },
): AgentServers {
  const agent = agents[agentType];
  const installOptions: InstallOptions = {
    local: options.scope === "local",
    cwd: options.cwd,
  };
  const configPath = getConfigPath(agent, installOptions);
  const configKey = getConfigKey(agent, installOptions);

  const fullConfig = readConfig(configPath, agent.format);
  const serversObj = getNestedValue(fullConfig, configKey);

  const servers: InstalledServer[] = [];

  if (
    serversObj &&
    typeof serversObj === "object" &&
    !Array.isArray(serversObj)
  ) {
    for (const [serverName, serverConfig] of Object.entries(serversObj)) {
      if (serverConfig && typeof serverConfig === "object") {
        const config = serverConfig as Record<string, unknown>;
        servers.push({
          serverName,
          config,
          identity: extractServerIdentity(config),
          agentType,
          scope: options.scope,
          configPath,
        });
      }
    }
  }

  return {
    agentType,
    displayName: agent.displayName,
    detected: true,
    scope: options.scope,
    configPath,
    servers,
  };
}

/**
 * Gather installed servers across detected (or explicitly specified) agents.
 * When `agents` is provided, those agents are included even if not detected
 * (with detected=false).
 */
export async function listInstalledServers(options: {
  global?: boolean;
  agents?: AgentType[];
  cwd?: string;
}): Promise<AgentServers[]> {
  const scope: "local" | "global" = options.global ? "global" : "local";
  const results: AgentServers[] = [];

  if (options.agents && options.agents.length > 0) {
    // Explicit agent list: include even if not detected
    const detectedSet = new Set<AgentType>(
      options.global
        ? await detectGlobalAgents()
        : detectProjectAgents(options.cwd),
    );

    for (const agentType of options.agents) {
      const detected = detectedSet.has(agentType);
      if (detected) {
        results.push(
          readServersForAgent(agentType, { scope, cwd: options.cwd }),
        );
      } else {
        const agent = agents[agentType];
        const installOptions: InstallOptions = {
          local: scope === "local",
          cwd: options.cwd,
        };
        results.push({
          agentType,
          displayName: agent.displayName,
          detected: false,
          scope,
          configPath: getConfigPath(agent, installOptions),
          servers: [],
        });
      }
    }
  } else {
    // Auto-detect
    const detected = options.global
      ? await detectGlobalAgents()
      : detectProjectAgents(options.cwd);

    for (const agentType of detected) {
      results.push(readServersForAgent(agentType, { scope, cwd: options.cwd }));
    }
  }

  return results;
}

/**
 * Find servers matching a query string by server name (case-insensitive
 * substring), identity URL, or package name (exact match).
 */
export function findMatchingServers(
  agentServersList: AgentServers[],
  query: string,
): InstalledServer[] {
  const lowerQuery = query.toLowerCase();
  const matches: InstalledServer[] = [];

  for (const agentServers of agentServersList) {
    for (const server of agentServers.servers) {
      const nameMatch = server.serverName.toLowerCase().includes(lowerQuery);
      const identityMatch = server.identity === query;
      if (nameMatch || identityMatch) {
        matches.push(server);
      }
    }
  }

  return matches;
}
