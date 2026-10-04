---
name: install-contentstack-mcp
---

## When to use

Optionally install + OAuth-authenticate the Contentstack MCP server so provisioning skills run CMA operations as tool calls instead of raw curl. **This is one way to obtain the OAuth session, not the only one**. `csdx auth:login --oauth` gives the same credential class. Declining the MCP never means falling back to a pasted session token. See [`authenticate-cma`](authenticate-cma.md).

Offer the FIRST time a user runs an API-provisioning flow (`provision-studio-project`, `provision-studio-stack`, `author-composition-via-api`) and no OAuth session is resolvable yet. If already installed (`claude mcp list`), skip silently. If declined, skip for the session. Never re-prompt. NOT a hard gate. Curl fallback always works.

> **Auth preflight: settle the credential before the first API call.** Resolve it OAuth-first per [`authenticate-cma`](authenticate-cma.md): `CS_OAUTH_ACCESS_TOKEN`, else the Contentstack MCP's stored session. **Never ask the user for a session `authtoken`.** If nothing resolves, or a refresh fails with `400 invalid_refresh_token`, hand them `! CONTENTSTACK_REGION=<code> npx @contentstack/mcp --auth` (it needs a TTY and a browser, so it cannot be run for them) and wait. `403 error_code 316` is a valid credential aimed at another org: fix the org or the `api_key`, do **not** re-authenticate.

# Install Contentstack MCP: optional CMA auth + execution layer

> **Recommendation, not a requirement, and declining it does NOT mean pasting a session token.** OAuth is the credential every provisioning skill expects either way. `csdx auth:login --oauth` provides it without the MCP. What the MCP adds is execution: CMA steps run as tool calls instead of raw `curl`. The auth ladder itself lives in [`authenticate-cma`](authenticate-cma.md).

## What it does: and does NOT do

Grounded in `contentstack.com/docs/agent-os/contentstack-mcp-server` **and verified against the CLI source** (`~/.npm/_npx/*/node_modules/@contentstack/mcp/dist/index.js`). Read this before offering. It corrects several wrong assumptions.

> **REGION GATE: establish the data centre BEFORE `--auth`, never after.** Verified against the CLI (`@contentstack/mcp` 0.9.0, `dist/chunk-IJB7CYTF.js`). Two independent settings, and only one of them is prod-locked:
>
> - **Region**: `--region` / `CONTENTSTACK_REGION`, normalised through `REGION_ALIASES` to exactly 7 codes: `NA` (aliases `US`, `AWS_NA`), `EU` (`AWS_EU`), `AU` (`AWS_AU`), `AZURE_NA`, `AZURE_EU`, `GCP_NA`, `GCP_EU`. Anything else (including `dev11`) **throws at startup**: `Unknown region "dev11". Provide a valid region via --region or CONTENTSTACK_REGION`.
> - **Hosts**: overridable per tool group via `ENDPOINT_OVERRIDE_ENV`: `CONTENTSTACK_CMA_BASE_URL`, `CONTENTSTACK_CDA_BASE_URL`, `CONTENTSTACK_PERSONALIZE_BASE_URL`, `CONTENTSTACK_LAUNCH_BASE_URL`, `CONTENTSTACK_AUTOMATIONS_BASE_URL`, `CONTENTSTACK_DEVELOPERHUB_BASE_URL`, `CONTENTSTACK_ANALYTICS_BASE_URL`, `CONTENTSTACK_BRANDKIT_API_BASE_URL`, `CONTENTSTACK_LYTICS_BASE_URL`. These **win over the region-derived endpoint**.
>
> **So non-prod API calls ARE reachable**: a valid region code (it only has to normalise) plus the base-URL overrides for your `<env>`. **But the OAuth login itself is not:** the authorize host is region-derived with no override, so `--auth` can't mint a token for a custom DC. Use a management token there, or `csdx`. See § [OAuth on a custom region](#oauth-on-a-custom-region).
>
> **Why this must gate the login.** `DEFAULT_REGION = "NA"`. With nothing set, the CLI silently authenticates and runs **against NA prod**, no prompt, no warning. On a non-prod project that means an OAuth session and CMA writes pointing at the wrong data centre, and every call succeeds. Resolve the DC first (Step 0). Only then run `--auth`.

### `--auth` is an interactive TUI: you cannot run it for the user

Runtime-verified against `@contentstack/mcp` 0.9.0. `--auth` is **not** a headless command. It opens an `inquirer` menu on the terminal:

```
? Select an action:      ❯ Authorization / Exit
? Authorization actions: ❯ Login / Reauthorize / Logout / Back
```

…then opens a browser and waits for the OAuth callback on `http://localhost:8184`.

Without a TTY it dies immediately with **`Error: User force closed the prompt with 0 null`**. Piping input gets through the first menu and fails on the second, measured. And even with the menus driven, the browser login still needs a human.

**So the agent's job is to hand the user a ready-to-run command, with the region already in it**: not to attempt the login and not to ask the user to work out the flags. In Claude Code, `!` runs it in the session so the output lands back in the conversation:

```
! CONTENTSTACK_REGION=<NA|EU|AU|AZURE_NA|AZURE_EU|GCP_NA|GCP_EU> npx @contentstack/mcp --auth
```

Then choose **Authorization**, then **Login**. The browser opens and you finish the login there. The region belongs **in the command**, because `--auth` bakes the data centre into the stored session. Setting it afterwards does not move an existing token (§ REGION GATE).

