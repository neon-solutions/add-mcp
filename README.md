# add-mcp

Add MCP servers to your favorite coding agents with a single command.

Supports **Claude Code**, **Codex**, **Cursor**, **OpenCode**, **VSCode** and [10 more](#supported-agents).

## Install an MCP Server

Install an MCP server by remote URL or package name:

```bash
npx add-mcp url | package name [options]
```

Example installing the Context7 remote MCP server:

```bash
npx add-mcp https://mcp.context7.com/mcp
```

Example installing the Context7 remote MCP server via the programmatic API — great for integrating add-mcp in your own CLI tool:

```ts
import { upsertServer } from "add-mcp";

const result = upsertServer(
  "cursor",
  "context7",
  { type: "http", url: "https://mcp.context7.com/mcp" },
  { local: true },
);
console.log(result);
```

You can add env variables and arguments (stdio) and headers (remote) to the server config using the `--env`, `--args` and `--header` options. With `${VAR}` placeholders, interactive installs prompt for each variable (omit skipped optional keys so empty strings are not written to config).

## Find an MCP Servers

Find and install MCP servers from the add-mcp curated registry and/or the official Anthropic MCP registry:

```bash
npx add-mcp find vercel
```

When running `find`/`search` for the first time, the CLI prompts you to choose which registries to enable (add-mcp curated registry and/or official Anthropic registry). You can also add custom registries to the configuration file.

## Supported Agents

MCP servers can be installed to any of these agents:

| Agent                  | `--agent`            | Project Path            | Global Path                                                                                                     |
| ---------------------- | -------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Antigravity            | `antigravity`        | -                       | `~/.gemini/antigravity/mcp_config.json`                                                                         |
| Cline VSCode Extension | `cline`              | -                       | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Cline CLI              | `cline-cli`          | -                       | `~/.cline/data/settings/cline_mcp_settings.json`                                                                |
| Claude Code            | `claude-code`        | `.mcp.json`             | `~/.claude.json`                                                                                                |
| Claude Desktop         | `claude-desktop`     | -                       | `~/Library/Application Support/Claude/claude_desktop_config.json`                                               |
| Codex                  | `codex`              | `.codex/config.toml`    | `~/.codex/config.toml`                                                                                          |
| Cursor                 | `cursor`             | `.cursor/mcp.json`      | `~/.cursor/mcp.json`                                                                                            |
| Gemini CLI             | `gemini-cli`         | `.gemini/settings.json` | `~/.gemini/settings.json`                                                                                       |
| Goose                  | `goose`              | `.goose/config.yaml`    | `~/.config/goose/config.yaml`                                                                                   |
| GitHub Copilot CLI     | `github-copilot-cli` | `.vscode/mcp.json`      | `~/.copilot/mcp-config.json`                                                                                    |
| MCPorter               | `mcporter`           | `config/mcporter.json`  | `~/.mcporter/mcporter.json` (or existing `~/.mcporter/mcporter.jsonc`)                                          |
| OpenCode               | `opencode`           | `opencode.json`         | `~/.config/opencode/opencode.json`                                                                              |
| VS Code                | `vscode`             | `.vscode/mcp.json`      | `~/Library/Application Support/Code/User/mcp.json`                                                              |
| Windsurf               | `windsurf`           | -                       | `~/.codeium/windsurf/mcp_config.json`                                                                           |
| Zed                    | `zed`                | `.zed/settings.json`    | `~/Library/Application Support/Zed/settings.json`                                                               |

**Aliases:** `codeium`, `cascade` → `windsurf`, `cline-vscode` → `cline`, `gemini` → `gemini-cli`, `github-copilot` → `vscode`

## Installation Scope

| Scope       | Flag      | Location                | Use Case                                      |
| ----------- | --------- | ----------------------- | --------------------------------------------- |
| **Project** | (default) | `.cursor/mcp.json` etc. | Committed with your project, shared with team |
| **Global**  | `-g`      | `~/.cursor/mcp.json`    | Available across all projects                 |

## Smart Detection

The CLI automatically detects agents based on your environment:

**Default (project mode):**

- Detects project-level config files (`.cursor/`, `.vscode/`, `.mcp.json`, etc.)
- Selects detected agents (have project config in the current directory) by default
- Shows detected agents plus all other supported agents for selection

**With `-g` (global mode):**

- Detects all globally-installed agents (including Claude Desktop, Codex, Zed)
- Selects detected agents by default
- Shows detected agents plus all other supported agents for selection

**No agents detected:**

- Interactive mode: Defaults to the last selection and shows all agents for selection
- With `--yes`: Installs to all project-capable agents (project mode) or all global-capable agents (global mode)

## Commands

Besides the implicit add command, `add-mcp` also supports the following commands:

| Command       | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `find`        | Search MCP registry servers and install a selected match     |
| `search`      | Alias for `find`                                             |
| `list`        | List installed MCP servers across detected agents            |
| `remove`      | Remove an MCP server from agent configurations               |
| `sync`        | Synchronize server names and installations across agents     |
| `unify`       | Alias for `sync`                                             |
| `list-agents` | List all supported coding agents with scope (project/global) |

## Add Command

### Usage Examples

```bash
# Remote MCP server (streamable HTTP)
npx add-mcp https://mcp.example.com/mcp

# Remote MCP server (SSE transport)
npx add-mcp https://mcp.example.com/sse --transport sse

# Remote MCP server with auth header
npx add-mcp https://mcp.example.com/mcp --header "Authorization: Bearer $TOKEN"

# npm package (runs via npx)
npx add-mcp @modelcontextprotocol/server-postgres

# Non-interactive installation to all detected agents in the project directory
npx add-mcp https://mcp.example.com/mcp -y

# Non-interactive installation to the global Claude Code config
npx add-mcp https://mcp.example.com/mcp -g -a claude-code -y

# Full command with arguments
npx add-mcp "npx -y @org/mcp-server --flag value"

# Node.js script
npx add-mcp "node /path/to/server.js --port 3000"

# Local stdio server with environment variables (repeatable)
npx add-mcp @modelcontextprotocol/server-filesystem --env "API_KEY=secret" --env "DATABASE_URL=postgres://localhost/app"

# Install for Cursor and Claude Code
npx add-mcp https://mcp.example.com/mcp -a cursor -a claude-code

# Install with custom server name
npx add-mcp @modelcontextprotocol/server-postgres --name postgres

# Install to all supported agents
npx add-mcp mcp-server-github --all

# Install to all agents, globally, without prompts
npx add-mcp mcp-server-github --all -g -y

# Add generated config files to .gitignore
npx add-mcp https://mcp.example.com/mcp -a cursor -y --gitignore
```

### Options

| Option                   | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `-g, --global`           | Install to user directory instead of project                             |
| `-a, --agent <agent>`    | Target specific agents (e.g., `cursor`, `claude-code`). Can be repeated. |
| `-t, --transport <type>` | Transport type for remote servers: `http` (default), `sse`               |
| `--type <type>`          | Alias for `--transport`                                                  |
| `-h, --header <header>`  | HTTP header for remote servers (repeatable, `Key: Value`)                |
| `--env <env>`            | Env var for local stdio servers (repeatable, `KEY=VALUE`)                |
| `-n, --name <name>`      | Server name (auto-inferred if not provided)                              |
| `-y, --yes`              | Skip all confirmation prompts                                            |
| `--all`                  | Install to all agents                                                    |
| `--gitignore`            | Add generated config files to `.gitignore`                               |

### Transport Types

`add-mcp` supports all three transport types: HTTP, SSE, and stdio. Some agents require `type` option to be set to specify the transport type. You can use the `--type` or `--transport` option to specify the transport type:

| Transport | Flag               | Description                                           |
| --------- | ------------------ | ----------------------------------------------------- |
| **HTTP**  | `--transport http` | Streamable HTTP (default)                             |
| **SSE**   | `--transport sse`  | Server-Sent Events (deprecated by MCP but still used) |

Local servers (npm packages, commands) always use **stdio** transport.

Note that most agents like Cursor and opencode do not require the `type` information to be set.

## Find Command

### Usage Examples

```bash
# Search for servers by keyword and choose one interactively
npx add-mcp find vercel

# Browse servers without a keyword
npx add-mcp find

# Use search alias (same as find)
npx add-mcp search notion

# Install a found server globally to a specific agent without prompts
npx add-mcp find neon -a claude-code -g -y

# Install to all agents and add generated project configs to .gitignore
npx add-mcp find github --all --gitignore
```

### Options

| Option                | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `-g, --global`        | Install to user directory instead of project                             |
| `-a, --agent <agent>` | Target specific agents (e.g., `cursor`, `claude-code`). Can be repeated. |
| `-n, --name <name>`   | Server name override (defaults to the selected catalog entry name)       |
| `-y, --yes`           | Skip confirmation prompts                                                |
| `--all`               | Install to all agents                                                    |
| `--gitignore`         | Add generated config files to `.gitignore`                               |

Transport for `find`/`search` is inferred from registry metadata. The CLI prefers HTTP remotes when available and only falls back to SSE when HTTP is not available for the selected install context.

When a server offers both remote and stdio package options, interactive mode lets you choose one (remote is the default). With `-y`, it auto-selects remote.

If a selected remote server defines URL variables or header inputs:

- required values must be provided
- optional values can be skipped with Enter
- with `-y`, placeholders are inserted (for example `<your-header-value-here>`)

### Configuring Registries for Find / Search

The first time you run `find` or `search`, the CLI prompts you to choose which registries to enable. Your selection is saved to `~/.config/add-mcp/config.json` (respects `XDG_CONFIG_HOME`) and reused on every subsequent search.

If you run with `-y` before this one-time registry setup is completed, the CLI exits with guidance to rerun without `--yes`.

### Built-in Registries

| Registry                        | Base URL                                                | Description                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **add-mcp curated registry**    | `https://mcp.agent-tooling.dev/api/v1/servers`          | A curated list of first-party, verified MCP servers from popular developer tools and SaaS services. Designed to surface high-quality, officially maintained servers instead of a long tail of unmaintained or third-party entries. |
| **Official Anthropic registry** | `https://registry.modelcontextprotocol.io/v0.1/servers` | The community-driven MCP server registry maintained by Anthropic. Contains the broadest catalog of MCP servers.                                                                                                                    |

### Missing A Server in add-mcp Curated Registry?

The source of truth for the add-mcp curated registry is [registry.json](registry.json) in this repository. You can contribute to the registry by opening a pull request to add or update a server.

### Editing or Removing Registries

Registry selections are stored in `~/.config/add-mcp/config.json` under the `findRegistries` key. You can edit this file directly to add, remove, or reorder registries:

```json
{
  "version": 1,
  "findRegistries": [
    {
      "url": "https://mcp.agent-tooling.dev/api/v1/servers",
      "label": "add-mcp curated registry"
    },
    {
      "url": "https://registry.modelcontextprotocol.io/v0.1/servers",
      "label": "Official Anthropic registry"
    }
  ]
}
```

To reset and re-trigger the interactive selection prompt, remove the `findRegistries` key (or delete the file entirely).

### Adding a Custom Registry

Any server that implements the registry API can be added as a custom entry. The CLI sends a `GET` request to the configured `url` with the following query parameters:

| Parameter | Value                                  |
| --------- | -------------------------------------- |
| `search`  | The user's search keyword (lowercased) |
| `version` | `latest`                               |
| `limit`   | `100`                                  |

The endpoint must return JSON in this shape:

```json
{
  "servers": [
    {
      "server": {
        "name": "example-server",
        "description": "An example MCP server",
        "version": "1.0.0",
        "remotes": [
          {
            "type": "streamable-http",
            "url": "https://mcp.example.com/mcp"
          }
        ]
      }
    }
  ]
}
```

To add your own registry, append an entry to `findRegistries` in `~/.config/add-mcp/config.json`:

```json
{
  "url": "https://my-registry.example.com/api/v1/servers",
  "label": "My custom registry"
}
```

## List Command

List installed MCP servers across detected agents:

```bash
# List servers for all detected agents in the project
npx add-mcp list

# List global server configs
npx add-mcp list -g

# List servers for a specific agent (shown even if not detected)
npx add-mcp list -a cursor
```

| Option                | Description                            |
| --------------------- | -------------------------------------- |
| `-g, --global`        | List global configs instead of project |
| `-a, --agent <agent>` | Filter to specific agent(s)            |

## Remove Command

Remove an MCP server from agent configurations by server name, URL, or package name:

```bash
# Remove by server name (interactive selection by default)
npx add-mcp remove neon

# Remove all matches without prompting
npx add-mcp remove neon -y

# Remove by URL
npx add-mcp remove https://mcp.neon.tech/mcp -y

# Remove from global configs for a specific agent
npx add-mcp remove neon -g -a cursor -y
```

| Option                | Description                          |
| --------------------- | ------------------------------------ |
| `-g, --global`        | Remove from global configs           |
| `-a, --agent <agent>` | Filter to specific agent(s)          |
| `-y, --yes`           | Remove all matches without prompting |

## Sync Command

Synchronize server names and installations across all detected agents. Servers are grouped by URL or package name, and each group is unified to the shortest server name. Servers with conflicting headers, env, or args across agents are skipped with a warning.

```bash
# Sync project-level configs (interactive confirmation)
npx add-mcp sync

# Sync without prompting
npx add-mcp sync -y

# Sync global configs
npx add-mcp sync -g -y
```

| Option         | Description                            |
| -------------- | -------------------------------------- |
| `-g, --global` | Sync global configs instead of project |
| `-y, --yes`    | Skip confirmation prompts              |

`unify` is an alias for `sync`.

## Programmatic API

```ts
import {
  detectProjectAgents,
  detectGlobalAgents,
  upsertServer,
  removeServer,
  listInstalledServers,
} from "add-mcp";

const project = detectProjectAgents("/path/to/project");
const global = await detectGlobalAgents();

// Remote server
upsertServer(
  "claude-code",
  "example",
  { type: "http", url: "https://mcp.example.com/api" },
  { local: true, cwd: "/path/to/project" },
);

// Stdio (npm package)
upsertServer("claude-code", "postgres", {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-postgres"],
});

const projectServers = await listInstalledServers({
  cwd: "/path/to/project",
});
const globalServers = await listInstalledServers({ global: true });

removeServer("claude-code", "example", {
  local: true,
  cwd: "/path/to/project",
});
```

`upsertServer` and `removeServer` return `{ success, path, error? }` rather than throwing.

## Troubleshooting

### Server not loading

Some agents & editors like Claude Code require a restart to load the new MCP server. Otherwise, like Cursor, require you to navigate to the MCP settings page and toggle the new server as enabled.
