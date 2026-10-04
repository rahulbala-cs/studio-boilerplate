/**
 * Step 1 — stack provisioning.
 *
 *   environment → Live Preview + preview token → Global Fields → Content Types
 *
 * Idempotent: every step is find-or-create, so re-running is safe and is the
 * intended way to bring a drifted stack back to the model in content-model.mjs.
 * The repo owns these content types: a re-run replaces each one with its
 * definition here, so a field added in the web app (and its values) is removed.
 *
 * Writes the resolved ids into .env for the app and the later scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuth, cma, log, hosts } from './lib/cma.mjs';
import { GLOBAL_FIELDS, CONTENT_TYPES, CREATE_ORDER } from './lib/content-model.mjs';
import { STACK_API_KEY, ENVIRONMENT, BASE_URL, LOCALE, LOCALES, writeEnv } from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every locale in LOCALES must exist on the stack before an environment can
 * carry a URL for it. Non-master locales fall back to the master, so a page
 * nobody has translated yet still has content to render.
 */
async function ensureLocales() {
  log.step('Locales');
  // The first entry in NEXT_PUBLIC_CONTENTSTACK_LOCALES is treated as the master.
  const { stack } = await cma(STACK_API_KEY, '/stacks');
  if (stack?.master_locale && stack.master_locale !== LOCALE) {
    throw new Error(
      `The stack's master locale is ${stack.master_locale}, but the first entry in ` +
        `NEXT_PUBLIC_CONTENTSTACK_LOCALES maps to ${LOCALE}. List the master locale first.`,
    );
  }
  const { locales = [] } = await cma(STACK_API_KEY, '/locales');
  const have = new Set(locales.map((l) => l.code));
  for (const code of Object.values(LOCALES)) {
    if (have.has(code)) {
      log.skip(`${code} exists`);
      continue;
    }
    await cma(STACK_API_KEY, '/locales', {
      method: 'POST',
      body: { locale: { code, fallback_locale: LOCALE } },
    });
    log.ok(`${code} created (falls back to ${LOCALE})`);
  }
}

/**
 * One Base URL per locale, WITH its prefix: https://localhost:3000/en. Studio
 * builds the canvas address as Base URL + Canvas URL (→ /en/canvas) and a
 * template preview as Base URL + the template's URL (→ /en/articles/…), so the
 * prefix has to live here, not in the templates.
 */
const localeUrls = () =>
  Object.entries(LOCALES).map(([prefix, code]) => ({ locale: code, url: `${BASE_URL}/${prefix}` }));

async function ensureEnvironment() {
  log.step(`Environment "${ENVIRONMENT}"`);
  const { environments = [] } = await cma(STACK_API_KEY, '/environments');
  const found = environments.find((e) => e.name === ENVIRONMENT);
  const wanted = localeUrls();
  const describe = wanted.map((u) => `${u.locale} ${u.url}`).join(', ');
  if (found) {
    const current = new Map((found.urls ?? []).map((u) => [u.locale, u.url]));
    if (wanted.some((u) => current.get(u.locale) !== u.url)) {
      // The CMA keys this endpoint on the environment NAME, not the uid.
      await cma(STACK_API_KEY, `/environments/${ENVIRONMENT}`, {
        method: 'PUT',
        body: { environment: { name: ENVIRONMENT, urls: wanted } },
      });
      log.ok(`base URLs updated -> ${describe}`);
    } else {
      log.skip(`exists (${found.uid}), base URLs already ${describe}`);
    }
    return found.uid;
  }
  const { environment } = await cma(STACK_API_KEY, '/environments', {
    method: 'POST',
    body: { environment: { name: ENVIRONMENT, urls: wanted } },
  });
  log.ok(`created ${environment.uid} -> ${describe}`);
  return environment.uid;
}

async function enableLivePreview(envUid) {
  log.step('Live Preview (stack setting)');
  // Read-modify-write: siblings (visual_builder, timeline, …) must survive.
  const current = await cma(STACK_API_KEY, '/stacks/settings');
  const settings = current.stack_settings ?? {};
  if (settings.live_preview?.enabled && settings.live_preview['default-env'] === envUid) {
    log.skip('already enabled for this environment');
    return;
  }
  await cma(STACK_API_KEY, '/stacks/settings', {
    method: 'POST',
    body: {
      stack_settings: {
        ...settings,
        live_preview: {
          enabled: true,
          'default-env': envUid,
          'default-url': '',
          'is-always-open-in-new-tab': false,
          'lp-onboarding-setup-visible': true,
        },
      },
    },
  });
  // A 201 is not proof. Read it back.
  const after = await cma(STACK_API_KEY, '/stacks/settings');
  if (!after.stack_settings?.live_preview?.enabled) {
    throw new Error('Live Preview write returned success but did not persist.');
  }
  log.ok('enabled');
}