**Never print the command without a resolved region.** `DEFAULT_REGION` is `NA`, so omitting it silently authenticates against NA prod.

### When to re-run it: the session can die mid-work

Three signatures mean the stored session is unusable and the command above is the fix:

| Signature | Cause |
|---|---|
| `401 error_code 105` "access token is invalid or expired or revoked", and a refresh isn't possible | access token past its hour, no usable refresh token |
| `400 {"message":["invalid refresh_token"]}` | the stored refresh token was **spent**: refresh tokens rotate, and something refreshed without writing the new pair back ([`authenticate-cma`](authenticate-cma.md) § Refresh tokens rotate) |
| the store file is absent | never authenticated on this machine |

**`403 error_code 316` is NOT one of them.** That is a valid credential pointed at a stack outside its org. Re-authenticating changes nothing unless you deliberately switch org. Check with `GET /v3/stacks` + `organization_uid` first.

**Replaces the `authtoken`.** `npx @contentstack/mcp --auth` opens a browser OAuth login, then saves the tokens locally and reuses them automatically on every later run. No more pasting `authtoken`.

**Its OAuth session is reusable outside the MCP.** `--auth` writes `~/Library/Application Support/ContentstackMCP/oauth-config.json` (`%LOCALAPPDATA%\ContentstackMCP` on Windows, `~/.config/ContentstackMCP` elsewhere) holding `access_token`, `refresh_token`, `expires_in` (3600), `token_issued_at` and `organization_uid`. Scripts can read it instead of demanding an exported token. This repo's `scripts/lib/cma-auth.ts` does exactly that, read-only. The MCP refreshes within **5 minutes** of expiry. Anything sharing the store should use the same margin. See [`authenticate-cma`](authenticate-cma.md) § Where the credential actually lives.

