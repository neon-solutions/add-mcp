import { existsSync } from "fs";
import type { AgentType, McpServerConfig } from "./types.js";
import { agents } from "./agents.js";
import {
  getConfigPath,
  getConfigKey,
  installServerForAgent,
  type InstallOptions,
  type InstallResult,
} from "./installer.js";
import {
  readConfig,
  removeServerFromConfig,
  getNestedValue,
} from "./formats/index.js";

export {
  agents,
  detectProjectAgents,
  detectGlobalAgents,
  getAgentTypes,
} from "./agents.js";

export {
  type InstallOptions,
  type InstallResult,
} from "./installer.js";

export {
  listInstalledServers,
  type AgentServers,
  type InstalledServer,
} from "./reader.js";

export type { AgentType, AgentConfig, McpServerConfig } from "./types.js";

// AgentType plus any string; validated at runtime. The `string & {}` keeps
// TypeScript autocomplete on AgentType literals without widening to `string`.
export type AgentInput = AgentType | (string & {});

function isKnownAgent(agentType: string): agentType is AgentType {
  return Object.prototype.hasOwnProperty.call(agents, agentType);
}

function validate(agentType: AgentInput, local: boolean): string | null {
  if (!isKnownAgent(agentType)) {
    return `Unknown agent type: ${String(agentType)}`;
  }
  if (local && !agents[agentType].localConfigPath) {
    return `${agentType} does not support project-level config`;
  }
  return null;
}

// Default to project-level (local) installs so the programmatic API matches
// the CLI, where global is the opt-in (`-g`). Callers can still pass
// `{ local: false }` to write the global config explicitly.
function withDefaults(options: InstallOptions): InstallOptions {
  return { ...options, local: options.local ?? true };
}

export function upsertServer(
  agentType: AgentInput,
  serverName: string,
  serverConfig: McpServerConfig,
  options: InstallOptions = {},
): InstallResult {
  const resolved = withDefaults(options);
  const error = validate(agentType, resolved.local === true);
  if (error) return { success: false, path: "", error };
  return installServerForAgent(
    serverName,
    serverConfig,
    agentType as AgentType,
    resolved,
  );
}

export interface RemoveServerResult {
  success: boolean;
  path: string;
  removed: boolean;
  error?: string;
}

function hasServer(serversObj: unknown, serverName: string): boolean {
  return (
    !!serversObj &&
    typeof serversObj === "object" &&
    !Array.isArray(serversObj) &&
    Object.prototype.hasOwnProperty.call(serversObj, serverName)
  );
}

function doRemove(
  agentType: AgentType,
  serverName: string,
  options: InstallOptions,
): RemoveServerResult {
  const agent = agents[agentType];
  const configPath = getConfigPath(agent, options);
  const configKey = getConfigKey(agent, options);

  if (!existsSync(configPath)) {
    return { success: true, path: configPath, removed: false };
  }

  const fullConfig = readConfig(configPath, agent.format);
  if (!hasServer(getNestedValue(fullConfig, configKey), serverName)) {
    return { success: true, path: configPath, removed: false };
  }

  removeServerFromConfig(configPath, agent.format, configKey, serverName);
  return { success: true, path: configPath, removed: true };
}

export function removeServer(
  agentType: AgentInput,
  serverName: string,
  options: InstallOptions = {},
): RemoveServerResult {
  const resolved = withDefaults(options);
  const error = validate(agentType, resolved.local === true);
  if (error) return { success: false, path: "", removed: false, error };
  const known = agentType as AgentType;
  try {
    return doRemove(known, serverName, resolved);
  } catch (e) {
    return {
      success: false,
      path: getConfigPath(agents[known], resolved),
      removed: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