async function ensureDeliveryToken() {
  log.step('Delivery token + paired preview token');
  const { tokens = [] } = await cma(STACK_API_KEY, '/stacks/delivery_tokens');
  let token = tokens.find((t) => t.name === 'studio');
  if (!token) {
    // create_with_preview_token is a QUERY param. In the body it silently no-ops.
    const res = await cma(STACK_API_KEY, '/stacks/delivery_tokens?create_with_preview_token=true', {
      method: 'POST',
      body: {
        token: {
          name: 'studio',
          description: 'Studio canvas + Live Preview',
          scope: [
            { module: 'environment', environments: [ENVIRONMENT], acl: { read: true } },
            // Required even on a single-branch stack: without it the CMA
            // answers 141 "creation failed" with the real cause buried in
            // errors["scope.branch_or_alias"].
            { module: 'branch', branches: ['main'], acl: { read: true } },
          ],
        },
      },
    });
    token = res.token;
    log.ok(`created ${token.uid}`);
  } else {
    // Reusing by name is only safe if the token can read the target environment;
    // otherwise Delivery answers every request with nothing.
    const envs = (token.scope ?? [])
      .filter((s) => s.module === 'environment')
      .flatMap((s) => s.environments ?? [])
      .map((e) => (typeof e === 'string' ? e : e.name));
    if (!envs.includes(ENVIRONMENT)) {
      throw new Error(
        `Delivery token "studio" exists but is not scoped to "${ENVIRONMENT}". ` +
          'Add the environment to it in Settings → Tokens, or delete it and re-run.',
      );
    }
    log.skip(`exists (${token.uid})`);
  }
  // The POST response does not reliably carry the preview token. Read it back.
  const full = await cma(
    STACK_API_KEY,
    `/stacks/delivery_tokens/${token.uid}?include_preview_token=true`,
  );
  const deliveryToken = full.token?.token ?? token.token;
  const previewToken = full.token?.preview_token;
  if (!previewToken)
    throw new Error('No preview token on the delivery token — Live Preview will not work.');
  log.ok(`preview token resolved (${previewToken.length} chars)`);
  return { deliveryToken, previewToken };
}

async function ensureGlobalFields() {
  log.step('Global Fields');
  const { global_fields = [] } = await cma(STACK_API_KEY, '/global_fields');
  const existing = new Set(global_fields.map((g) => g.uid));
  for (const gf of GLOBAL_FIELDS) {
    if (existing.has(gf.uid)) {
      await cma(STACK_API_KEY, `/global_fields/${gf.uid}`, {
        method: 'PUT',
        body: { global_field: gf },
      });
      log.skip(`${gf.uid} — updated in place`);
    } else {
      await cma(STACK_API_KEY, '/global_fields', { method: 'POST', body: { global_field: gf } });
      log.ok(`${gf.uid} — created`);
    }
  }
}

async function ensureContentTypes() {
  log.step('Content Types');
  const { content_types = [] } = await cma(STACK_API_KEY, '/content_types?include_count=true');
  const existing = new Set(content_types.map((c) => c.uid));
  const byUid = Object.fromEntries(CONTENT_TYPES.map((c) => [c.uid, c]));

  // `article` references itself, so it cannot declare that reference at create
  // time — the CMA validates reference targets and the CT does not exist yet.
  // Create without self-references, then PUT the full schema.
  for (const uid of CREATE_ORDER) {
    const ct = byUid[uid];
    const selfRefs = ct.schema.filter(
      (f) => f.data_type === 'reference' && f.reference_to.includes(uid),
    );
    const firstPass = selfRefs.length
      ? { ...ct, schema: ct.schema.filter((f) => !selfRefs.includes(f)) }
      : ct;

    if (existing.has(uid)) {
      await cma(STACK_API_KEY, `/content_types/${uid}`, {
        method: 'PUT',
        body: { content_type: ct },
      });
      log.skip(`${uid} — updated in place`);
      continue;
    }
    await cma(STACK_API_KEY, '/content_types', {
      method: 'POST',
      body: { content_type: firstPass },
    });
    if (selfRefs.length) {
      await cma(STACK_API_KEY, `/content_types/${uid}`, {
        method: 'PUT',
        body: { content_type: ct },
      });
      log.ok(`${uid} — created (+ self-reference added on second pass)`);
    } else {
      log.ok(`${uid} — created`);
    }
  }
}

async function main() {
  await resolveAuth();
  console.log(`\n\x1b[1mProvisioning stack ${STACK_API_KEY}\x1b[0m  (${hosts().cma})`);

  await ensureLocales();
  const environmentUid = await ensureEnvironment();
  await enableLivePreview(environmentUid);
  const { deliveryToken, previewToken } = await ensureDeliveryToken();
  await ensureGlobalFields();
  await ensureContentTypes();

  writeEnv({
    NEXT_PUBLIC_CONTENTSTACK_API_KEY: STACK_API_KEY,
    NEXT_PUBLIC_CONTENTSTACK_DELIVERY_TOKEN: deliveryToken,
    NEXT_PUBLIC_CONTENTSTACK_PREVIEW_TOKEN: previewToken,
    NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: ENVIRONMENT,
    CONTENTSTACK_ENVIRONMENT_UID: environmentUid,
  });
  log.step('Done');
  log.info(`.env written at ${path.relative(process.cwd(), path.join(ROOT, '.env'))}`);
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