**Auto-captures `organization_uid` + region.** The OAuth token stores the **org** (your login's default org) and the region, no need to ask for `org_id`. (This corrects the docs' "can't discover" claim: org IS captured. Only the stack isn't.)

**Runs CMA ops as tools** (77 CMA + 22 CMA-extended): `create_a_content_type`, `update_content_type`, `get_all_content_types`, `create_a_global_field`, `update_a_global_field`, `create_an_entry`, `update_an_entry`, `publish_an_entry`, `get_all_entries`, `get_all_environments`, `create_an_environment`, `get_all_assets`, `publish_an_asset`. Covers most of `provision-studio-stack`, the CT-create in `provision-studio-project`, and entry create/publish in `author-composition-via-api`. **Note: asset upload has NO tool** (only get/publish/update/delete of existing assets). Creating a new asset from a binary stays raw multipart `POST /v3/assets`.

**Does NOT auto-capture the stack `api_key`.** The token's `stack_api_key` is empty, no `list_stacks` tool. Supply it once: from [`install-playwright-mcp`](install-playwright-mcp.md) Step 5b (`CS_RECENT_STACK_API_KEY`), or the user pastes it. It MUST belong to the OAuth'd org (enforced by the Step 5 new-vs-existing / 403-recovery loop).

**Studio API (`/v1/projects`): OAuth FIRST, session authtoken only as fallback.** The MCP has no tool for it, so this is raw HTTP either way. But **attempt OAuth before asking anyone for a session token**, in this order:

1. **OAuth `Authorization: Bearer <access_token>`**: the token `--auth` already stored. Works for `/v1/projects` read+write on environments where the Studio API accepts app tokens (confirmed on dev11 after COMS-1710). **Always try this first.**
2. **`csdx --oauth`**: the CLI's own OAuth session, same credential class, no pasting.
3. **Create the project in the Studio UI**: zero tokens, and it onboards the stack too. Often the fastest answer for a one-off.
4. **Session authtoken, last resort only.** Fall back only after observing one of these exact rejections:
   - `authtoken: <oauth-token>` returns **401 `error_code 105`** "authtoken is not valid"
   - `Authorization: Bearer <oauth-token>` returns **422 `error_code 21`** "Stack not found" (auth accepted, stack unresolvable via the app-token path)
   - a management token as `authtoken:` returns **401** "not logged in"

> **Why the ordering matters: a session authtoken is a full user session credential.** It carries the whole logged-in identity, not a scoped grant: every org, every stack, every permission that user holds. Pasting one into a shell, a script, or an env file spreads it into history, logs and process lists, and it stays valid until that session ends. Treat it as a break-glass credential: **prefer OAuth, don't ask for a session token before OAuth has actually failed, never persist it, never echo it, never commit it.** If you must use one, scope it to the single call and discard it.

**Capability varies by environment and is still rolling out**: dev11 accepts OAuth Bearer for `/v1/projects`. A fresh NA prod stack was observed rejecting it. So don't hardcode either assumption: attempt OAuth, branch on the signatures above. See [`provision-studio-project`](provision-studio-project.md) step 9.

**No delivery/preview-token tool, no stack-create, no Live-Preview-enable tool.** All stay raw HTTP (`provision-studio-project` steps 3, 5, and stack-create).

> **The split:** Contentstack MCP = auth (incl. org) + CMA execution, **prod only**. Playwright MCP = stack-key discovery from the UI. Raw HTTP = Studio API + tokens + LP-enable + stack-create. Non-prod works through the MCP too, via base-URL overrides (Step 0). No single tool does all of it.

<a id="non-prod-auth-path"></a>

### Non-prod (dev11 / `*.csnonprod.com`): the one clear path

The MCP is unreachable here (no `csnonprod` host, no host-override env var). The fallback is not one tool but a fixed set of choices per operation. Decide once, up front, instead of rediscovering it mid-flow:

| Operation | Non-prod path | Notes |
|---|---|---|
| **CMA**: content types, entries, assets, publish | Raw `curl` against the `csnonprod` CMA host with `-H "$CS_AUTH"`: **OAuth Bearer by default**. A session `authtoken` only as the last rung ([`authenticate-cma`](authenticate-cma.md)) | **Use `curl`, not Python.** `urllib`/`requests` fail with `SSLCertVerificationError`, the non-prod chain isn't in Python's CA store. `curl` reads the system keychain. See [`author-composition-via-api`](author-composition-via-api.md) § Common pitfalls |
| **Studio API**: `/v1/projects` register/configure | `csdx` with OAuth, or raw `curl` with a session authtoken against **`<env>-composable-studio-api.csnonprod.com`** (prod is `composable-studio-api.contentstack.com` + regional variants, see [`install-studio`](install-studio.md) § host table) | **Superseded:** an earlier version of this row said prod rejects OAuth Bearer. Runtime-verified since: `GET /v1/projects` on `composable-studio-api.contentstack.com` with `Authorization: Bearer <oauth>` + `organization_uid` returns **200** with the project list, and dev11 accepts read+write after COMS-1710. **OAuth is the first rung on prod too**. See [`authenticate-cma`](authenticate-cma.md). Still branch on the response rather than assuming, and pair Bearer with `organization_uid`, never a stack `api_key` |
| **`csdx` against a non-prod DC** | Set the custom region, then pass the DC's own OAuth app credentials as env vars, see § OAuth on a custom region below | The built-in app ids are per-DC, runtime-confirmed on dev11, where csdx's own default id fails the authorize step with **"App with id `<id>` not found"** |
| **Stack API key discovery** | Playwright MCP against the non-prod web app, or ask the user | No CLI/MCP path |
| **Anything the MCP would have done** | The equivalent raw-`curl` step in the owning skill | Every provisioning skill keeps a full curl fallback. Nothing is MCP-only |

<a id="oauth-on-a-custom-region"></a>

#### OAuth on a custom region: three things must line up, and two of them you supply

OAuth apps are **registered per data centre**. A prod app id does not exist on dev11, and dev11's app id does not exist on dev22. So authorizing against a custom region needs all three of:

| # | What | Prod | Custom region (dev11, dev22, dev8, stag, …) |
|---|---|---|---|
| 1 | **Authorize UI host** | Derived from the region automatically | Must be that DC's UI host, e.g. `https://dev11-app.csnonprod.com` |
| 2 | **OAuth app id** | Built in / fetched automatically | **User supplies it**: it's registered on that DC only |
| 3 | **OAuth client id** | Built in / fetched automatically | **User supplies it** |

**Never guess, reuse, or hardcode ids.** They are per-DC, they rotate, and they belong in the user's environment. **Always read them from env vars the user sets. Never write a concrete id into a skill, script, config, or commit.** Ask the user for their DC's values. The failure is unambiguous when the id is wrong: the authorize page returns **"App with id `<id>` not found"** (runtime-confirmed on dev11 using csdx's own built-in default).

**`csdx` works, because it lets you set all three.** The region config supplies the UI host. The app credentials come from env:

```bash
OAUTH_APP_ID=<dc-app-id> \
OAUTH_CLIENT_ID=<dc-client-id> \
OAUTH_APP_REDIRECT_URL=http://localhost:8184 \
csdx auth:login --oauth
```

**The MCP: blocked on (1) at v0.9.0.** It exposes `CONTENTSTACK_OAUTH_APP_ID`, `CONTENTSTACK_OAUTH_CLIENT_ID` and `CONTENTSTACK_OAUTH_REDIRECT_URI` (note the different names from csdx), so items 2 and 3 are settable, but `applyRegion()` hardcodes `oauthBaseUrl = OAUTH_URLS[region].uiHost`, built from the 7 prod regions with **no env override**. Custom-region app credentials therefore get sent to a prod authorize endpoint, where that app doesn't exist. **So `--auth` cannot mint a token for a custom region**, and the `*_BASE_URL` overrides don't help: they redirect API calls, not the login.

Two ways to use the MCP on a custom region anyway:

- **Management token instead of OAuth**: CMA accepts `--management-token` / `CONTENTSTACK_MANAGEMENT_TOKEN` in place of `--auth`. Combine with `CONTENTSTACK_CMA_BASE_URL` / `CDA_BASE_URL` for the DC. This is the working path today.
- **Skip the MCP** for that work and use `csdx` (OAuth, as above) or raw `curl`.

**Worth filing upstream:** every other piece is already overridable. One `CONTENTSTACK_OAUTH_UI_HOST` (or letting the region accept a custom endpoint set) would make the MCP work on non-prod.

**Decide the host before the first call.** Switching a half-provisioned flow from prod to non-prod means re-checking auth on every step: the token types, the working header, and the SSL behaviour all differ.

## Task

### Step 0: Region gate (run BEFORE anything else)

Do not offer the install, and do not run `--auth`, until the data centre is settled. `DEFAULT_REGION` is `NA`, so "not set" silently means prod.

1. **Determine the DC**: [`analyze-project-fit`](analyze-project-fit.md) § 2b: Determine the data center. If that already ran this session, reuse its answer. Don't ask twice.

2. **Branch on the result:**

   | DC | What to set | Then |
   |---|---|---|
   | **Prod**: one of the 7 | `--region <CODE>` or `CONTENTSTACK_REGION=<CODE>` (`NA`/`EU`/`AU`/`AZURE_NA`/`AZURE_EU`/`GCP_NA`/`GCP_EU`. `US`, `AWS_NA`, `AWS_EU`, `AWS_AU` also accepted) | Continue to Step 1 |
   | **Non-prod**: `<env>.csnonprod.com` | A valid region code **plus** base-URL overrides: `CONTENTSTACK_CMA_BASE_URL=https://<env>-api.csnonprod.com`, `CONTENTSTACK_CDA_BASE_URL=https://<env>-cdn.csnonprod.com` (add the other `*_BASE_URL` vars for any other tool group you use) | Verify (step 3), then Step 1 |
   | **Unknown / user unsure** | - | **STOP.** Print the block below. Do not install, do not run `--auth` |

   **`<env>` is whatever the user says it is.** `dev11` is only an example. `dev8`, `dev22`, `stag`, `eu-dev`, or any internal name their org runs are all equally valid. Substitute it verbatim into every `<env>-<service>.csnonprod.com` host. Never validate the name against a list, never "correct" it to one you've seen before, and never assume `dev11` because it appeared in a previous session. The only fixed vocabulary is the 7 **region codes**. The env prefix is free-form.

3. **If the region can't be established, say this verbatim and stop:**

   > I can't set up the Contentstack MCP yet. I don't know which data centre your stack is on, and the MCP defaults to **NA prod** when it isn't told. Authenticating now could point an OAuth session and every CMA write at the wrong data centre, and the calls would succeed silently.
   >
   > Tell me one of these and I'll continue:
   > - the URL you open Contentstack at: `app.contentstack.com`, a regional prod host, or `<env>-app.csnonprod.com`, or
   > - the region code directly: `NA`, `EU`, `AU`, `AZURE_NA`, `AZURE_EU`, `GCP_NA`, `GCP_EU`.
   >
   > For a non-prod stack, tell me the env prefix exactly as it appears in your URL (`dev8`, `dev22`, `stag`, whatever your org uses) and I'll set `CONTENTSTACK_CMA_BASE_URL` / `CONTENTSTACK_CDA_BASE_URL` to those hosts and check they resolve before logging in. Note the env name is not a region value: `--region dev22` makes the CLI exit with `Unknown region`.

3b. **Region vocabularies differ between tools. Don't copy one into the other blindly.** Runtime-verified:

   | Tool | Accepts | Rejects |
   |---|---|---|
   | **Contentstack MCP** | `NA`, `US`, `AWS_NA`, `AWS-NA`. `normalizeRegion` uppercases and converts `-` to `_`, so all four resolve to `NA` | a non-prod name (`dev11` becomes `undefined`, CLI exits) |
   | **`csdx` Studio plugin** | **`AWS-NA` only**: its map is keyed with the hyphenated prefix | `NA`, which fails with "Region not configured" |
   | **`csdx` core** | both `NA` and `AWS-NA` (identical hosts) | - |

   So **`AWS-NA` is the one value that satisfies all three.** Set that and neither tool complains. See [`configure-studio` § Select the Studio project](configure-studio.md#select-the-studio-project) for the plugin side.

   **`--auth` is interactive and cannot be scripted.** `login()` calls `selectRegion()` unconditionally (an inquirer prompt with no flag or env bypass) then opens a browser. There is no non-interactive path, so an agent must hand this command to the user rather than run it: `npx @contentstack/mcp --auth`, then pick the region from the prompt.

4. **Verify the host BEFORE triggering the login.** A confirmed answer is not a correct answer. `dev22` when the org runs `dev2`, or a typo'd prefix, produces a hostname that simply doesn't exist. Probe it unauthenticated. You are testing that the host resolves and a Contentstack API answers, not that you have access:

   ```bash
   # Non-prod: substitute the user's own <env>. Prod: use the region's CMA host.
   curl -sS -o /dev/null -w "%{http_code}\n" --max-time 10 \
     "https://<env>-api.csnonprod.com/v3/environments"
   ```

   | Result | Meaning | Action |
   |---|---|---|
   | `401` / `412` | Host exists and Contentstack is answering, it's rejecting you for missing auth, which is exactly right at this stage | Proceed to Step 1, then the login |
   | `000` / DNS or connection error | **That host does not exist.** Almost always a wrong or mistyped env prefix | Do NOT log in. Tell the user the exact hostname you tried, say it didn't resolve, and ask them to confirm the env prefix from their Contentstack URL |
   | `200` | Unexpected without auth, note it and continue | Proceed |

   Only after this probe passes do you install and run `--auth`. Confirming the region and then authenticating against a nonexistent or wrong host wastes an OAuth round-trip and, worse, silently falls back to prod behaviour for anything you forgot to override.

5. **Record the resolved region + any overrides** and reuse them in the `claude mcp add` config (Step 4). The same values must be present there, not only in your shell. An override that lives only in your shell means the MCP server process starts with prod defaults.

### Step 1: Check if already installed

```bash
claude mcp list | grep -i contentstack
```
If `contentstack` shows up, skip the rest and print: `Contentstack MCP already installed — provisioning skills will use it automatically.` <!-- style-lint: allow -->

### Step 2: Offer (don't push)

Tell the user verbatim:

> I noticed the Contentstack MCP isn't installed. It's optional: provisioning works without it via curl, and `csdx auth:login --oauth` gives the same OAuth credential either way, so declining doesn't mean pasting a token. If you do install it (~2 min), you log in once via browser OAuth, and CMA steps (create CTs, entries, assets, publish) run as tool calls instead of curl. Two heads-ups: on a non-prod data centre (dev11 etc.) it needs base-URL overrides as well as a region, and while your login captures the org automatically, you still supply the **stack API key** once. Registering a Studio project (`/v1/projects`) has no MCP tool. I'll try your OAuth token there first and only ask for anything else if the API rejects it. Want me to install it? <!-- style-lint: allow -->

- **Yes**: go to Step 3.
- **No / not now**: reply `Got it — I'll use curl for provisioning this session, authenticating with your OAuth token (csdx auth:login --oauth if it isn't set up yet).` Stop. Do not re-prompt this session.
- **Tell me more**: expand the "What it does" section, then re-ask.

### Step 3: Authenticate (OAuth)

`--auth` walks **three arrow-key TTY menus in sequence** (`Select an action → Authorization`, then `Authorization actions → Login`, then `Select your Contentstack region → <region>`) and THEN prints the OAuth URL + calls `open()` to launch the browser. There is **no org-picker menu**: the org comes from your Contentstack login's default org. To target a different org, **switch your active org in the Contentstack web UI before logging in**. This is the ONLY way. (`CONTENTSTACK_ORGANIZATION_UID` does NOT help: the MCP takes the org from the OAuth token, not that env var, so it has no effect on CMA auth.)

**Recommended: agent drives the menus via a PTY (the agent CAN open the browser for you).** The menus need a TTY, but `expect` allocates one, so the agent auto-selects the first two defaults, **navigates to the user's region** on the third menu, and lets the CLI open the browser. You only do the in-browser login. The region menu is 0-indexed (`NA=0, EU=1, AU=2, AZURE_NA=3, AZURE_EU=4, GCP_NA=5, GCP_EU=6`), so set `downs` to your region's index (do NOT assume NA):

```expect
# cs-auth.exp — run: expect cs-auth.exp   (background it)
set downs 0                                  ;# <-- SET to region index: NA=0, EU=1, AU=2, AZURE_NA=3, AZURE_EU=4, GCP_NA=5, GCP_EU=6
set timeout 60                               ;# short — menus render fast
spawn npx -y @contentstack/mcp --auth
expect "Select an action"              ; send "\r"   ;# Authorization (default)
expect "Authorization actions"         ; send "\r"   ;# Login (default)
expect "Select your Contentstack region"
for {set i 0} {$i < $downs} {incr i} { send "\033\[B" }  ;# arrow-down to the chosen region
send "\r"
set timeout 1800                             ;# 30 min — generous window for the human browser login (must exceed how long login takes)
expect eof                                            ;# CLI prints URL, opens browser, waits for the localhost:8184 callback
```

Run it backgrounded, then read the log for `Opening browser…` + the `https://app.contentstack.com/…/authorize` URL (hand that URL to the user as a fallback if the auto-open is blocked). The user completes the login in the browser. The CLI's `localhost:8184` callback finishes it (`Authentication completed successfully`). If the login window may exceed 30 min (MFA/SSO enrollment), raise the second `set timeout` or use `set timeout -1` so the callback server isn't killed mid-login.

**Fallback: user runs it in their own terminal** (no `expect`, or the agent can't spawn a PTY): the `!` prefix gives a real TTY:

```
! npx @contentstack/mcp --auth
```
Then they arrow through Authorization, then Login, then their region, and log in.

Either way, tokens are saved locally and auto-reused. The region + org are stored in the session.

> **After authentication: select the Studio project before doing project-scoped work.** An org usually has several, and the wrong one fails silently (empty compositions list, empty Sections panel). See [`configure-studio` § Select the Studio project](configure-studio.md#select-the-studio-project). List them, confirm which when there's one, ask when there are several, and check the project's connected stack matches the app's.

### Step 3c: Tokens last ONE HOUR. Check expiry before diagnosing any auth failure.

**Runtime-verified.** `--auth` stores `expires_in: 3600`. The access token is valid for **one hour**. A token from an earlier session is therefore almost always dead, and the failure does not say so:

| What you see | What it actually means |
|---|---|
| **401** `error_code 105`, "The provided access token is invalid or expired or revoked" | Usually just **expired**. Reads exactly like a wrong credential or wrong header, which is the trap |
| **403** on the CMA with a fresh token | Token is fine. That **stack is outside the OAuth'd org**. Different problem, different fix: switch the active org and re-auth, or use a stack in this org |
| **200** | Working. OAuth `Bearer` **is** valid for the CMA, verified with a fresh token |

**Check expiry FIRST, before concluding anything about headers, schemes or scopes:**

```bash
node -e '
const os=require("os"),p=require("path"),fs=require("fs");
const f=p.join(os.homedir(),"Library/Application Support/ContentstackMCP/oauth-config.json"); // macOS
const c=JSON.parse(fs.readFileSync(f,"utf8"));
const expiresAt=c.token_issued_at+c.expires_in*1000;
console.log(Date.now()>expiresAt
  ? "EXPIRED "+Math.round((Date.now()-expiresAt)/60000)+" min ago — re-run --auth"
  : "valid for "+Math.round((expiresAt-Date.now())/60000)+" more min");'
```

Config location: `~/Library/Application Support/ContentstackMCP/oauth-config.json` (macOS), `~/.config/ContentstackMCP/` (Linux), `%LOCALAPPDATA%\ContentstackMCP\` (Windows).

**On expiry, say so plainly and re-authenticate. Don't debug the wrong layer.** Tell the user verbatim:

> Your Contentstack session expired. The MCP's access token only lasts an hour, and yours was issued earlier. Nothing is misconfigured. I'll re-run the login. You'll just need to complete the browser step.

Then re-run Step 3 (the `expect` PTY path drives the menus. Only the browser step needs the user). A `refresh_token` is stored alongside the access token, but a raw `curl` won't use it. Re-running `--auth` is the reliable path.

**This is the single most misleading failure in the whole flow.** An expired token produced a 401 that looked like "OAuth doesn't work for the CMA", a wrong conclusion that survived until the expiry was checked. **Any 401 on a Contentstack API: check the clock before you touch the credential.**

### Step 4: Register the MCP server

**claude-code CLI:**
```bash
claude mcp add contentstack -e GROUPS=cma,cma-extended -e CONTENTSTACK_REGION=<resolved-region> -- npx -y @contentstack/mcp
```

`<resolved-region>` is the Step 0 region (`NA` for prod NA, etc.). **Pin it explicitly, see the callout below.** Omitting it lets a stray ambient value crash the server.

**Claude Desktop / Cursor / VS Code (JSON config):**
```json
{
  "mcpServers": {
    "contentstack": {
      "command": "npx",
      "args": ["-y", "@contentstack/mcp"],
      "env": { "GROUPS": "cma,cma-extended", "CONTENTSTACK_REGION": "<resolved-region>" }
    }
  }
}
```
Config locations: Claude Desktop (macOS) `~/Library/Application Support/Claude/claude_desktop_config.json` · Cursor `~/.cursor/mcp.json` · VS Code extension MCP panel. Restart the IDE / `claude` session so the server registers.

> `GROUPS=cma,cma-extended` enables the write tools the provisioning skills need. Add `cda` only if a skill needs published-content reads. Do NOT set a `CONTENTSTACK_MANAGEMENT_TOKEN` when using OAuth. The stored session is the credential.

> **Always pin `CONTENTSTACK_REGION` in the add config: the MCP inherits your shell/project environment.** The stdio server starts with the ambient env in scope. If you're in a repo whose `.env` (or your shell) sets `CONTENTSTACK_REGION` to a non-standard value (a DC prefix like `dev11`, `dev22`, `stag`), the server reads THAT instead of your OAuth region and **throws `Unknown region "<x>"` at startup**, so `claude mcp list` shows `✘ Failed to connect — Connection closed` even though your OAuth session is valid and you never passed a bad region. This is the single most common "the MCP won't connect" cause on a machine that also runs a non-prod Contentstack app. `-e CONTENTSTACK_REGION=<resolved-region>` (CLI) or the `env` block (JSON) overrides the stray value. Diagnose via the connection log: `~/Library/Caches/claude-cli-nodejs/<project-path>/mcp-logs-contentstack/`. The newest `.jsonl` prints the exact `Server stderr: Error: Unknown region …`. Pin `CONTENTSTACK_API_KEY` the same way for the same reason once the target stack is resolved (Step 5).

### Step 5: Choose the target stack (a loop of new-or-existing, then permission, then recover)

The MCP operates on ONE stack (`CONTENTSTACK_API_KEY`), which **MUST belong to the OAuth'd org** (Step 3's captured `organization_uid`). A key from another org fails the smoke test (Step 6). Run this loop. It exits only when an existing key is supplied OR a new stack is created successfully.

**Q1, ask after EVERY org selection** (first login AND after any "new org" re-auth below): "Create a new stack, or choose an existing stack?"

- **Choose existing stack**: the user supplies an `api_key` (from [`install-playwright-mcp`](install-playwright-mcp.md) Step 5b `CS_RECENT_STACK_API_KEY`, or pasted). Confirm it's in the OAuth'd org, then **go to "Set the key" (loop exit).**

- **Create a new stack**: the MCP has **no stack-create tool**, so use raw CMA `POST /v3/stacks` (header `organization_uid: <org>`, auth = OAuth access_token as `Bearer` (default) or, last resort, a session authtoken. Body `{ stack: { name, master_locale: "en-us" } }`). Confirm name + org first (real mutation). **Always attempt it: the create IS the permission check.** Branch on the response:
  - **HTTP 201**: capture `api_key`, then **go to "Set the key" (loop exit).**
  - **HTTP 403, `error_code 316`, `"You don't have the permission to do this operation."`** (verified): the user lacks stack-create rights in this org. Do NOT crash. **Q2 (ask: "No permission to create here) choose an existing stack, or a different org?"** (only these two. Admin-rights is an out-of-band footnote):
    - **Choose existing stack**: the user pastes `api_key`, then **go to "Set the key" (loop exit).**
    - **Choose different org**: **re-run Step 3, the browser re-opens.** Before logging in, the user switches their **active org** (Contentstack top-left switcher) to one where they can create (there's no in-flow org-picker, the login captures the active org). New org captured, so **loop back to Q1** (re-ask new-vs-existing for the new org). Repeat until exit.

**Set the key** (loop exit): the server was registered keyless in Step 4, and **`claude mcp add` errors if the name already exists**, so **remove, then re-add** with the key (CLI), or edit the `env` block directly (JSON config), then restart and go to Step 6:

```bash
claude mcp remove contentstack
claude mcp add contentstack -e GROUPS=cma,cma-extended -e CONTENTSTACK_REGION=<resolved-region> -e CONTENTSTACK_API_KEY=<blt...> -- npx -y @contentstack/mcp
```

For multi-stack work in one session, repeat this remove-then-re-add when switching stacks.

> **Why a restart is needed, and how to have only ONE.** The stack is bound to `CONTENTSTACK_API_KEY` **at server-process start**. There is **no hot-reload** (changing the env on a running process has no effect), **no per-call stack override** (the tools take `branch`, not an `api_key`, verified), and **no `claude mcp reconnect/restart`** subcommand (only add/remove/list/get/login/logout). So changing the target stack ALWAYS requires the server to respawn = one session restart. This is a Claude Code + MCP limitation, not something this skill can auto-fix. **To keep it to exactly one restart: finish the Step 5 loop and resolve the FINAL stack BEFORE the restart, then register + restart once, never re-register mid-build.** Switching to a different stack later is one restart each. If you genuinely cannot restart (long continuous flow), **provision via raw `curl` + the OAuth Bearer token instead**: no MCP, no restart, at the cost of not using the MCP tools.

### Step 6: Smoke test

After a **session restart** (so the MCP's tools load into the agent's toolset), call a read tool: `get_all_content_types` (or `get_all_environments`) against the configured stack. Pass = returns real CT/env data.

**Fail mode: `MCP error -32603: … Cannot read properties of undefined (reading 'data')`.** The server crashed on an undefined CMA response (no clean 401/403). Most often a **stale OAuth token, so re-auth (Step 3) for a fresh one** (the actual fix in testing). Otherwise the stack is in the wrong org/region, or is a non-prod stack. See the `-32603` and wrong-org rows in Common pitfalls for the full triage.

Note `claude mcp list` showing `✔ Connected` only means the server process started. It does NOT confirm CMA calls work. The tool call is the real test.

### Step 7: Write the session flag

Record an in-conversation note downstream skills read. Get the org by reading `organization_uid` from the stored token (`~/Library/Application Support/ContentstackMCP/oauth-config.json`). **Use the exact flag names the provisioning skills + the Playwright hook already consume** (`CS_RECENT_STACK_API_KEY`, `CS_ACTIVE_ORG`). A differently-named key is never read:
```
CONTENTSTACK_MCP_READY=true
CS_MCP_REGION=<region picked in --auth>
CS_ACTIVE_ORG=<organization_uid from the OAuth token>
CS_RECENT_STACK_API_KEY=<blt...>
```
Downstream skills check `CONTENTSTACK_MCP_READY` and read `CS_RECENT_STACK_API_KEY`. If absent they fall back to curl authenticated with the **same OAuth token**, not to a pasted session token.

### Step 8: Tell the user what's now automated

Print:
```
✅ Contentstack MCP installed + authenticated.

Runs as tool calls now (no curl, no pasted authtoken):
  • provision-studio-stack       — global fields, CTs, entries, asset dedupe + publish
  • provision-studio-project     — compositions CT create + environment create
  • author-composition-via-api   — entry create/update + publish

STILL raw HTTP (not in MCP scope) — same OAuth credential, sent as `Authorization: Bearer`:
  • provision-studio-project     — /v1/projects (Studio API), delivery+preview token, enable Live Preview, stack-create
  • provision-studio-stack       — asset binary UPLOAD (no MCP tool) + the CDA verify (delivery-host read)
  • stack API key                — you supply once (org is auto-captured by the login; MCP can't enumerate stacks)
  • anything on dev11/csnonprod  — prod DCs only
```

## Inputs needed from the user

1. `ide`: picks the config path.
2. `region`: the prod DC the stack lives in (drives the Step 3 region-menu selection). Must be one of the 7 prod regions.
3. `stackApiKey`: the target stack (in the OAuth'd org). From Playwright MCP's `CS_RECENT_STACK_API_KEY` or pasted once. Org is NOT an input. It's auto-captured by the login.
4. `existing vs new stack`: Step 5 branch.

## Acceptance

- [ ] Target stack confirmed **prod** (not dev11/csnonprod) BEFORE offering.
- [ ] User offered the recommendation in non-pushy framing, with the prod-only + "you supply the stack key" caveats stated.
- [ ] If declined: no further prompts this session.
- [ ] If accepted: `claude mcp list` shows `contentstack`. `--auth` completed (browser OAuth, region selected, org auto-captured).
- [ ] Stack key resolved (existing pasted, or new stack created) AND it belongs to the OAuth'd org.
- [ ] Smoke test (`get_all_content_types` / `get_all_environments`) returns real data, NOT just `✔ Connected`. On the `-32603 …'data'` crash, re-auth for a fresh token and retry.
- [ ] Session note written: `CONTENTSTACK_MCP_READY=true`, region, org, stack API key.
- [ ] User told which provisioning steps run as tools vs stay raw HTTP.

## Common pitfalls

| Pitfall | Why it bites | Fix |
|---|---|---|
| Passing `--region dev11` (or any non-prod name as a region) | Not a region value. `normalizeRegion` returns undefined and the CLI exits with `Unknown region` | Pass a **valid** region code and override the hosts instead: `CONTENTSTACK_CMA_BASE_URL` / `CONTENTSTACK_CDA_BASE_URL` -> `https://<env>-api.csnonprod.com` / `-cdn.csnonprod.com` |
| Diagnosing a 401 as a wrong credential when the token has simply **expired** | Access tokens live **1 hour**. The 401 text (`error_code 105`, "invalid or expired or revoked") gives no hint which. Sends you off testing headers and schemes that were never wrong | Check `token_issued_at + expires_in` first (Step 3c). If expired, tell the user the session expired and re-run `--auth` |
| Reading a **403** as an expired token | A fresh token returning 403 means the stack is outside the OAuth'd org, not an auth-lifetime problem | Switch the active org in the web UI and re-auth, or target a stack in the current org |
| Running `--auth` before the DC is settled | `DEFAULT_REGION` is `NA`, so an unset region silently authenticates against **NA prod**. The OAuth session and every CMA write land in the wrong data centre and succeed | Run Step 0 first. Never `--auth` on an unknown DC |
| Region set correctly but hosts left at defaults on non-prod | Region alone does not reach csnonprod. The region map only produces prod endpoints | Set the `*_BASE_URL` override for every tool group you use, not just CMA |
| Smoke test crashes: `-32603 … Cannot read properties of undefined (reading 'data')` | Server got an undefined CMA response and didn't surface the real 401/403 | **Re-auth for a fresh token first** (the actual fix in testing). Else: stack not in the OAuth'd org, wrong region, or non-prod stack |
| Expecting to paste `org_id` | The OAuth token auto-captures `organization_uid`, asking for it is redundant | Read it from the token. Only the **stack** key is a manual input |
| Stack `api_key` from a different org than the login | CMA can't read it, which produces the `-32603` crash above | Use a key in the OAuth'd org. Or re-auth into the owning org (switch default org first, there's no org-picker in `--auth`) |
| `POST /v3/stacks` (new-stack) returns **HTTP 403, `error_code 316`** `"You don't have the permission to do this operation."` | The user lacks stack-create rights in that org (verified against a real no-permission org) | Show the clear message (Step 5): get rights / switch org (re-auth) / use existing. Don't crash or retry blindly |
| Assuming it provisions the Studio project | `/v1/projects` (Studio API) is out of scope. Only CMA + related | Keep `provision-studio-project` steps 3/5/9 (LP-enable, tokens, project register) on raw HTTP |
| Asking for a session authtoken **before** trying OAuth on `/v1/projects` | A session authtoken is the whole user session (every org, every stack) and it often wasn't needed: OAuth `Bearer` works for `/v1/projects` where the Studio API accepts app tokens (dev11 post-COMS-1710) | Try `Authorization: Bearer <oauth-token>` first. Only on **401 `error_code 105`** (as `authtoken:`) or **422 `error_code 21`** (as `Bearer`) fall back, and prefer `csdx --oauth` or the Studio UI over pasting a session token |
| Sending the OAuth token as an `authtoken:` header | Wrong header for that credential class: 401 `error_code 105` | OAuth goes in `Authorization: Bearer`. `authtoken:` is only for session tokens |
| Expecting a delivery/preview-token tool | None exists ("requires manual setup") | Create tokens via raw CMA `POST /v3/stacks/delivery_tokens` (both env + branch scope) |
| Setting a management token alongside OAuth | Ambiguous credential. May target the wrong stack/region | With OAuth, omit `CONTENTSTACK_MANAGEMENT_TOKEN`. The stored session is the credential |
| `GROUPS` too narrow (`cma` only) | Some skills need CMA-extended (workflows/versions) | Register with `GROUPS=cma,cma-extended` |
| `--auth` dies instantly: `Error: User force closed the prompt with 0 null` | Run in a shell with **no TTY**. The arrow-key menus can't read input | Agent path: drive it via `expect` (Step 3: allocates a PTY, auto-selects the 3 menu defaults, `open()` launches the browser). User path: `! npx @contentstack/mcp --auth` for a real TTY |
| MCP installed but not restarted | Tools don't appear. Skills silently fall back to curl | Restart the `claude` session / IDE after `claude mcp add`. MCP tool schemas load at session start |
| Assuming CMA works because `claude mcp list` shows `✔ Connected` | "Connected" only means the server process started, not that CMA calls succeed | Confirm with an actual read tool (Step 6), not the connection status |
| Session flag lost to context compaction | Downstream skill re-prompts for authtoken mid-flow | Re-run the Step 6 smoke test when a provisioning skill starts rather than trusting the flag indefinitely |

## See also

- [`install-playwright-mcp`](install-playwright-mcp.md): discovers `org_id` + stack API key from the UI. The complement this MCP can't do.
- [`provision-studio-project`](provision-studio-project.md): CT-create + env-create route through MCP. `/v1/projects` + tokens stay raw HTTP.
- [`provision-studio-stack`](provision-studio-stack.md): CTs, entries, assets, publish all route through MCP tools.
- [`author-composition-via-api`](author-composition-via-api.md): entry create + publish via MCP. The `ui`/`data_sources` shape is unchanged.
- Reference: `@contentstack/mcp` on npm · `contentstack.com/docs/agent-os/contentstack-mcp-server`.
