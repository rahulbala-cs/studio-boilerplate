/**
 * Contentstack API client for the provisioning scripts.
 *
 * Auth is OAuth-first:
 *   1. CS_OAUTH_ACCESS_TOKEN  (env var — highest priority, use in CI)
 *   2. The Contentstack MCP's stored OAuth session (~/Library/Application Support/...)
 *
 * We never ask for a session `authtoken`. It is a full user-session credential.
 *
 * Access tokens live 59 minutes and refresh tokens ROTATE: refreshing spends the
 * stored one. A long provisioning run crosses that boundary, so this module
 * refreshes in-process and writes the rotated pair back to the store atomically.
 * Reading a rotating credential without writing back is what leaves the MCP's
 * own session dead on its next refresh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The Contentstack MCP's public OAuth client: these scripts reuse the session
// `npx @contentstack/mcp --auth` creates, so no app registration is needed.
const OAUTH_CLIENT_ID = process.env.CONTENTSTACK_OAUTH_CLIENT_ID ?? 'cGQZujH3Y_oYkf59';
const OAUTH_REDIRECT_URI = process.env.CONTENTSTACK_OAUTH_REDIRECT_URI ?? 'http://localhost:8184';

/** Regional hosts. Provisioning supports these two regions; the app supports all. */
const REGIONS = {
  NA: {
    cma: 'https://api.contentstack.io',
    studio: 'https://composable-studio-api.contentstack.com',
    devhub: 'https://developerhub-api.contentstack.com',
  },
  EU: {
    cma: 'https://eu-api.contentstack.com',
    studio: 'https://eu-composable-studio-api.contentstack.com',
    devhub: 'https://eu-developerhub-api.contentstack.com',
  },
};

function mcpStorePath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/ContentstackMCP/oauth-config.json');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? '', 'ContentstackMCP/oauth-config.json');
  }
  return path.join(os.homedir(), '.config/ContentstackMCP/oauth-config.json');
}

const state = { accessToken: null, orgUid: null, region: 'NA', store: null };

function loadStore() {
  const p = mcpStorePath();
  if (!fs.existsSync(p)) return null;
  try {
    return { path: p, cfg: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return null;
  }
}

/** Persist the rotated pair back, preserving every other field. */
function saveStore(store, tokenData) {
  const next = { ...store.cfg, ...tokenData, token_issued_at: Date.now() };
  const tmp = `${store.path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, store.path);
  store.cfg = next;
}

async function refreshStoredToken(store) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OAUTH_CLIENT_ID,
    refresh_token: store.cfg.refresh_token,
    redirect_uri: OAUTH_REDIRECT_URI,
  });
  const res = await fetch(`${REGIONS[store.cfg.region ?? 'NA'].devhub}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `OAuth refresh failed (${res.status}). Re-authenticate with:\n` +
        `  CONTENTSTACK_REGION=${store.cfg.region ?? 'NA'} npx @contentstack/mcp --auth`,
    );
  }
  saveStore(store, data);
  return data.access_token;
}

/** Resolve a usable access token, refreshing when within 5 minutes of expiry. */
export async function resolveAuth({ force = false } = {}) {
  if (process.env.CS_OAUTH_ACCESS_TOKEN && !force) {
    state.accessToken = process.env.CS_OAUTH_ACCESS_TOKEN;
    state.orgUid ||= process.env.CS_ORG_UID ?? null;
    state.region = process.env.CONTENTSTACK_REGION ?? 'NA';
    return state.accessToken;
  }
  const store = loadStore();
  if (!store) {
    throw new Error(
      'No Contentstack credential found. Either export CS_OAUTH_ACCESS_TOKEN + CS_ORG_UID,\n' +
        'or authenticate once with:  CONTENTSTACK_REGION=NA npx @contentstack/mcp --auth',
    );
  }
  state.store = store;
  state.orgUid = process.env.CS_ORG_UID ?? store.cfg.organization_uid;
  state.region = process.env.CONTENTSTACK_REGION ?? store.cfg.region ?? 'NA';

  const expiry = store.cfg.token_issued_at + store.cfg.expires_in * 1000;
  if (force || Date.now() >= expiry - 5 * 60 * 1000) {
    state.accessToken = await refreshStoredToken(store);
  } else {
    state.accessToken = store.cfg.access_token;
  }
  return state.accessToken;
}

export function hosts() {
  const h = REGIONS[state.region];
  if (!h) {
    throw new Error(
      `CONTENTSTACK_REGION "${state.region}" is not supported by these scripts (${Object.keys(REGIONS).join(', ')}).`,
    );
  }
  return h;
}
export function orgUid() {
  if (!state.orgUid) throw new Error('Organization uid unresolved. Set CS_ORG_UID.');
  return state.orgUid;
}

async function request(url, { method = 'GET', headers = {}, body, scope } = {}, isRetry = false) {
  const token = state.accessToken ?? (await resolveAuth());
  const h = {
    authorization: `Bearer ${token}`,
    ...(scope ?? {}),
    ...headers,
  };
  // FormData sets its own multipart boundary, so it never gets a Content-Type here.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm && !h['Content-Type']) h['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers: h,
    body: body === undefined || isForm || typeof body === 'string' ? body : JSON.stringify(body),
  });

  // An access token that worked minutes ago can be expired now. Refresh once, retry once.
  if (res.status === 401 && !isRetry) {
    if (process.env.CS_OAUTH_ACCESS_TOKEN) {
      throw new Error('401 from Contentstack: CS_OAUTH_ACCESS_TOKEN is expired or invalid.');
    }
    await resolveAuth({ force: true });
    return request(url, { method, headers, body, scope }, true);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      `${method} ${url.replace(/https:\/\/[^/]+/, '')} -> ${res.status} ${JSON.stringify(json).slice(0, 600)}`,
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Stack-scoped CMA call (content types, entries, assets, publish). Pairs with `api_key`. */
export function cma(apiKey, endpoint, opts = {}) {
  return request(`${hosts().cma}/v3${endpoint}`, { ...opts, scope: { api_key: apiKey } });
}
/**
 * Upload an asset, or replace the file of the one with the same title, so
 * re-running a script updates the stack instead of keeping the first upload.
 * Create is POST /assets; replacing is PUT /assets/<uid> (POST to a uid 404s).
 */
export async function upsertAsset(apiKey, { title, filename, body, contentType, description }) {
  const q = encodeURIComponent(JSON.stringify({ title }));
  const { assets = [] } = await cma(apiKey, `/assets?query=${q}`);
  const existing = assets[0];
  const form = new FormData();
  form.append('asset[upload]', new Blob([body], { type: contentType }), filename);
  form.append('asset[title]', title);
  if (description) form.append('asset[description]', description);
  const { asset } = await cma(apiKey, existing ? `/assets/${existing.uid}` : '/assets', {
    method: existing ? 'PUT' : 'POST',
    body: form,
  });
  return { uid: asset.uid, replaced: !!existing };
}

/** Studio API call. Projects are org-scoped, never stack-scoped. */
export function studio(endpoint, opts = {}) {
  return request(`${hosts().studio}/v1${endpoint}`, {
    ...opts,
    scope: { organization_uid: orgUid() },
  });
}
export const log = {
  step: (m) => console.log(`\n\x1b[1m\x1b[36m▸ ${m}\x1b[0m`),
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  skip: (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`),
  warn: (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`),
  info: (m) => console.log(`    ${m}`),
};
