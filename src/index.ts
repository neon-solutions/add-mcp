#!/usr/bin/env node

import { program } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { homedir } from "os";
import type { AgentType, TransportType } from "./types.js";
import { agentAliases } from "./types.js";
import {
  agents,
  getAgentTypes,
  isTransportSupported,
  detectProjectAgents,
  detectGlobalAgents,
  supportsProjectConfig,
  getCommonInstallScopes,
  getProjectCapableAgents,
  buildAgentSelectionChoices,
  selectAgentsInteractive,
  type InstallScope,
} from "./agents.js";
import {
  getFindRegistries,
  getLastSelectedAgents,
  getConfigPath,
  saveFindRegistries,
} from "./config.js";
import { parseSource, isRemoteSource } from "./source-parser.js";
import {
  getDefaultFindRegistries,
  runFind,
  type FindRegistrySearchConfig,
} from "./find.js";
import {
  buildServerConfig,
  installServer,
  installServerForAgent,
  updateGitignoreWithPaths,
} from "./installer.js";
import {
  listInstalledServers,
  findMatchingServers,
  extractServerIdentity,
  normalizeStoredCommand,
  type AgentServers,
  type InstalledServer,
} from "./reader.js";
import { removeServerFromConfig } from "./formats/index.js";
import {
  hasTemplateVars,
  resolveArrayTemplates,
  resolveRecordTemplates,
} from "./template.js";
import { describeOptionalField, type OptionalField } from "./schema.js";

import packageJson from "../package.json" with { type: "json" };

const version = packageJson.version;

// ANSI color codes
const RESET = "\x1b[0m";
const DIM = "\x1b[38;5;102m";
const TEXT = "\x1b[38;5;145m";

// ASCII art logo for ADD-MCP
const LOGO_LINES = [
  " █████╗ ██████╗ ██████╗       ███╗   ███╗ ██████╗██████╗ ",
  "██╔══██╗██╔══██╗██╔══██╗      ████╗ ████║██╔════╝██╔══██╗",
  "███████║██║  ██║██║  ██║█████╗██╔████╔██║██║     ██████╔╝",
  "██╔══██║██║  ██║██║  ██║╚════╝██║╚██╔╝██║██║     ██╔═══╝ ",
  "██║  ██║██████╔╝██████╔╝      ██║ ╚═╝ ██║╚██████╗██║     ",
  "╚═╝  ╚═╝╚═════╝ ╚═════╝       ╚═╝     ╚═╝ ╚═════╝╚═╝     ",
];

// Gradient grays for logo
const GRAYS = [
  "\x1b[38;5;250m",
  "\x1b[38;5;248m",
  "\x1b[38;5;245m",
  "\x1b[38;5;243m",
  "\x1b[38;5;240m",
  "\x1b[38;5;238m",
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${DIM}Add MCP servers to your favorite coding agents${RESET}`);
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url>${RESET}              ${DIM}Install remote MCP server${RESET}`,
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<package>${RESET}          ${DIM}Install npm package${RESET}`,
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url> ${TEXT}-g${RESET}            ${DIM}Install globally${RESET}`,
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url> ${TEXT}-a cursor${RESET}    ${DIM}Install to specific agent${RESET}`,
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx add-mcp find ${DIM}<keyword>${RESET}     ${DIM}Search integrations.sh MCP servers${RESET}`,
  );
  console.log();
  console.log(
    `${DIM}Supports:${RESET} Claude Code, Cursor, VS Code, OpenCode, and more`,
  );
  console.log();
  console.log(
    `${DIM}Learn more at${RESET} ${TEXT}https://github.com/neondatabase/add-mcp${RESET}`,
  );
  console.log();
}

/**
 * Shorten a path for display (replace home with ~)
 */
function shortenPath(fullPath: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return fullPath.replace(home, "~");
  }
  return fullPath;
}

/**
 * Resolve agent aliases to canonical types
 */
function resolveAgentType(input: string): AgentType | null {
  const lower = input.toLowerCase();

  // Check if it's a direct agent type
  if (lower in agents) {
    return lower as AgentType;
  }

  // Check aliases
  if (lower in agentAliases) {
    return agentAliases[lower]!;
  }

  return null;
}

interface Options {
  global?: boolean;
  agent?: string[];
  name?: string;
  transport?: string;
  type?: string;
  header?: string[];
  env?: string[];
  args?: string[];
  timeout?: string;
  scopes?: string;
  oauthScopes?: string;
  autoApprove?: boolean;
  approveTool?: string[];
  bearerTokenEnv?: string;
  yes?: boolean;
  all?: boolean;
  gitignore?: boolean;
}

async function ensureFindRegistriesConfigured(): Promise<
  FindRegistrySearchConfig[] | null
> {
  const configured = await getFindRegistries();
  if (configured.length > 0) {
    return configured;
  }

  const defaultRegistry = getDefaultFindRegistries()[0];
  if (!defaultRegistry) {
    throw new Error("No default find registry is configured");
  }

  const selectedRegistries = [defaultRegistry];
  await saveFindRegistries(selectedRegistries);
  p.log.info(
    `Using ${defaultRegistry.label ?? defaultRegistry.url}. Saved to ${shortenPath(getConfigPath())} - you can remove or update it any time.`,
  );
  return selectedRegistries;
}

function extractOptions(
  raw: Options | { opts: () => Options; optsWithGlobals?: () => Options },
): Options {
  if (
    typeof (raw as { optsWithGlobals?: unknown }).optsWithGlobals === "function"
  ) {
    return (raw as { optsWithGlobals: () => Options }).optsWithGlobals();
  }
  if (typeof (raw as { opts?: unknown }).opts === "function") {
    return (raw as { opts: () => Options }).opts();
  }
  return raw as Options;
}

/**
 * Commander does not reliably route flags like -a, -y, -g to subcommands
 * when the parent program also defines them. This function re-parses
 * process.argv to extract shared option values regardless of which
 * Commander level consumed them.
 */
