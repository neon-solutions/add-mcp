# Changelog

## [2.3.0] - 2026-08-23

- add `pi` support through the `pi-mcp-adapter` extension, with project installs to `.pi/mcp.json` and global installs to `$PI_CODING_AGENT_DIR/mcp.json` (default `~/.pi/agent/mcp.json`), including native `requestTimeoutMs` mapping.

## [2.2.0] - 2026-08-23

- add `fx` support with global installs to `~/.fx/mcp.json`, using fx's `mcp` config key, `local`/`http`/`sse` server types, a command array for stdio, and `environment`. fx does not load repository-local MCP files, so there is no project install path. A literal `Authorization` header is rejected rather than written, because fx refuses that header at runtime.
- fix `sync` comparing command-array agents against `args` as stored, so a Cursor `command`/`args` pair and an fx command array for the same package no longer look like a conflict.

## [2.1.0] - 2026-08-12

- add `kilo-code` support with project installs to `kilo.json` and global installs to `~/.config/kilo/kilo.json`, using Kilo Code's `mcp` config key, `local`/`remote` server types, and per-server `timeout`. Existing `.kilo/`, `.kilocode/`, and root `kilo.jsonc` configs are reused instead of creating a second config; aliases: `kilo`, `kilocode`.
- add `kiro-cli` support with project installs to `.kiro/settings/mcp.json` and global installs to `~/.kiro/settings/mcp.json` (the same files the Kiro IDE reads), covering stdio and remote servers plus a native millisecond `timeout`; alias: `kiro`. Co-authored with @donatoaz ([#36](https://github.com/neon-solutions/add-mcp/pull/36))
- add `kimi-code` support with project installs to `.kimi-code/mcp.json` and global installs to `$KIMI_CODE_HOME/mcp.json` (default `~/.kimi-code/mcp.json`), using Kimi Code's `mcpServers` key, explicit `transport` field, and `toolTimeoutMs`; alias: `kimi`.
- fix `list`, `find`, `remove`, and `sync` for OpenCode-style servers that store the command and its arguments as a single array, which previously read as an empty entry and could not be matched or synced to other agents.
- prefer OpenCode's `opencode.jsonc` over `opencode.json` when both exist, write jsonc when neither does, and reuse an existing `.opencode/` config instead of creating a second file at the project root ([#96](https://github.com/neon-solutions/add-mcp/pull/96))

## [2.0.0] - 2026-07-22

- **BREAKING:** re-installing a server under an existing name now replaces that server's entire entry instead of deep-merging the new fields into the old entry. Callers that relied on omitted fields surviving a re-install must now pass the complete desired server configuration. This prevents stale fields from producing invalid hybrid configs — most damaging when an old stdio entry (`command`/`args`/`env`) was combined with a new remote install (`type`/`url`). Applies to the TOML, JSON, and YAML writers; unrelated servers and all other config sections are still preserved ([#83](https://github.com/neon-solutions/add-mcp/pull/83))
- add `grok-build` support with project installs to `.grok/config.toml` and global installs to `$GROK_HOME/config.toml` (default `~/.grok/config.toml`), using native `mcp_servers` TOML tables and `tool_timeout_sec`; alias: `grok`. Co-authored with @franjorub

## [1.14.1] - 2026-07-22

- recognize Gemini CLI's legacy `httpUrl` field across `list`, `remove`, and `sync`, preserving the endpoint and headers when syncing the server to other agents. Co-authored with @preciousimo ([#33](https://github.com/neon-solutions/add-mcp/issues/33), [#79](https://github.com/neon-solutions/add-mcp/pull/79))

## [1.14.0] - 2026-07-06

- move the default `find` / `search` registry to its new home at `https://add-mcp.com/registry/api/v1/servers` (label: "add-mcp registry"). The previous `mcp.agent-tooling.dev` URL keeps working; saved configs referencing it are migrated automatically on the next `find` / `search` run (custom labels are preserved, duplicates are deduped).

## [1.13.3] - 2026-07-06

- show registry result install targets, such as remote MCP URLs or package names, instead of reverse-domain registry IDs in `find` / `search` selection rows.

## [1.13.2] - 2026-07-06

- make `find` / `search` default to the integrations.sh registry on first run instead of prompting for an initial registry selection.

## [1.13.1] - 2026-07-05

- expand the `find` / `search` registry from integrations.sh data and update registry messaging to point maintainers to integrations.sh.

## [1.13.0] - 2026-06-29

- add interactive project/global scope selection after agent selection when every selected agent supports both scopes; `-g` still forces global and `-y` stays deterministic.
- use one shared install scope per run: selections that include any global-only agent now install globally for all selected agents instead of mixing project and global configs.

## [1.12.0] - 2026-06-21

- add `--auto-approve` and repeatable `--approve-tool <tool>` to preconfigure agent-level MCP tool approval. Capability-gated per client and mapped to each client's native mechanism: Codex writes approval modes to `config.toml` (`tools.<name>.approval_mode = "approve"`, or `default_tools_approval_mode` for all tools); Claude Code writes permission allow rules (`mcp__<server>__<tool>`, or `mcp__<server>` for all tools) to a separate settings file (`.claude/settings.local.json` for project installs, `~/.claude/settings.json` for global) while keeping the MCP server entry clean. Agents that don't support auto-approval have it dropped with a warning. Co-authored with @RhysSullivan ([#32](https://github.com/neon-solutions/add-mcp/pull/32))
- update Antigravity configuration to the latest shared MCP config path at `~/.gemini/config/mcp_config.json`, used by Antigravity, Antigravity IDE, and Antigravity CLI.

## [1.11.0] - 2026-06-20

- add `--timeout <ms>` and `--scopes <scopes>` (alias `--oauth-scopes`) flags for remote servers. Fields are capability-gated per client and mapped to each client's native shape: `--timeout` → Claude Code / Gemini CLI `timeout`; `--scopes` → Cursor `auth.scopes` and Gemini CLI `oauth.scopes`. Agents that don't support a field have it dropped with a warning, so other agents still receive it ([#51](https://github.com/neon-solutions/add-mcp/issues/51))
- make `transformConfig` required for every agent and gate writes through a single canonical schema, so only known fields are ever written to a client config (previously Claude Code, Claude Desktop, Gemini CLI, VS Code, and mcporter wrote the raw config and could leak unknown fields)

## [1.10.4] - 2026-05-23

- add `-h` shorthand for `--header` (use `--help` for help)

## [1.10.3] - 2026-05-23

- add `windsurf` support with global installs written to `~/.codeium/windsurf/mcp_config.json` (`mcpServers`); aliases: `codeium`, `cascade` ([#31](https://github.com/neon-solutions/add-mcp/pull/31))

## [1.10.2] - 2026-05-23

- fix command targets containing absolute, home-relative, dot-relative, or Windows drive paths to stay intact as the single executable command — previously `add-mcp "/Applications/My App/bin/server"` was naively split on spaces, producing `command: "/Applications/My"` with the rest treated as args (regression for paths with spaces, e.g. macOS `.app` bundles); use `--args` to pass arguments alongside a path target ([#29](https://github.com/neon-solutions/add-mcp/issues/29))

## [1.10.1] - 2026-05-22

- use single quotes in `--header` / `--env` "Use 'Key: Value' format." error messages so the example matches the recommended shell-quoting style (was double quotes, which contradicted the shell-expansion hint that recommends single quotes)

## [1.10.0] - 2026-05-21

- expose programmatic API

## [1.9.1] - 2026-05-21

- reject `--env "KEY="` with empty value (previously silently written to agent config, breaking the MCP server at runtime); error message now hints at shell expansion when a `${VAR}` was likely eaten
- hint at shell expansion in the `--header` error message when a value is empty (`--header "Key: ${UNSET}"` after the shell ate the placeholder) — suggests using single quotes to pass the `${VAR}` template literally
- option help text for `--header`, `--env`, and `--args` now mentions the single-quote requirement so the shell does not expand `${VAR}` placeholders

## [1.9.0] - 2026-05-21

- prompt for `${VAR}` template values in `--env`, `--header`, and `--args` flags during interactive mode (skipped optional keys are omitted from written config)
- prompt for package environment variables, headers, and registry `packageArguments` during `find` search installs (named flags preserved as `flag` + `value` argv pairs; positional order preserved; `-y` substitutes `${VAR}` with placeholders)
- fix `find` package installs to align argv ordering with registry `packageArguments`
- allow `pypi` `registryType` in registry entries used by `find`/`search`

## [1.8.1] - 2026-04-07

- fix `find` / `search` package installs to stop pinning npm versions and resolve latest implicitly

## [1.8.0] - 2026-04-05

- add `list` command to display installed MCP servers across detected agents
- add `sync` / `unify` command to synchronize server configurations across agents
- add `remove` command to remove MCP servers from agent configurations

## [1.7.0] - 2026-03-29

- add `find` / `search` command to search MCP registries and install servers
- deprecated `~/.agents/.mcp-lock.json` in favor of `~/.config/add-mcp/config.json`

## [1.6.0] - 2026-03-29

- add repeatable `--env KEY=VALUE` support for local stdio installs (package and command sources)

## [1.5.1] - 2026-03-01

- update Antigravity to support remote MCP servers via `serverUrl` config

## [1.5.0] - 2026-02-28

- Add support for Antigravity

## [1.4.0] - 2026-02-28

- Add support for MCPorter

## [1.3.0] - 2026-02-26

- Add support for Cline VSCode Extension and Cline CLI

## [1.2.2] - 2026-02-21

- fix Goose remote HTTP/SSE header support and simplify header capability handling
- fix Claude Desktop config to only support stdio (remote servers must be added through the Claude Desktop UI)

## [1.2.1] - 2026-02-17

fix Codex remote HTTP header key mapping

## [1.2.0] - 2026-02-16

add `--gitignore` option to append generated project MCP config paths to `.gitignore`

## [1.1.0] - 2026-02-14

add `github-copilot-cli` (Copilot CLI) support with project installs written to `.vscode/mcp.json` (same as VS Code) and global installs written to `~/.copilot/mcp-config.json` (`mcpServers`)

## [1.0.1] - 2026-02-14

fix OpenCode config detection and MCP command generation

## [1.0.0] - 2026-02-09

v1 release 🎉
