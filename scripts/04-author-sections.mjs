/**
 * Step 4 — author the Sections.
 *
 * For each Section, in one pass: write the composition, generate and upload its
 * thumbnail, point `ui_preview` at it, and publish both. Never batch the
 * thumbnails to a follow-up command — that command does not get run, and the
 * result is a palette of blank tiles that nothing reports as broken.
 *
 * Writes scripts/.provision-state.json so the template step knows each Section's
 * uid without guessing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuth, cma, upsertAsset, log } from './lib/cma.mjs';
import { SECTIONS as SITE_SECTIONS } from './lib/sections.mjs';
import { SHOP_SECTIONS } from './lib/shop-sections.mjs';
import { sectionPreview } from './lib/section-preview.mjs';
import { upsertComposition, decodeUi } from './lib/composition.mjs';
import { STACK_API_KEY, COMPOSITIONS_CT, ENVIRONMENT, LOCALE } from './lib/config.mjs';

const SECTIONS = [...SITE_SECTIONS, ...SHOP_SECTIONS];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const STATE = path.join(ROOT, '.provision-state.json');

async function upsertPreviewAsset(title, svg) {
  const { uid } = await upsertAsset(STACK_API_KEY, {
    title,
    filename: `${title.replace(/\W+/g, '-').toLowerCase()}.svg`,
    body: svg,
    contentType: 'image/svg+xml',
  });

  // An unpublished asset resolves to nothing through Delivery — a blank tile
  // again, indistinguishable from never having set the field.
  await cma(STACK_API_KEY, `/assets/${uid}/publish`, {
    method: 'POST',
    body: { asset: { environments: [ENVIRONMENT], locales: [LOCALE] } },
  });
  return uid;
}

async function main() {
  await resolveAuth();
  console.log('\n\x1b[1mAuthoring Sections\x1b[0m');

  const saved = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  // State from another stack is useless here: start fresh rather than reuse its uids.
  const state = saved.stack === STACK_API_KEY ? saved : { stack: STACK_API_KEY };
  state.sections = state.sections ?? {};

  // Builders receive the sections already created in this run, so a Section can
  // reference an earlier one — the Featured Articles slot needs the Article Card's
  // uid to declare it as the slot's default fill. SECTIONS is in dependency order.
  // Header and Footer pin the site's single Site Settings entry. Exactly one
  // must exist: two would leave it ambiguous which one runs the site.
  const { entries: settings = [] } = await cma(
    STACK_API_KEY,
    '/content_types/site_settings/entries',
  );
  if (settings.length !== 1) {
    throw new Error(`Expected exactly one site_settings entry, found ${settings.length}`);
  }
  const site = { siteSettingsUid: settings[0].uid };

  for (const { key, build } of SECTIONS) {
    const def = build(state.sections, site);
    log.step(def.title);

    const { uid, created } = await upsertComposition(def);
    log.ok(`${created ? 'created' : 'updated'} ${uid} (composable_uid = entry uid)`);

    const assetUid = await upsertPreviewAsset(
      `${def.title} Preview`,
      sectionPreview(def.__tree, def.static_value),
    );
    await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}`, {
      method: 'PUT',
      body: { entry: { ui_preview: assetUid } },
    });
    // The ui_preview write created a new, unpublished version. Publish again.
    await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}/publish`, {
      method: 'POST',
      body: { entry: { environments: [ENVIRONMENT], locales: [LOCALE] } },
    });

    // A 200 on the PUT is not proof: if the CT lacked the field the CMA would
    // have dropped the key silently. Read it back.
    const { entry } = await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}`);
    if (!entry.ui_preview?.url) throw new Error(`${def.title}: ui_preview did not persist`);
    log.ok(`thumbnail set (${entry.ui_preview.filename})`);

    const nodes = countNodes(decodeUi(entry.ui));
    log.info(`${nodes} nodes · ${def.linked_schemas.length} linked schema(s)`);
    state.sections[key] = { uid, title: def.title };
  }

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  log.step('Done');
  log.info(`${SECTIONS.length} sections authored, thumbnailed and published`);
}

function countNodes(tree) {
  let n = 0;
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    n++;
    Object.values(x.slots ?? {}).forEach((arr) => (arr ?? []).forEach(walk));
  })(tree);
  return n;
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