function extractSubcommandOptionsFromArgv(): Partial<Options> {
  const argv = process.argv.slice(2);
  const result: Partial<Options> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "-y" || arg === "--yes") {
      result.yes = true;
      continue;
    }
    if (arg === "-g" || arg === "--global") {
      result.global = true;
      continue;
    }
    if (arg === "--all") {
      result.all = true;
      continue;
    }
    if (arg === "--gitignore") {
      result.gitignore = true;
      continue;
    }
    if (arg === "--auto-approve") {
      result.autoApprove = true;
      continue;
    }
    if (arg === "--approve-tool") {
      const tools: string[] = result.approveTool ? [...result.approveTool] : [];
      let j = i + 1;
      while (j < argv.length) {
        const value = argv[j];
        if (!value || value.startsWith("-")) break;
        tools.push(value);
        j += 1;
      }
      if (tools.length > 0) {
        result.approveTool = tools;
      }
      i = j - 1;
      continue;
    }
    if ((arg === "-h" || arg === "--header") && argv[i + 1]) {
      const headers: string[] = result.header ? [...result.header] : [];
      headers.push(argv[i + 1]!);
      result.header = headers;
      i += 1;
      continue;
    }
    if (arg === "--env" && argv[i + 1]) {
      const env: string[] = result.env ? [...result.env] : [];
      env.push(argv[i + 1]!);
      result.env = env;
      i += 1;
      continue;
    }
    if (arg === "--args" && argv[i + 1]) {
      const args: string[] = result.args ? [...result.args] : [];
      args.push(argv[i + 1]!);
      result.args = args;
      i += 1;
      continue;
    }
    if ((arg === "-n" || arg === "--name") && argv[i + 1]) {
      result.name = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "-a" || arg === "--agent") {
      const agents: string[] = result.agent ? [...result.agent] : [];
      let j = i + 1;
      while (j < argv.length) {
        const value = argv[j];
        if (!value || value.startsWith("-")) break;
        agents.push(value);
        j += 1;
      }
      if (agents.length > 0) {
        result.agent = agents;
      }
      i = j - 1;
    }
  }

  return result;
}

function inferFindPreferredTransport(
  options: Options,
): TransportType | undefined {
  // Only infer from explicit agent flags; otherwise default to HTTP-first.
  if (!options.agent || options.agent.length === 0) {
    return undefined;
  }

  const resolvedAgents = options.agent
    .map((value) => resolveAgentType(value))
    .filter((value): value is AgentType => value !== null);

  if (resolvedAgents.length === 0) {
    return undefined;
  }

  const supportsHttp = resolvedAgents.some((agent) =>
    isTransportSupported(agent, "http"),
  );
  if (supportsHttp) {
    return undefined;
  }

  const supportsSse = resolvedAgents.every((agent) =>
    isTransportSupported(agent, "sse"),
  );

  return supportsSse ? "sse" : undefined;
}

/**
 * Collect multiple values for repeatable options
 */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

interface ParsedHeadersResult {
  headers: Record<string, string>;
  invalid: string[];
}

function looksLikeEatenShellVar(
  invalidEntries: string[],
  separator: string,
): boolean {
  for (const entry of invalidEntries) {
    const separatorIndex = entry.indexOf(separator);
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (key && !value) return true;
  }
  return false;
}

function parseHeaders(values: string[]): ParsedHeadersResult {
  const headers: Record<string, string> = {};
  const invalid: string[] = [];

  for (const entry of values) {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex <= 0) {
      invalid.push(entry);
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      invalid.push(entry);
      continue;
    }

    headers[key] = value;
  }

  return { headers, invalid };
}

interface ParsedEnvResult {
  env: Record<string, string>;
  invalid: string[];
}

function parseEnv(values: string[]): ParsedEnvResult {
  const env: Record<string, string> = {};
  const invalid: string[] = [];

  for (const entry of values) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      invalid.push(entry);
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      invalid.push(entry);
      continue;
    }

    env[key] = value;
  }

  return { env, invalid };
}

function omitEmptyStringValues(
  record: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, v]) => typeof v === "string" && v.trim().length > 0,
    ),
  );
}

