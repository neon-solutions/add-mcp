# add-mcp

A CLI to install MCP servers for different coding agents (Claude Code, Cursor, VS Code, OpenCode, Codex, Grok Build, Pi) with a single command.

## Dev environment

- Use bun as package manager and to run package.json scripts
- [Fallow](https://github.com/fallow-rs/fallow) is a local dev dependency (`bun run fallow`). It reports unused code, duplication, and complexity across the repo; fix what matters locally and ignore noise when appropriate. It does not run in GitHub Actions.

## Changelog

`CHANGELOG.md` is for **user-facing** changes only: new features and bug fixes that affect people using the CLI. Skip internal-only work (tooling, CI, dev dependencies, refactors with no behavior change). When you ship something that belongs in the changelog, add an entry in the same tone as existing ones and bump `package.json` per semver—often one entry + bump per release batch.

## Dev and PR workflow

1. **Branch from up-to-date `main`** — `git checkout main && git pull`.
2. **Implement the change** — keep the diff focused; match existing style and patterns.
3. **Tests** — add or extend tests so behavior and edge cases are covered by the spec. Prefer **unit tests without mocks** and **e2e tests without mocks** (this repo’s style).
4. **Typecheck** — `bun run typecheck`; fix all reported issues.
5. **Tests** — `bun run test`; fix failures.
6. **Quality pass** — run `bun run fmt`, then `bun run build`, `bun run typecheck`, and `bun run test` again so formatting, build, types, and tests are all green.
7. **Fallow** — `bun run fallow` (or `bun run fallow -- --summary`). Address findings that are clearly worth it; not every Fallow warning needs a code change.
8. **Release notes** — if the change is user-facing (feature or bug fix), add a short `CHANGELOG.md` entry and bump `package.json` per semver; otherwise skip the changelog.
9. **README** — update only if end users need to know about a new or changed feature.
10. **PR** — push your branch and open a pull request against `main`.

CI runs registry verification, typecheck, a subset of unit/e2e tests, and build. Keep local runs of the full `test` script green before you rely on CI.

## Releasing

`add-mcp` ships through a locked-down GitHub Actions pipeline using npm Trusted Publishing (OIDC), provenance attestation, and `npm stage publish` with WebAuthn-gated maintainer approval. **There is no supported `npm publish` from a laptop.** See [docs/RELEASING.md](docs/RELEASING.md) for the one-time setup checklist, per-release runbook, and break-glass procedure.
