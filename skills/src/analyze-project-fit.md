---
name: analyze-project-fit
---

## When to use

Read-only diagnostic that inspects the user's project (package.json, framework, React version, Contentstack deps) and emits a tailored install path before any state-changing skill runs.

Use as the FIRST step when the user wants to add Studio to an existing project, or is unsure if their setup is compatible. Phrases: "add Studio to my app", "is my project compatible", "before I install". Always run before `install-studio`, `install-live-preview`, or `setup-section-preview`. Skip if already run this session.

> **Auth preflight: settle the credential before the first API call.** Resolve it OAuth-first per [`authenticate-cma`](authenticate-cma.md): `CS_OAUTH_ACCESS_TOKEN`, else the Contentstack MCP's stored session. **Never ask the user for a session `authtoken`.** If nothing resolves, or a refresh fails with `400 invalid_refresh_token`, hand them `! CONTENTSTACK_REGION=<code> npx @contentstack/mcp --auth` (it needs a TTY and a browser, so it cannot be run for them) and wait. `403 error_code 316` is a valid credential aimed at another org: fix the org or the `api_key`, do **not** re-authenticate.

# Analyze project fit: pre-flight diagnostic for Studio install

## Why this skill exists

`install-studio` assumes a known project shape. In reality projects vary across:

- **React version**: the SDK is built for React 18. React 19 is unsupported. The SDK's peerDep is now `react ^18.0.0`, so npm/pnpm refuse to install Studio on a React 19 project: the incompatibility surfaces immediately at install rather than at runtime.
- **Framework**: Next.js needs `NEXT_PUBLIC_*` env prefixes and SSR-safe init, Vite needs `dedupe` and a prod-build canvas, CRA needs `REACT_APP_*`.
- **Bundler quirks**: Next 16 + Turbopack has tree-shake edge cases. Custom webpack configs may not externalize React.
- **Existing Contentstack SDKs**: adding Studio to an app that already has `@contentstack/delivery-sdk` is a minimal-add, not a greenfield install.
- **Local serving**: Studio iframes the canvas. `http://localhost` is mixed-content blocked, a self-signed HTTPS cert is untrusted, mkcert must be installed.

Running blind through `install-studio` against these variants is what produces the long debug sessions documented in `STUDIO_INTEGRATION_ISSUES.md` (React 19 hook-call, dev-optimizer dual React, missing trusted HTTPS, etc.). This skill front-loads the inspection so the next skill receives a clean, known shape.

This skill is **read-only**. It never writes files, never installs packages, never modifies the project. It produces a plan, the user confirms, then the appropriate downstream skill runs.

## Task

### 1. Inspect the project (no writes)

Run these checks in order:

```bash
# 1a. package.json — root + workspace packages if monorepo
cat {{projectRoot}}/package.json

# 1b. Lockfile → package manager
ls {{projectRoot}}/pnpm-lock.yaml {{projectRoot}}/yarn.lock {{projectRoot}}/package-lock.json {{projectRoot}}/bun.lockb 2>/dev/null

# 1c. Workspace / monorepo signals
ls {{projectRoot}}/turbo.json {{projectRoot}}/pnpm-workspace.yaml {{projectRoot}}/nx.json {{projectRoot}}/lerna.json 2>/dev/null

# 1d. TypeScript presence
ls {{projectRoot}}/tsconfig.json 2>/dev/null

# 1e. Single React check (the dual-React problem)
cd {{projectRoot}} && npm ls react 2>&1 | head -20

# 1f. Bundler configs
ls {{projectRoot}}/vite.config.* {{projectRoot}}/next.config.* {{projectRoot}}/webpack.config.* {{projectRoot}}/tsup.config.* 2>/dev/null

# 1g. Local HTTPS readiness
which mkcert ; ls {{projectRoot}}/certs/*.pem 2>/dev/null

# 1h. Deploy target
ls {{projectRoot}}/.vercel/ {{projectRoot}}/netlify.toml {{projectRoot}}/vercel.json {{projectRoot}}/wrangler.toml 2>/dev/null
```

### 2. Classify the project

From the output above, extract:

| Signal | Detection rule |
|---|---|
| **Framework** | `package.json` deps: `next` means Next.js, `vite` means Vite, `react-scripts` means CRA, `@remix-run/*` means Remix, `astro` means Astro, and anything else is Custom |
| **React version** | the `react` field in `package.json` deps gives the version range. Resolve to the actual installed major via `npm ls react`. Classify as **18**, **19**, **17 or older** |
| **Single React** | `npm ls react` must show exactly one tree entry on 18.x: if it shows two entries or a deduped warning, that's a duplicate risk |
| **Package manager** | `pnpm-lock.yaml` means pnpm, `yarn.lock` means yarn, `bun.lockb` means bun, and `package-lock.json` means npm |
| **TypeScript** | `tsconfig.json` exists |
| **Monorepo** | Any of `turbo.json` / `pnpm-workspace.yaml` / `nx.json` / `lerna.json` |
| **Existing Studio integration** | Any `@contentstack/studio-*` already in deps |
| **Existing CS app** | Any `@contentstack/*` already in deps (not Studio), implies minimal-add |
| **Next + Turbopack** | Next deps + `next dev --turbo` or `next dev --turbopack` in scripts |
| **mkcert ready** | `which mkcert` returns a path |
| **Data center / region** | See § 2b: Determine the data center below. **Never skip this.** |

