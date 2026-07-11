# Changelog

## Unreleased

- add `lm-studio` support with global installs written to `~/.lmstudio/mcp.json` (`mcpServers`)

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
