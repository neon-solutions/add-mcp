# Releasing `add-mcp`

This document is the authoritative guide for publishing `add-mcp` to npm. It covers the threat model, the one-time setup of the secure publishing pipeline, the per-release runbook, and the break-glass procedure if something goes wrong.

`add-mcp` does **not** support publishing from a maintainer's laptop. Every published version must pass through the GitHub Actions release workflow with OIDC trusted publishing, provenance, and a manual stage-approval step on npm.

## Why

Recent npm supply-chain incidents (Shai-Hulud, repeated maintainer-account takeovers, leaked CI tokens) almost all stem from one root cause: **long-lived npm publish tokens stored somewhere**. The pipeline below removes that root cause and adds two independent gates between "commit on `main`" and "live on the registry":

1. **Click "Publish release" on GitHub** — confirms the commit and version are intentional.
2. **`npm stage approve add-mcp` with WebAuthn** — confirms the actual tarball CI produced is what should go live.

Either gate alone is enough to stop a bad publish.

## Pipeline architecture

```mermaid
flowchart LR
    devCommit[Commit on main] --> ghRelease["Maintainer publishes GitHub Release vX.Y.Z"]
    ghRelease --> tagProt["Tag-protection rule allows tag"]
    tagProt --> ciRun["release.yml runs on GitHub-hosted runner"]
    ciRun --> oidc["GitHub mints OIDC token (id-token: write)"]
    oidc --> npmStage["npm stage publish --provenance"]
    npmStage --> staging["Package sits in npm staging area"]
    staging --> review["Maintainer: npm stage view add-mcp"]
    review --> approve["npm stage approve add-mcp (WebAuthn)"]
    approve --> live["Live on registry.npmjs.org with provenance"]
```

### Defensive primitives in play

- **npm Trusted Publishing (OIDC)** — npm only accepts a publish from `release.yml` in `neon-solutions/add-mcp`, authenticated by a short-lived OIDC token GitHub mints per run. No long-lived tokens exist anywhere.
- **npm provenance attestation** — every published version is cryptographically signed via Sigstore and bound to the exact GitHub commit and workflow that built it. Anyone can run `npm audit signatures` to verify.
- **"Require 2FA and disallow tokens"** on the package — registry-side switch that refuses any publish that is not OIDC + 2FA, even if an attacker steals a legacy token.
- **npm staged publishing** — `release.yml` runs `npm stage publish`, not `npm publish`. The tarball lands in a staging area; the maintainer inspects it and approves with WebAuthn before it goes live.
- **GitHub tag-protection rules** — only maintainers can create the `v*` tag that ships with a Release.
- **WebAuthn/passkey 2FA** on the npm account — phishing-resistant (TOTP is being phased out by npm).
- **SHA-pinned third-party Actions** in `release.yml` — neutralises Action-side compromises (a malicious force-push to a tag cannot move the pin).

## One-time setup checklist

Work through these top to bottom. None of them can be automated; they are all in the npm and GitHub web UIs. Tick each off when done.

### A. npm account hardening

> Done under your personal npm user, not the package.

- [ ] **A1.** Enable WebAuthn/passkey 2FA at `https://www.npmjs.com/settings/<your-username>/2fa`. If TOTP is your only second factor, enroll a passkey and then remove TOTP. New TOTP setups are disabled by npm and existing TOTP is being phased out.
- [ ] **A2.** Revoke every existing publish token at `https://www.npmjs.com/settings/<your-username>/tokens` that grants write access to `add-mcp`. After trusted publishing is configured, nothing should need one.

### B. npm package configuration

> Done on the `add-mcp` package page on npmjs.com.

- [ ] **B1.** Go to `https://www.npmjs.com/package/add-mcp/access`. Under **Trusted Publisher**, click **GitHub Actions** and enter:
  - Organization: `neon-solutions`
  - Repository: `add-mcp`
  - Workflow filename: `release.yml`
  - Allowed actions: select **`npm stage publish` only**. **Do not** check `npm publish`.
  - Save.

  Selecting stage-only is the single most important hardening switch in this whole pipeline: it forces every CI publish through the stage-approve gate. Even if `release.yml` were compromised, the attacker still cannot push live without your WebAuthn approval.

- [ ] **B2.** On the same page, find **Publishing access** and choose **"Require two-factor authentication and disallow tokens"**. Save. From this point any publish that is not OIDC + 2FA-approved staged release is rejected by the registry.

### C. GitHub repository configuration (`neon-solutions/add-mcp`)

- [ ] **C1.** Settings -> Rules -> Rulesets -> **New tag ruleset**. Name it "release tags". Target tags matching `v*`. Enable "Restrict creations", "Restrict updates", and "Restrict deletions". Add yourself (and any future co-maintainers) to the bypass list. Save.
- [ ] **C2.** Settings -> Actions -> General -> **Workflow permissions** = "Read repository contents and packages permissions" (the more restrictive of the two radio buttons). Job-level `id-token: write` in `release.yml` still works because workflow files can request additional permissions explicitly, but they cannot exceed what the repo allows globally.
- [ ] **C3.** Settings -> Actions -> General -> **Allow GitHub Actions to create and approve pull requests** = OFF.
- [ ] **C4.** (Recommended) Settings -> Branches -> branch-protection rule on `main`: require pull requests, require CI green, require signed commits, no force-push, no deletions. This is your last line of defence against a malicious commit landing right before a tag.