### 2b. Determine the data center: prod region vs non-prod (dev11, stag, …)

**Nothing else in the skill pack figures this out, and several skills assume you already have.** Establish it here, once, and carry it forward.

**Why it matters more than it looks.** The Delivery SDK defaults to the **US prod CDA**, and the Studio React SDK derives its Studio API host from whatever stack you hand it. So a project targeting dev11 that never sets `host:` will silently read and write **prod**, no error, no warning, wrong data centre. Non-prod also has no `region` shortcut: every host must be overridden explicitly (`install-studio` § Regional host map).

Resolve in this order, stopping at the first hit:

```bash
# 1. Explicit host already in the app?
grep -rn "csnonprod\|host:\|CONTENTSTACK_HOST\|_CDA_HOST\|region" .env* src/ app/ lib/ 2>/dev/null | head

# 2. Region shortcut in use? (prod only — NA/EU/AU/AZURE_NA/AZURE_EU/GCP_NA/GCP_EU)
grep -rn "region:\s*['\"]" src/ app/ lib/ 2>/dev/null | head
```

3. **Ask, if neither is conclusive**: and ask for the URL, not the name, because the URL is unambiguous:

   > Which Contentstack environment is this stack on? Paste the URL you use to open Contentstack: `app.contentstack.com` (US prod), a regional prod host, or something like `dev11-app.csnonprod.com` (non-prod).

The editor URL determines every other host. For a non-prod env `<env>`, the full set is `<env>-cdn` / `-rest-preview` / `-api` / `-composable-studio-api` / `-images` `.csnonprod.com`, table in [`install-studio`](install-studio.md) § Non-prod hosts.

**Record it in the report (step 4) as an explicit line.** Downstream skills consume it:

| Consumer | What changes on non-prod |
|---|---|
| [`install-contentstack-mcp`](install-contentstack-mcp.md) | API calls need `CONTENTSTACK_CMA_BASE_URL` / `CDA_BASE_URL` plus a valid region code (`dev11` is not a region, the CLI exits on it), and its **OAuth login can't reach a custom DC at all** (authorize host is region-derived, no override). Use a management token or `csdx` there. Defaults to **NA prod** if this answer is missing |
| **OAuth on a custom DC** | Needs that DC's **own** OAuth app id + client id: apps are registered per data centre, so prod's ids don't exist on dev11 and dev11's don't exist on dev22. **Ask the user, never reuse ids across DCs.** A wrong id makes the authorize page return "App with id … not found". See [`install-contentstack-mcp` § OAuth on a custom region](install-contentstack-mcp.md#oauth-on-a-custom-region) |
| [`install-studio`](install-studio.md) | Every host set explicitly. `host:` on `Contentstack.stack({...})` is mandatory, not optional |
| [`verify-setup`](verify-setup.md) | `previewHost` comes from this determination rather than the prod region map |
| [`author-composition-via-api`](author-composition-via-api.md) | `curl` not Python for CMA (non-prod chain isn't in Python's CA store) |

### 3. Choose a path

Pick exactly one based on the classification:

| Path | Detected shape | What to do next |
|---|---|---|
| **A. Greenfield-friendly** | Vite/CRA + React 18 + single React + no existing CS deps | Run `install-studio` directly. No pre-work needed. |
| **B. React 19: pin React (Next 15) OR downgrade Next (React-19-only)** | React 19 detected | **Block** `install-studio` first. **Evidence:** `@contentstack/studio-react` peer-deps `react ^18.0.0` on every published version (public npm through 1.5.0, GitHub Packages through 1.6.x). No validated React 19 build ships today. The reference customer app (`studio-demo-rb`) runs React 18.3.1 + studio-react 1.6.0. **Two fixes, pick the narrower one first:** (B1) **Pin React only**: `<pm> add react@18.3.1 react-dom@18.3.1 @types/react@18 @types/react-dom@18 --save-exact`. Works on Next 15 without touching Next (Next 15 peer-allows `react ^18.2.0`, so no Next downgrade needed). (B2) **Downgrade React AND Next**: only when the app has code that requires React 19 features (Actions, `use()`, RSC async APIs). Follow the Next 14 downgrade path. Re-run `analyze-project-fit` to confirm single React 18.x. When a React-19-compatible SDK ships, run `upgrade-studio-sdk` to migrate off the pin. |
| **C. React 17 or older** | React < 18 detected | **Block** `install-studio`. The user must upgrade to React 18 first. Refer them to the React 18 upgrade guide. The SDK won't work on 17: this is a hard requirement, not a soft one. |
| **D. Existing CS app (minimal-add)** | `@contentstack/delivery-sdk` or `@contentstack/live-preview-utils` already present | Do NOT re-init Delivery SDK. Take the minimal-add branch in `install-studio` (Studio-only install, reuses existing Delivery SDK init). |
| **E. Next + Turbopack** | Detected | Proceed to `install-studio` with Next-specific paths. Flag: SDK ships a canvas-route built-ins auto-bootstrap, but if the user is pinned to an older SDK there's a known Turbopack tree-shake regression. `troubleshoot-canvas` has the safety-net snippet. |
| **H. Non-prod / custom data centre** (dev11, stag, eu-dev, …) | Editor URL or config shows `*.csnonprod.com` | Not a blocker, but pin it before any state-changing skill. Every Contentstack host must be set explicitly (no `region` shortcut), the Contentstack MCP is unusable, and CMA calls go through `curl` rather than Python. Carry the `<env>` prefix into `install-studio`, `verify-setup`, and any provisioning skill. |
| **F. Custom bundler** | Webpack/tsup/rollup with no `external: ['react']` detected | Walk the user through `dedupe` config OR (recommended) switch to serving a prod build for the Studio canvas. The dev bundler is the most common source of dual-React issues. |
| **G. Multiple React instances** | `npm ls react` shows >1 entry | **Block** `install-studio`. Resolve duplicates first: identify which dep pulls the second React (`npm ls react`), add `overrides`/`resolutions` in `package.json` to pin a single version, reinstall, re-run `analyze-project-fit`. |