program
  .name("add-mcp")
  .description(
    "Install MCP servers for coding agents (Claude Code, Cursor, VS Code, OpenCode, Codex, and more — run list-agents for the full list)",
  )
  .version(version)
  .helpOption("--help", "display help for command")
  .argument("[target]", "MCP server URL (remote) or package name (local stdio)")
  .option(
    "-g, --global",
    "Install globally (user-level) instead of project-level",
  )
  .option("-a, --agent <agent>", "Specify agents to install to", collect, [])
  .option(
    "-n, --name <name>",
    "Server name (auto-inferred from target if not provided)",
  )
  .option(
    "-t, --transport <type>",
    "Transport type for remote servers (http, sse)",
  )
  .option("--type <type>", "Alias for --transport")
  .option(
    "-h, --header <header>",
    "HTTP header for remote servers (repeatable, 'Key: Value'). Placeholders ${VAR} prompt interactively when not using --yes. Use single quotes so your shell does not expand the ${VAR}.",
    collect,
    [],
  )
  .option(
    "--env <env>",
    "Environment variable for local stdio servers (repeatable, 'KEY=VALUE'). Placeholders ${VAR} prompt interactively when not using --yes. Use single quotes so your shell does not expand the ${VAR}.",
    collect,
    [],
  )
  .option(
    "--args <arg>",
    "Argument for local stdio servers (repeatable). Placeholders ${VAR} prompt interactively when not using --yes. Use single quotes so your shell does not expand the ${VAR}.",
    collect,
    [],
  )
  .option(
    "--timeout <ms>",
    "Request timeout in milliseconds for remote servers. Only applied to agents that support it (e.g. Claude Code, Gemini CLI, Grok Build); dropped with a warning elsewhere.",
  )
  .option(
    "--scopes <scopes>",
    "OAuth scopes to request for remote servers (comma-separated). Only applied to agents that support it (e.g. Cursor, Gemini CLI); dropped with a warning elsewhere.",
  )
  .option("--oauth-scopes <scopes>", "Alias for --scopes")
  .option(
    "--bearer-token-env <name>",
    "Environment variable name whose value fx sends as a bearer token for remote servers. Written as bearer_token_env for fx; dropped with a warning elsewhere.",
  )
  .option(
    "--auto-approve",
    "Auto-approve MCP tool calls for agents that support it (Codex, Claude Code). Dropped with a warning for other agents.",
  )
  .option(
    "--approve-tool <tool>",
    "Tool name to auto-approve when --auto-approve is set (repeatable; defaults to all tools)",
    collect,
    [],
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--all", "Install to all agents")
  .option("--gitignore", "Add generated project config files to .gitignore")
  .action(async (target: string | undefined, options: Options) => {
    await main(target, options);
  });

program
  .command("list-agents")
  .description("List all supported coding agents")
  .action(() => {
    listAgents();
  });

async function runFindCommand(
  keyword: string | undefined,
  rawOptions: Options | { opts: () => Options },
) {
  const options = {
    ...extractOptions(rawOptions),
    ...extractSubcommandOptionsFromArgv(),
  };
  const query = (keyword ?? "").trim();

  const registries = await ensureFindRegistriesConfigured();
  if (!registries) {
    p.cancel("Find cancelled");
    process.exit(0);
  }

  const installPlan = await runFind(query, {
    yes: options.yes,
    registries,
    preferredTransport: inferFindPreferredTransport(options),
  });

  if (!installPlan) {
    p.cancel("Find cancelled");
    process.exit(0);
  }

  const mergedOptions: Options = {
    ...options,
    name: options.name || installPlan.serverName,
    transport: installPlan.transport,
    header: installPlan.headers
      ? Object.entries(installPlan.headers).map(
          ([key, value]) => `${key}: ${value}`,
        )
      : options.header,
    env: installPlan.env
      ? Object.entries(installPlan.env).map(([key, value]) => `${key}=${value}`)
      : options.env,
    args: installPlan.args ?? options.args,
  };

  await main(installPlan.target, mergedOptions);
}

program
  .command("find [keyword]")
  .description(
    "Find MCP servers from integrations.sh registry data (omit keyword to browse)",
  )
  .option(
    "-g, --global",
    "Install globally (user-level) instead of project-level",
  )
  .option("-a, --agent <agent>", "Specify agents to install to", collect, [])
  .option(
    "-n, --name <name>",
    "Server name override (defaults to catalog entry name)",
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .option(
    "--auto-approve",
    "Auto-approve MCP tool calls for agents that support it (Codex, Claude Code)",
  )
  .option(
    "--approve-tool <tool>",
    "Tool name to auto-approve when --auto-approve is set (repeatable; defaults to all tools)",
    collect,
    [],
  )
  .option("--all", "Install to all agents")
  .option("--gitignore", "Add generated project config files to .gitignore")
  .action(
    async (
      keyword: string | undefined,
      options: Options | { opts: () => Options },
    ) => {
      await runFindCommand(keyword, options);
    },
  );

program
  .command("search [keyword]")
  .description("Alias for find")
  .option(
    "-g, --global",
    "Install globally (user-level) instead of project-level",
  )
  .option("-a, --agent <agent>", "Specify agents to install to", collect, [])
  .option(
    "-n, --name <name>",
    "Server name override (defaults to catalog entry name)",
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .option(
    "--auto-approve",
    "Auto-approve MCP tool calls for agents that support it (Codex, Claude Code)",
  )
  .option(
    "--approve-tool <tool>",
    "Tool name to auto-approve when --auto-approve is set (repeatable; defaults to all tools)",
    collect,
    [],
  )
  .option("--all", "Install to all agents")
  .option("--gitignore", "Add generated project config files to .gitignore")
  .action(
    async (
      keyword: string | undefined,
      options: Options | { opts: () => Options },
    ) => {
      await runFindCommand(keyword, options);
    },
  );

// ── list command ──────────────────────────────────────────────────────────

program
  .command("list")
  .description("List installed MCP servers across detected agents")
  .option("-g, --global", "List global configs instead of project-level")
  .option("-a, --agent <agent>", "Filter to specific agent(s)", collect, [])
  .action(async (rawOptions: Options | { opts: () => Options }) => {
    const options = {
      ...extractOptions(rawOptions),
      ...extractSubcommandOptionsFromArgv(),
    };
    await runListCommand(options);
  });

// ── remove command ───────────────────────────────────────────────────────

program
  .command("remove <query>")
  .description("Remove an MCP server from agent configurations")
  .option("-g, --global", "Remove from global configs instead of project-level")
  .option("-a, --agent <agent>", "Filter to specific agent(s)", collect, [])
  .option("-y, --yes", "Remove all matches without prompting")
  .action(
    async (query: string, rawOptions: Options | { opts: () => Options }) => {
      const options = {
        ...extractOptions(rawOptions),
        ...extractSubcommandOptionsFromArgv(),
      };
      await runRemoveCommand(query, options);
    },
  );

// ── sync / unify command ─────────────────────────────────────────────────

program
  .command("sync")
  .description(
    "Synchronize server names and installations across all detected agents",
  )
  .option("-g, --global", "Sync global configs instead of project-level")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (rawOptions: Options | { opts: () => Options }) => {
    const options = {
      ...extractOptions(rawOptions),
      ...extractSubcommandOptionsFromArgv(),
    };
    await runSyncCommand(options);
  });

program
  .command("unify")
  .description("Alias for sync")
  .option("-g, --global", "Sync global configs instead of project-level")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (rawOptions: Options | { opts: () => Options }) => {
    const options = {
      ...extractOptions(rawOptions),
      ...extractSubcommandOptionsFromArgv(),
    };
    await runSyncCommand(options);
  });

program.parse();

// ── list implementation ──────────────────────────────────────────────────

async function runListCommand(options: Options): Promise<void> {
  showLogo();
  console.log();

  const explicitAgents = resolveAgentFlags(options.agent);

  const agentServersList = await listInstalledServers({
    global: options.global,
    agents: explicitAgents.length > 0 ? explicitAgents : undefined,
  });

  if (agentServersList.length === 0) {
    const hint = options.global
      ? "No agents detected globally. Use -a to target a specific agent."
      : "No agents detected in this project. Use -g for global or -a to target a specific agent.";
    p.log.info(hint);
    console.log();
    return;
  }

  for (const agentServers of agentServersList) {
    if (!agentServers.detected) {
      console.log(
        `${TEXT}${agentServers.displayName}:${RESET} ${DIM}not detected${RESET}`,
      );
      continue;
    }

    if (agentServers.servers.length === 0) {
      console.log(
        `${TEXT}${agentServers.displayName}:${RESET} ${DIM}no servers configured${RESET}`,
      );
      continue;
    }

    console.log(`${TEXT}${agentServers.displayName}:${RESET}`);
    for (const server of agentServers.servers) {
      const identityHint = server.identity
        ? ` ${DIM}(${server.identity})${RESET}`
        : "";
      console.log(
        `  ${DIM}-${RESET} ${TEXT}${server.serverName}${RESET}${identityHint}`,
      );
    }
  }

  console.log();
}

// ── remove implementation ────────────────────────────────────────────────

async function runRemoveCommand(
  query: string,
  options: Options,
): Promise<void> {
  showLogo();
  console.log();

  const explicitAgents = resolveAgentFlags(options.agent);

  const agentServersList = await listInstalledServers({
    global: options.global,
    agents: explicitAgents.length > 0 ? explicitAgents : undefined,
  });

  const matches = findMatchingServers(agentServersList, query);

  if (matches.length === 0) {
    p.log.info(`No matching servers found for '${query}'`);
    console.log();
    return;
  }

  // Build selection options
  const matchOptions = matches.map((m, i) => ({
    value: i,
    label: `${m.serverName} (${agents[m.agentType].displayName})`,
    hint: m.identity || m.configPath,
  }));

  let selectedIndices: number[];

  if (options.yes) {
    selectedIndices = matches.map((_, i) => i);
    p.log.info(
      `Removing ${matches.length} server${matches.length !== 1 ? "s" : ""} matching '${query}'`,
    );
  } else {
    const selected = await p.multiselect({
      message: `Select servers to remove (${matches.length} match${matches.length !== 1 ? "es" : ""} found)`,
      options: matchOptions,
      required: false,
      initialValues: matches.map((_, i) => i),
    });

    if (p.isCancel(selected)) {
      p.log.info("No changes made");
      console.log();
      return;
    }

    selectedIndices = selected as number[];

    if (selectedIndices.length === 0) {
      p.log.info("No changes made");
      console.log();
      return;
    }
  }

  let removedCount = 0;
  const affectedAgents = new Set<string>();

  for (const idx of selectedIndices) {
    const server = matches[idx]!;
    const agent = agents[server.agentType];
    try {
      removeServerFromConfig(
        server.configPath,
        agent.format,
        getConfigKeyForServer(server),
        server.serverName,
      );
      removedCount++;
      affectedAgents.add(agent.displayName);
    } catch (error) {
      p.log.error(
        `Failed to remove ${server.serverName} from ${agent.displayName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (removedCount > 0) {
    p.log.success(
      `Removed ${removedCount} server${removedCount !== 1 ? "s" : ""} from ${affectedAgents.size} agent${affectedAgents.size !== 1 ? "s" : ""}`,
    );
  }

  console.log();
}

function getConfigKeyForServer(server: InstalledServer): string {
  const agent = agents[server.agentType];
  if (server.scope === "local" && agent.localConfigKey) {
    return agent.localConfigKey;
  }
  return agent.configKey;
}

// ── sync implementation ──────────────────────────────────────────────────

interface SyncGroup {
  identity: string;
  entries: InstalledServer[];
  canonicalName: string;
  canonicalConfig: Record<string, unknown>;
  hasConflict: boolean;
  conflictReason?: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (!deepEqual(aKeys, bKeys)) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

function pickCanonicalName(entries: InstalledServer[]): string {
  const nameFreq = new Map<string, number>();
  for (const entry of entries) {
    nameFreq.set(entry.serverName, (nameFreq.get(entry.serverName) ?? 0) + 1);
  }

  const names = [...nameFreq.entries()];
  names.sort(([nameA, freqA], [nameB, freqB]) => {
    // Shortest first
    if (nameA.length !== nameB.length) return nameA.length - nameB.length;
    // Most frequent first
    if (freqA !== freqB) return freqB - freqA;
    // Alphabetical
    return nameA.localeCompare(nameB);
  });

  return names[0]![0];
}

function extractConflictFields(config: Record<string, unknown>): {
  headers: unknown;
  env: unknown;
  args: unknown;
} {
  return {
    headers: config.headers ?? config.http_headers ?? null,
    env: config.env ?? config.envs ?? config.environment ?? null,
    args: normalizeStoredCommand(config).args,
  };
}

function buildSyncGroups(agentServersList: AgentServers[]): SyncGroup[] {
  // Group servers by identity
  const byIdentity = new Map<string, InstalledServer[]>();

  for (const agentServers of agentServersList) {
    for (const server of agentServers.servers) {
      if (!server.identity) continue;
      const existing = byIdentity.get(server.identity) ?? [];
      existing.push(server);
      byIdentity.set(server.identity, existing);
    }
  }

  const groups: SyncGroup[] = [];

  for (const [identity, entries] of byIdentity) {
    // Check for conflicts across entries
    const fieldSets = entries.map((e) => extractConflictFields(e.config));
    const reference = fieldSets[0]!;
    let hasConflict = false;
    let conflictReason: string | undefined;

    for (let i = 1; i < fieldSets.length; i++) {
      const other = fieldSets[i]!;
      if (!deepEqual(reference.headers, other.headers)) {
        hasConflict = true;
        conflictReason = `headers differ between ${agents[entries[0]!.agentType].displayName} and ${agents[entries[i]!.agentType].displayName}`;
        break;
      }
      if (!deepEqual(reference.env, other.env)) {
        hasConflict = true;
        conflictReason = `env differs between ${agents[entries[0]!.agentType].displayName} and ${agents[entries[i]!.agentType].displayName}`;
        break;
      }
      if (!deepEqual(reference.args, other.args)) {
        hasConflict = true;
        conflictReason = `args differ between ${agents[entries[0]!.agentType].displayName} and ${agents[entries[i]!.agentType].displayName}`;
        break;
      }
    }

    groups.push({
      identity,
      entries,
      canonicalName: pickCanonicalName(entries),
      canonicalConfig: entries[0]!.config,
      hasConflict,
      conflictReason,
    });
  }

  return groups;
}

async function runSyncCommand(options: Options): Promise<void> {
  showLogo();
  console.log();

  const agentServersList = await listInstalledServers({
    global: options.global,
  });

  const agentsWithServers = agentServersList.filter(
    (a) => a.servers.length > 0,
  );

  if (agentServersList.length < 2) {
    p.log.info("Need at least 2 detected agents to sync");
    console.log();
    return;
  }

  const groups = buildSyncGroups(agentServersList);
  const detectedAgentTypes = new Set(agentServersList.map((a) => a.agentType));

  // Determine what needs to change
  const renames: Array<{
    group: SyncGroup;
    agentType: AgentType;
    oldName: string;
  }> = [];
  const additions: Array<{
    group: SyncGroup;
    agentType: AgentType;
  }> = [];
  const skipped: SyncGroup[] = [];

  for (const group of groups) {
    if (group.hasConflict) {
      skipped.push(group);
      continue;
    }

    const presentAgents = new Set(group.entries.map((e) => e.agentType));

    // Find renames (agents that have this server under a different name)
    for (const entry of group.entries) {
      if (entry.serverName !== group.canonicalName) {
        renames.push({
          group,
          agentType: entry.agentType,
          oldName: entry.serverName,
        });
      }
    }

    // Find agents that are missing this server
    for (const agentType of detectedAgentTypes) {
      if (!presentAgents.has(agentType)) {
        additions.push({ group, agentType });
      }
    }
  }

  if (renames.length === 0 && additions.length === 0 && skipped.length === 0) {
    p.log.info("All servers are already in sync");
    console.log();
    return;
  }

  // Show sync plan
  const planLines: string[] = [];

  if (renames.length > 0) {
    planLines.push(chalk.cyan("Renames:"));
    for (const r of renames) {
      planLines.push(
        `  ${agents[r.agentType].displayName}: ${r.oldName} → ${r.group.canonicalName}`,
      );
    }
  }

  if (additions.length > 0) {
    planLines.push(chalk.cyan("Additions:"));
    for (const a of additions) {
      planLines.push(
        `  ${agents[a.agentType].displayName}: + ${a.group.canonicalName} (${a.group.identity})`,
      );
    }
  }

  if (skipped.length > 0) {
    planLines.push(chalk.yellow("Skipped (conflicts):"));
    for (const s of skipped) {
      planLines.push(`  ${s.identity}: ${s.conflictReason}`);
    }
  }

  if (renames.length === 0 && additions.length === 0) {
    // Only skipped items, nothing actionable
    p.note(planLines.join("\n"), "Sync Plan");
    p.log.info(
      "All servers are already in sync (some skipped due to conflicts)",
    );
    console.log();
    return;
  }

  p.note(planLines.join("\n"), "Sync Plan");

  if (!options.yes) {
    const confirmed = await p.confirm({
      message: "Proceed with sync?",
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.log.info("No changes made");
      console.log();
      return;
    }
  }

  const scope: "local" | "global" = options.global ? "global" : "local";
  let changeCount = 0;

  // Write-first: install canonical names
  for (const rename of renames) {
    const { group, agentType } = rename;
    const result = installServerForAgent(
      group.canonicalName,
      buildServerConfigFromStored(group.canonicalConfig),
      agentType,
      { local: scope === "local" },
    );
    if (result.success) {
      changeCount++;
    } else {
      p.log.error(
        `Failed to write ${group.canonicalName} to ${agents[agentType].displayName}: ${result.error}`,
      );
    }
  }

  for (const addition of additions) {
    const { group, agentType } = addition;
    const result = installServerForAgent(
      group.canonicalName,
      buildServerConfigFromStored(group.canonicalConfig),
      agentType,
      { local: scope === "local" },
    );
    if (result.success) {
      changeCount++;
    } else {
      p.log.error(
        `Failed to add ${group.canonicalName} to ${agents[agentType].displayName}: ${result.error}`,
      );
    }
  }

  // Delete-second: remove old aliases
  for (const rename of renames) {
    const { group, agentType, oldName } = rename;
    const agentConfig = agents[agentType];
    const entry = group.entries.find((e) => e.agentType === agentType);
    if (!entry) continue;

    try {
      removeServerFromConfig(
        entry.configPath,
        agentConfig.format,
        getConfigKeyForServer(entry),
        oldName,
      );
    } catch (error) {
      p.log.error(
        `Failed to remove old alias ${oldName} from ${agentConfig.displayName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  p.log.success(
    `Synced ${changeCount} server${changeCount !== 1 ? "s" : ""} across ${detectedAgentTypes.size} agent${detectedAgentTypes.size !== 1 ? "s" : ""}`,
  );
  console.log();
}

const TRANSPORT_ALIASES: Record<string, "http" | "sse"> = {
  http: "http",
  sse: "sse",
  streamable_http: "http",
  streamableHttp: "http",
  "streamable-http": "http",
  remote: "http",
};

function normalizeTransportType(
  raw: unknown,
): import("./types.js").TransportType {
  if (typeof raw === "string" && raw in TRANSPORT_ALIASES) {
    return TRANSPORT_ALIASES[raw]!;
  }
  return "http";
}

function buildServerConfigFromStored(
  config: Record<string, unknown>,
): import("./types.js").McpServerConfig {
  const httpUrl =
    typeof config.httpUrl === "string" && config.httpUrl.length > 0
      ? config.httpUrl
      : undefined;
  const url =
    httpUrl ??
    (typeof config.url === "string"
      ? config.url
      : typeof config.uri === "string"
        ? config.uri
        : typeof config.serverUrl === "string"
          ? config.serverUrl
          : undefined);

  if (url) {
    const result: import("./types.js").McpServerConfig = {
      type: httpUrl
        ? "http"
        : normalizeTransportType(config.type ?? config.transport),
      url,
    };

    const headers =
      config.headers && typeof config.headers === "object"
        ? (config.headers as Record<string, string>)
        : config.http_headers && typeof config.http_headers === "object"
          ? (config.http_headers as Record<string, string>)
          : undefined;

    if (headers && Object.keys(headers).length > 0) {
      result.headers = headers;
    }

    return result;
  }

  const { command, args } = normalizeStoredCommand(config);

  const env =
    config.env && typeof config.env === "object"
      ? (config.env as Record<string, string>)
      : config.envs && typeof config.envs === "object"
        ? (config.envs as Record<string, string>)
        : config.environment && typeof config.environment === "object"
          ? (config.environment as Record<string, string>)
          : undefined;

  const result: import("./types.js").McpServerConfig = {};
  if (command) result.command = command;
  if (args.length > 0) result.args = args;
  if (env && Object.keys(env).length > 0) result.env = env;
  return result;
}

// ── helper: resolve -a flags ─────────────────────────────────────────────

function resolveAgentFlags(agentFlags?: string[]): AgentType[] {
  if (!agentFlags || agentFlags.length === 0) return [];

  const resolved: AgentType[] = [];
  const invalid: string[] = [];

  for (const input of agentFlags) {
    const agentType = resolveAgentType(input);
    if (agentType) {
      resolved.push(agentType);
    } else {
      invalid.push(input);
    }
  }

  if (invalid.length > 0) {
    p.log.error(`Invalid agents: ${invalid.join(", ")}`);
    p.log.info(`Valid agents: ${getAgentTypes().join(", ")}`);
    process.exit(1);
  }

  return resolved;
}

function listAgents(): void {
  showLogo();
  console.log();
  console.log(`${DIM}Supported agents:${RESET}`);
  console.log();

  const allAgentTypes = getAgentTypes();

  // Collect aliases per agent type
  const aliasesByAgent: Partial<Record<AgentType, string[]>> = {};
  for (const [alias, target] of Object.entries(agentAliases)) {
    if (!aliasesByAgent[target]) {
      aliasesByAgent[target] = [];
    }
    aliasesByAgent[target].push(alias);
  }

  // Calculate column widths
  const nameColWidth = Math.max(
    "Argument".length,
    ...allAgentTypes.map((t) => t.length),
  );
  const clientColWidth = Math.max(
    "MCP Client".length,
    ...allAgentTypes.map((t) => agents[t].displayName.length),
  );
  const aliasColWidth = Math.max(
    "Aliases".length,
    ...allAgentTypes.map(
      (t) => (aliasesByAgent[t] ? aliasesByAgent[t].join(", ") : "").length,
    ),
  );

  const pad = (str: string, width: number) =>
    str + " ".repeat(Math.max(0, width - str.length));

  // Header
  const header = `  ${pad("Argument", nameColWidth)}  ${pad("MCP Client", clientColWidth)}  ${pad("Aliases", aliasColWidth)}  Local  Global`;
  const separator = `  ${"-".repeat(nameColWidth)}  ${"-".repeat(clientColWidth)}  ${"-".repeat(aliasColWidth)}  -----  ------`;

  console.log(`${DIM}${header}${RESET}`);
  console.log(`${DIM}${separator}${RESET}`);

  for (const agentType of allAgentTypes) {
    const agent = agents[agentType];
    const hasLocal = supportsProjectConfig(agentType);
    const localMark = hasLocal ? "  ✓  " : "  -  ";
    const globalMark = "  ✓  ";
    const aliasStr = aliasesByAgent[agentType]
      ? aliasesByAgent[agentType].join(", ")
      : "";

    console.log(
      `  ${TEXT}${pad(agentType, nameColWidth)}${RESET}  ${DIM}${pad(agent.displayName, clientColWidth)}${RESET}  ${DIM}${pad(aliasStr, aliasColWidth)}${RESET}  ${TEXT}${localMark}${RESET} ${TEXT}${globalMark}${RESET}`,
    );
  }

  console.log();
}

async function main(target: string | undefined, options: Options) {
  // --all just selects all agents, doesn't imply --yes or --global
  // Use --yes to skip prompts, --global to install globally

  // Always show the logo
  showLogo();

  // Show full banner (with help) when no target is provided
  if (!target) {
    console.log();
    console.log(`${DIM}Add MCP servers to your favorite coding agents${RESET}`);
    console.log();
    console.log(
      `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url>${RESET}              ${DIM}Install remote MCP server${RESET}`,
    );
    console.log(
      `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<package>${RESET}          ${DIM}Install npm package${RESET}`,
    );
    console.log(
      `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url> ${TEXT}-g${RESET}            ${DIM}Install globally${RESET}`,
    );
    console.log(
      `  ${DIM}$${RESET} ${TEXT}npx add-mcp ${DIM}<url> ${TEXT}-a cursor${RESET}    ${DIM}Install to specific agent${RESET}`,
    );
    console.log(
      `  ${DIM}$${RESET} ${TEXT}npx add-mcp find ${DIM}<keyword>${RESET}     ${DIM}Search integrations.sh MCP servers${RESET}`,
    );
    console.log();
    console.log(
      `${DIM}Supports:${RESET} Claude Code, Cursor, VS Code, OpenCode, and more`,
    );
    console.log();
    console.log(
      `${DIM}Learn more at${RESET} ${TEXT}https://github.com/neondatabase/add-mcp${RESET}`,
    );
    console.log();
    process.exit(0);
  }

  console.log();

  const spinner = p.spinner();

  // Parse the source
  spinner.start("Parsing source...");
  const parsed = parseSource(target);
  const isRemote = isRemoteSource(parsed);
  const sourceType = isRemote ? "remote" : "local";
  spinner.stop(`Source: ${chalk.cyan(parsed.value)} (${sourceType})`);

  const headerValues = options.header ?? [];
  const headerResult = parseHeaders(headerValues);
  if (headerResult.invalid.length > 0) {
    const hint = looksLikeEatenShellVar(headerResult.invalid, ":")
      ? " (looks like your shell expanded a ${VAR} to an empty string; use single quotes: --header 'Key: ${VAR}' to pass the template literally)"
      : "";
    p.log.error(
      `Invalid --header value(s): ${headerResult.invalid.join(", ")}. Use 'Key: Value' format.${hint}`,
    );
    process.exit(1);
  }

  const headerKeys = Object.keys(headerResult.headers);
  const hasHeaderValues = headerKeys.length > 0;
  if (hasHeaderValues && !isRemote) {
    p.log.warn("--header is only used for remote URLs, ignoring");
  }

  const envValues = options.env ?? [];
  const envResult = parseEnv(envValues);
  if (envResult.invalid.length > 0) {
    const hint = looksLikeEatenShellVar(envResult.invalid, "=")
      ? " (looks like your shell expanded a ${VAR} to an empty string; use single quotes: --env 'KEY=${VAR}' to pass the template literally)"
      : "";
    p.log.error(
      `Invalid --env value(s): ${envResult.invalid.join(", ")}. Use 'KEY=VALUE' format.${hint}`,
    );
    process.exit(1);
  }

  const envKeys = Object.keys(envResult.env);
  const hasEnvValues = envKeys.length > 0;
  if (hasEnvValues && isRemote) {
    p.log.warn(
      "--env is only used for local/package/command installs, ignoring",
    );
  }

  const argsValues = options.args ?? [];
  const hasArgsValues = argsValues.length > 0;
  if (hasArgsValues && isRemote) {
    p.log.warn(
      "--args is only used for local/package/command installs, ignoring",
    );
  }

  const promptTemplateVar = (varName: string) =>
    p.text({
      message: `Enter value for ${varName}`,
      placeholder: `<${varName}>`,
    });

  let resolvedArgs = [...argsValues];

  if (
    !options.yes &&
    hasHeaderValues &&
    hasTemplateVars(headerResult.headers)
  ) {
    const result = await resolveRecordTemplates(
      headerResult.headers,
      promptTemplateVar,
    );
    if (result.cancelled) {
      p.cancel("Cancelled");
      process.exit(0);
    }
    for (const [key, value] of Object.entries(result.resolved)) {
      headerResult.headers[key] = value;
    }
  }

  if (!options.yes && hasEnvValues && hasTemplateVars(envResult.env)) {
    const result = await resolveRecordTemplates(
      envResult.env,
      promptTemplateVar,
    );
    if (result.cancelled) {
      p.cancel("Cancelled");
      process.exit(0);
    }
    for (const [key, value] of Object.entries(result.resolved)) {
      envResult.env[key] = value;
    }
  }

  if (!options.yes && hasArgsValues && hasTemplateVars(resolvedArgs)) {
    const result = await resolveArrayTemplates(resolvedArgs, promptTemplateVar);
    if (result.cancelled) {
      p.cancel("Cancelled");
      process.exit(0);
    }
    resolvedArgs = result.resolved;
  }

  const headersForConfig =
    isRemote && hasHeaderValues
      ? omitEmptyStringValues(headerResult.headers)
      : undefined;
  const envForConfig =
    !isRemote && hasEnvValues
      ? omitEmptyStringValues(envResult.env)
      : undefined;
  const argsForConfig =
    !isRemote && hasArgsValues
      ? resolvedArgs.filter((a) => a.trim().length > 0)
      : undefined;

  // Determine server name
  const serverName = options.name || parsed.inferredName;
  p.log.info(`Server name: ${chalk.cyan(serverName)}`);

  // Handle transport option (--transport or --type)
  const transportValue = options.transport || options.type;
  let resolvedTransport: TransportType | undefined;

  if (transportValue) {
    const validTransports = ["http", "sse"];
    if (!validTransports.includes(transportValue)) {
      p.log.error(
        `Invalid transport: ${transportValue}. Valid options: ${validTransports.join(", ")}`,
      );
      process.exit(1);
    }
    resolvedTransport = transportValue as TransportType;
    if (!isRemoteSource(parsed)) {
      p.log.warn("--transport is only used for remote URLs, ignoring");
    }
  }

  // Handle remote-only --timeout flag
  let resolvedTimeout: number | undefined;
  if (options.timeout !== undefined) {
    const parsedTimeout = Number(options.timeout);
    if (!Number.isInteger(parsedTimeout) || parsedTimeout <= 0) {
      p.log.error(
        `Invalid --timeout value: ${options.timeout}. Provide a positive integer (milliseconds).`,
      );
      process.exit(1);
    }
    if (isRemote) {
      resolvedTimeout = parsedTimeout;
    } else {
      p.log.warn("--timeout is only used for remote URLs, ignoring");
    }
  }

  // Handle remote-only --scopes / --oauth-scopes flag
  const scopesValue = options.scopes ?? options.oauthScopes;
  let resolvedScopes: string[] | undefined;
  if (scopesValue !== undefined) {
    const parsedScopes = scopesValue
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
    if (parsedScopes.length === 0) {
      p.log.error(
        `Invalid --scopes value: ${scopesValue}. Provide one or more comma-separated scopes.`,
      );
      process.exit(1);
    }
    if (isRemote) {
      resolvedScopes = parsedScopes;
    } else {
      p.log.warn("--scopes is only used for remote URLs, ignoring");
    }
  }

  // Handle --auto-approve / --approve-tool (applies to remote and local).
  // An empty list means "all tools"; --approve-tool implies --auto-approve.
  const approveTools = [...new Set(options.approveTool ?? [])];
  const autoApproveTools =
    options.autoApprove || approveTools.length > 0 ? approveTools : undefined;

  let resolvedBearerTokenEnv: string | undefined;
  if (options.bearerTokenEnv !== undefined) {
    const name = options.bearerTokenEnv.trim();
    if (name.length === 0) {
      p.log.error(
        "Invalid --bearer-token-env value. The name cannot be empty.",
      );
      process.exit(1);
    }
    if (isRemote) {
      resolvedBearerTokenEnv = name;
    } else {
      p.log.warn("--bearer-token-env is only used for remote URLs, ignoring");
    }
  }

  // Build server config
  const serverConfig = buildServerConfig(parsed, {
    transport: resolvedTransport,
    headers:
      headersForConfig && Object.keys(headersForConfig).length > 0
        ? headersForConfig
        : undefined,
    env:
      envForConfig && Object.keys(envForConfig).length > 0
        ? envForConfig
        : undefined,
    args: argsForConfig && argsForConfig.length > 0 ? argsForConfig : undefined,
    timeout: resolvedTimeout,
    oauthScopes: resolvedScopes,
    autoApproveTools,
    bearerTokenEnv: resolvedBearerTokenEnv,
  });

  // Determine target agents
  let targetAgents: AgentType[];
  const allAgentTypes = getAgentTypes();

  // Track which agents should use local vs global config
  // This starts with detection hints, then is overwritten with the final scope.
  let agentRouting: Map<AgentType, "local" | "global"> = new Map();

  if (options.agent && options.agent.length > 0) {
    // Resolve specified agents (handling aliases)
    const resolved: AgentType[] = [];
    const invalid: string[] = [];

    for (const input of options.agent) {
      const agentType = resolveAgentType(input);
      if (agentType) {
        resolved.push(agentType);
      } else {
        invalid.push(input);
      }
    }

    if (invalid.length > 0) {
      p.log.error(`Invalid agents: ${invalid.join(", ")}`);
      p.log.info(`Valid agents: ${allAgentTypes.join(", ")}`);
      process.exit(1);
    }

    targetAgents = resolved;
  } else if (options.all) {
    targetAgents = allAgentTypes;
    p.log.info(`Installing to all ${targetAgents.length} agents`);
  } else {
    // Smart detection based on scope
    spinner.start("Detecting agents...");

    let detectedAgents: AgentType[];

    if (options.global) {
      // Global mode: detect all globally installed agents
      detectedAgents = await detectGlobalAgents();
      for (const agent of detectedAgents) {
        agentRouting.set(agent, "global");
      }
    } else {
      // Default (project) mode: only detect project agents
      const projectAgents = detectProjectAgents();
      detectedAgents = projectAgents;

      // Set routing for detected agents
      for (const agent of projectAgents) {
        agentRouting.set(agent, "local");
      }
    }

    spinner.stop(
      `Detected ${detectedAgents.length} agent${detectedAgents.length !== 1 ? "s" : ""}`,
    );

    if (detectedAgents.length === 0) {
      if (options.yes) {
        if (options.global) {
          targetAgents = allAgentTypes;
          for (const agent of targetAgents) {
            agentRouting.set(agent, "global");
          }
          p.log.info(
            `Installing to ${targetAgents.length} agents globally (none detected)`,
          );
        } else {
          // No agents detected + --yes: install to all project-capable agents
          targetAgents = getProjectCapableAgents();
          for (const agent of targetAgents) {
            agentRouting.set(agent, "local");
          }
          p.log.info(
            `Installing to ${targetAgents.length} project-capable agents (none detected)`,
          );
        }
      } else {
        const availableAgents = allAgentTypes;

        p.log.warn(
          options.global
            ? "No coding agents detected."
            : "No agents detected in this project.",
        );

        const selected = await selectAgentsInteractive(availableAgents, {
          global: options.global,
        });

        if (p.isCancel(selected)) {
          p.cancel("Installation cancelled");
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    } else if (options.yes) {
      targetAgents = detectedAgents;
      const agentNames = detectedAgents
        .map((a) => chalk.cyan(agents[a].displayName))
        .join(", ");
      p.log.info(`Installing to: ${agentNames}`);
    } else {
      const availableAgents = allAgentTypes;
      let lastSelected: string[] | undefined;
      try {
        lastSelected = await getLastSelectedAgents();
      } catch {
        // Ignore lock read errors
      }
      const { choices: agentChoices, initialValues } =
        buildAgentSelectionChoices({
          availableAgents,
          detectedAgents,
          agentRouting,
          lastSelected,
        });

      const selected = await p.multiselect({
        message: "Select agents to install to",
        options: agentChoices,
        required: true,
        initialValues,
      });

      if (p.isCancel(selected)) {
        p.cancel("Installation cancelled");
        process.exit(0);
      }

      targetAgents = selected as AgentType[];
    }
  }

  // Validate transport compatibility with selected agents
  const requiredTransport: "stdio" | "sse" | "http" = isRemoteSource(parsed)
    ? (resolvedTransport ?? "http")
    : "stdio";

  const unsupportedAgents = targetAgents.filter(
    (a) => !isTransportSupported(a, requiredTransport),
  );

  if (unsupportedAgents.length > 0) {
    const unsupportedNames = unsupportedAgents
      .map((a) => agents[a].displayName)
      .join(", ");

    const hints = unsupportedAgents
      .map((a) => agents[a].unsupportedTransportMessage)
      .filter(Boolean);

    if (options.all) {
      // --all flag: warn but continue with supported agents
      p.log.warn(
        `Skipping agents that don't support ${requiredTransport} transport: ${unsupportedNames}`,
      );
      for (const hint of hints) {
        p.log.info(hint!);
      }
      targetAgents = targetAgents.filter((a) =>
        isTransportSupported(a, requiredTransport),
      );

      if (targetAgents.length === 0) {
        p.log.error("No agents support this transport type");
        process.exit(1);
      }
    } else {
      // Explicit agent selection: error
      p.log.error(
        `The following agents don't support ${requiredTransport} transport: ${unsupportedNames}`,
      );
      for (const hint of hints) {
        p.log.info(hint!);
      }
      process.exit(1);
    }
  }

  // Determine one common installation scope (global vs project). The CLI never
  // mixes scopes within a single install: if any selected agent is global-only,
  // global is the only common scope.
  if (options.global) {
    // Explicit global flag - route all agents to global
    agentRouting = new Map();
    for (const agent of targetAgents) {
      agentRouting.set(agent, "global");
    }
  } else {
    const commonScopes = getCommonInstallScopes(targetAgents);
    if (commonScopes.length === 0) {
      p.log.error("No agents selected");
      process.exit(1);
    }

    let installScope: InstallScope = commonScopes[0]!;
    if (commonScopes.length > 1 && !options.yes) {
      const scope = await p.select({
        message: "Installation scope",
        options: [
          {
            value: "local",
            label: "Project",
            hint: "Install in current directory (committed with your project)",
          },
          {
            value: "global",
            label: "Global",
            hint: "Install in home directory (available across all projects)",
          },
        ],
      });

      if (p.isCancel(scope)) {
        p.cancel("Installation cancelled");
        process.exit(0);
      }

      installScope = scope as InstallScope;
    } else if (installScope === "global") {
      p.log.info("Selected agents require global installation");
    }

    agentRouting = new Map();
    for (const agent of targetAgents) {
      agentRouting.set(agent, installScope);
    }
  }

  // Show summary
  const summaryLines: string[] = [];
  summaryLines.push(`${chalk.cyan("Server:")} ${serverName}`);
  summaryLines.push(`${chalk.cyan("Type:")} ${sourceType}`);
  if (autoApproveTools) {
    summaryLines.push(
      `${chalk.cyan("Auto-approve:")} ${
        autoApproveTools.length === 0
          ? "All tools"
          : autoApproveTools.join(", ")
      }`,
    );
  }

  // Determine scope display
  const localAgents = targetAgents.filter(
    (a) => agentRouting.get(a) === "local",
  );
  const globalAgents = targetAgents.filter(
    (a) => agentRouting.get(a) === "global",
  );

  if (localAgents.length > 0) {
    summaryLines.push(`${chalk.cyan("Scope:")} Project`);
    summaryLines.push(
      `${chalk.cyan("Agents:")} ${localAgents.map((a) => agents[a].displayName).join(", ")}`,
    );
  } else {
    summaryLines.push(`${chalk.cyan("Scope:")} Global`);
    summaryLines.push(
      `${chalk.cyan("Agents:")} ${globalAgents.map((a) => agents[a].displayName).join(", ")}`,
    );
  }

  console.log();
  p.note(summaryLines.join("\n"), "Installation Summary");

  // Confirm installation
  if (!options.yes) {
    const confirmed = await p.confirm({
      message: "Proceed with installation?",
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Installation cancelled");
      process.exit(0);
    }
  }

  // Install
  spinner.start("Installing MCP server...");

  const results = installServer(serverName, serverConfig, targetAgents, {
    routing: agentRouting,
  });

  spinner.stop("Installation complete");

  // Show results
  console.log();
  const successful = [...results.entries()].filter(([_, r]) => r.success);
  const failed = [...results.entries()].filter(([_, r]) => !r.success);

  if (successful.length > 0) {
    const resultLines: string[] = [];
    for (const [agentType, result] of successful) {
      const agent = agents[agentType];
      const shortPath = shortenPath(result.path);
      resultLines.push(
        `${chalk.green("✓")} ${agent.displayName}: ${chalk.dim(shortPath)}`,
      );
      for (const extraPath of result.extraPaths ?? []) {
        resultLines.push(
          `  ${chalk.dim("↳ permissions:")} ${chalk.dim(shortenPath(extraPath))}`,
        );
      }
    }

    p.note(
      resultLines.join("\n"),
      chalk.green(
        `Installed to ${successful.length} agent${successful.length !== 1 ? "s" : ""}`,
      ),
    );
  }

  if (failed.length > 0) {
    console.log();
    p.log.error(
      chalk.red(
        `Failed to install to ${failed.length} agent${failed.length !== 1 ? "s" : ""}`,
      ),
    );
    for (const [agentType, result] of failed) {
      const agent = agents[agentType];
      p.log.message(
        `  ${chalk.red("✗")} ${agent.displayName}: ${chalk.dim(result.error)}`,
      );
    }
  }

  // Surface any optional fields that were dropped because an agent can't
  // represent them, grouped by field for a concise message.
  const droppedByField = new Map<OptionalField, string[]>();
  for (const [agentType, result] of results) {
    for (const field of result.droppedFields ?? []) {
      const agentNames = droppedByField.get(field) ?? [];
      agentNames.push(agents[agentType].displayName);
      droppedByField.set(field, agentNames);
    }
  }

  for (const [field, agentNames] of droppedByField) {
    p.log.warn(
      `${describeOptionalField(field)} is not supported by ${agentNames.join(", ")}; dropped from ${
        agentNames.length === 1 ? "that config" : "those configs"
      }.`,
    );
  }

  if (
    results.get("fx")?.success &&
    resolvedBearerTokenEnv &&
    serverConfig.headers &&
    Object.keys(serverConfig.headers).some(
      (name) => name.toLowerCase() === "authorization",
    )
  ) {
    p.log.warn(
      `Authorization header dropped from the fx config; fx reads the token from ${resolvedBearerTokenEnv}.`,
    );
  }

  if (options.gitignore && localAgents.length === 0) {
    p.log.warn(
      "--gitignore is only supported for project-scoped installations; ignoring.",
    );
  } else if (options.gitignore) {
    const successfulPaths = successful.flatMap(([_, result]) => [
      result.path,
      ...(result.extraPaths ?? []),
    ]);
    const gitignoreUpdate = updateGitignoreWithPaths(successfulPaths);
    if (gitignoreUpdate.added.length > 0) {
      p.log.info(
        `Added ${gitignoreUpdate.added.length} entr${
          gitignoreUpdate.added.length === 1 ? "y" : "ies"
        } to .gitignore`,
      );
    } else {
      p.log.info("No new local config paths to add to .gitignore");
    }
  }

  console.log();
  p.outro(chalk.green("Done!"));
}