### D. First-release smoke test

- [ ] **D1.** Cut a patch release through the runbook below (e.g. `v1.9.1` with an empty CHANGELOG entry like "internal: validate release pipeline"). Walk through the stage-review step slowly: open the staged tarball on npmjs.com, confirm the file list matches `package.json#files` (`dist/`, `README.md`), confirm the provenance attestation badge appears, then approve. Once the version is live, run `npm audit signatures add-mcp@1.9.1` to verify Sigstore signatures end to end.

## Per-release runbook

Follow this every time you ship a new version. The whole sequence is typically 5-10 minutes of attended work; everything in step 5 is automated.

1. **Sync `main`.**

   ```bash
   git checkout main && git pull
   ```

2. **Make sure everything you want shipped is on `main`** and the existing CI is green for that commit. All feature work lands via normal PRs first.

3. **Bump the version and changelog locally.**
   - Edit `package.json` `version` according to semver (see "Versioning" below).
   - Add an entry at the top of `CHANGELOG.md` matching the existing tone.
   - Commit as `chore: release vX.Y.Z` and push to `main`.

4. **Draft and publish the GitHub Release.**
   - On `https://github.com/neon-solutions/add-mcp/releases`, click **Draft a new release**.
   - "Choose a tag" -> type `vX.Y.Z` (must match `package.json#version`; the workflow will fail fast if they disagree).
   - Target: `main`.
   - Title: `vX.Y.Z`.
   - Body: paste the CHANGELOG entry.
   - Click **Publish release**. This creates the tag and fires `release.yml`.

5. **Wait for CI.** `release.yml` runs typecheck, tests, build, then `npm stage publish --provenance`. Watch it on the Actions tab. On green, the package is in npm staging, **not** live.

6. **Review the staged tarball.**

   ```bash
   npm stage list             # shows pending staged versions for packages you maintain
   npm stage view add-mcp     # inspect the staged release for add-mcp
   ```

   Verify:
   - The version number matches what you intended.
   - The file list is exactly `dist/` plus `README.md` (whatever `package.json#files` whitelists), with no surprise files.
   - The shasum matches the workflow run's published artifact.
   - The provenance attestation references the correct commit SHA.

7. **Approve.**

   ```bash
   npm stage approve add-mcp  # prompts for WebAuthn
   ```

   The package goes live.

8. **Verify it landed correctly.**

   ```bash
   npm view add-mcp version
   npm view add-mcp dist-tags
   npm audit signatures add-mcp@X.Y.Z
   ```

9. **If anything looked wrong at step 6, reject instead of approving.**

   ```bash
   npm stage reject add-mcp
   ```

   Nothing is published. Investigate, fix on a branch, cut a new patch release.

### Versioning

`add-mcp` follows semver. As a rough guide:

- **patch** — bug fixes, registry adds, internal-only changes that do not alter behaviour.
- **minor** — new features, new agent support, new flags. Backward-compatible.
- **major** — breaking changes to flags, config locations, or behaviour. Add a migration note to the CHANGELOG.

## Break-glass procedures

### Stolen / lost passkey suspected

1. On a separate trusted device, sign in to npmjs.com.
2. Remove the compromised device from `https://www.npmjs.com/settings/<your-username>/2fa`.
3. Enroll a fresh passkey.
4. No tokens need rotating; trusted publishing keeps working unchanged.

### Suspected repository compromise (malicious PR, force-push, etc.)

1. Disable the trusted-publisher binding on `https://www.npmjs.com/package/add-mcp/access` to halt all CI publishes immediately.
2. Audit `main`, the `release.yml` workflow, and the `v*` tag history.
3. Once clean, re-enable the trusted publisher and ship a clean release.

Note: even without step 1, an attacker cannot directly publish from a PR branch or a fork because OIDC only accepts publishes from `release.yml` on `neon-solutions/add-mcp`'s default branch flow. Tag protection prevents them from triggering the real `release.yml`. Step 1 is belt and braces.

### Emergency publish when CI is broken

By design you cannot publish from a laptop. The escape hatch:

1. On npmjs.com, **Publishing access** -> flip **"Require two-factor authentication and disallow tokens"** off temporarily.
2. Create a granular access token with a 7-day expiry scoped to `add-mcp` only.
3. Publish locally with that token.
4. Revoke the token immediately.
5. Flip "Require 2FA and disallow tokens" back on.
6. Open an issue describing what broke in CI and fix it before the next release.

If/when there is a second maintainer, this escape hatch must require their explicit sign-off before being used.

## Out of scope (intentional)

- **Dependency pinning / Dependabot / lockfile-lint.** Complementary supply-chain hardening; not in this doc.
- **Reproducible builds.** `tsup` output is not byte-reproducible across Node versions. The provenance attestation proves "this exact tarball came from this exact commit via this exact workflow," which is the security property that matters.
- **Sigstore verification of installed dependencies (`npm audit signatures` in CI).** Worth adding as a follow-up; not required for the publish-side hardening this document covers.