### 4. Report: what to tell the user

Print a single readable summary block:

```
✓ Project shape detected:
    Framework:        <Next | Vite | CRA | Remix | Astro | Custom>
    React:            <18.3.1 | 19.x | …> — <single | duplicate>
    Package manager:  <pnpm | yarn | npm | bun>
    TypeScript:       <yes | no>
    Monorepo:         <yes (turbo/pnpm-workspace/etc.) | no>
    Existing CS SDKs: <none | delivery-sdk | live-preview-utils | studio-react>
    Local HTTPS:      <mkcert ready | not installed>
    Deploy target:    <vercel | netlify | custom | none>

Chosen path: <A | B | C | D | E | F | G> — <short label>

Next steps (in order):
  1. <exact command if any prep needed, e.g. pnpm add react@18.3.1 ...>
  2. Invoke skill: <install-studio | install-studio (minimal-add branch) | …>
  3. Then: <setup-section-preview | setup-local-https-canvas | …>

Blockers to resolve before install:
  • <list, or "none">
```

Wait for explicit user confirmation before invoking the next skill.

### 5. Hand-off

Once the user confirms, invoke the next skill in the chosen path. Pass forward what you discovered (framework, package manager, React version, TS) so the downstream skill doesn't re-prompt for things you already know.

## Inputs needed from the user

1. `projectRoot`: path to the project. Usually `.` (current dir).

## Acceptance

This skill succeeds only when ALL of the following are true.

- [ ] Inspection commands ran and outputs were classified (no guessing: every signal in the classification table either matched a detection rule or was reported as "not detected").
- [ ] **The data centre is established and stated explicitly**: a prod region (NA/EU/AU/AZURE_NA/AZURE_EU/GCP_NA/GCP_EU) or a non-prod `<env>` prefix. Never left as "assumed prod": the SDK silently defaults to US prod, so a wrong assumption writes real data to the wrong data centre with no error.
- [ ] Exactly one path (A to G, plus H if non-prod) was chosen with justification.
- [ ] The summary block was printed including the chosen path + next steps.
- [ ] If the path is a blocker (B/C/G), `install-studio` was NOT invoked: the user is given the prep step and asked to re-run `analyze-project-fit` after.
- [ ] If the path is an enabler (A/D/E/F), the downstream skill was invoked with the discovered context.
- [ ] No files were modified by this skill itself.

## Common pitfalls

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| Trusting `package.json` `react` field over `npm ls react` | The dep range may say `^18.0.0` but the actual installed version could be 18.x or higher depending on resolution + lockfile | Always run `npm ls react` to confirm the installed major |
| Assuming React 19 will work | SDK's peerDep is `^18.0.0`: install fails fast on React 19 (good). Path B handles the prep step so the user gets a clear pin command rather than a cryptic ERESOLVE log | Path B detects React 19 up front and pins to 18.3.1 before invoking install-studio |
| Skipping the monorepo check | Studio installed in the wrong workspace package doesn't get picked up by the canvas-app | Detect `pnpm-workspace.yaml` / `turbo.json`, ask which workspace package is the canvas-app |
| Routing every project through Path A by default | The smooth path only applies to a specific shape | Use the classification table: if any signal points to B to G, go there |
| Re-running `analyze-project-fit` after the user makes a change without re-running the inspection commands | Stale classification = wrong path | After any user-side prep (downgrade, dedupe), re-run inspection commands fresh |

## See also

- `install-studio`: the downstream skill for paths A/D/E/F
- `setup-section-preview`: for the canvas-iframe wiring (paired with `setup-local-https-canvas`)
- `setup-local-https-canvas`: mkcert recipe for trusted local HTTPS
- `troubleshoot-canvas`: reactive diagnosis if install proceeded and something failed downstream
- `verify-setup`: layered smoke test after install
