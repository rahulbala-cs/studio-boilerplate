/**
 * Step 3 — seed content.
 *
 *   assets → site settings → articles → home page → shop pages → publish everything
 *
 * Idempotent by title: re-running updates the existing entries rather than
 * creating duplicates.
 *
 * Publishing is not optional and not cosmetic. An unpublished entry is invisible
 * to the Delivery API, so the Studio canvas renders blank while the CMA looks
 * perfectly correct — the single most misleading failure in a Studio build.
 */
import { resolveAuth, cma, upsertAsset, log } from './lib/cma.mjs';
import { logo, PHOTOS, SHOP_PHOTOS, fetchPhoto } from './lib/artwork.mjs';
import { SITE_SETTINGS, ARTICLES, HOME, SHOP_PAGES } from './lib/sample-content.mjs';
import { STACK_API_KEY, ENVIRONMENT, LOCALE } from './lib/config.mjs';

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ─── Assets ──────────────────────────────────────────────────────────────────
async function uploadAsset(title, filename, body, contentType, description) {
  const { uid, replaced } = await upsertAsset(STACK_API_KEY, {
    title,
    filename,
    body,
    contentType,
    description,
  });
  log.ok(
    `asset "${title}" ${replaced ? 'replaced' : 'uploaded'} (${uid}, ${Math.round(body.length / 1024)}KB)`,
  );
  return uid;
}

// ─── Entries ─────────────────────────────────────────────────────────────────
async function findEntry(ct, title) {
  const q = encodeURIComponent(JSON.stringify({ title }));
  const { entries = [] } = await cma(STACK_API_KEY, `/content_types/${ct}/entries?query=${q}`);
  return entries[0];
}

async function upsertEntry(ct, entry) {
  const existing = await findEntry(ct, entry.title);
  if (existing) {
    await cma(STACK_API_KEY, `/content_types/${ct}/entries/${existing.uid}`, {
      method: 'PUT',
      body: { entry },
    });
    log.skip(`${ct}/"${entry.title}" updated (${existing.uid})`);
    return existing.uid;
  }
  const res = await cma(STACK_API_KEY, `/content_types/${ct}/entries`, {
    method: 'POST',
    body: { entry },
  });
  log.ok(`${ct}/"${entry.title}" created (${res.entry.uid})`);
  return res.entry.uid;
}

async function publishEntry(ct, uid) {
  await cma(STACK_API_KEY, `/content_types/${ct}/entries/${uid}/publish`, {
    method: 'POST',
    body: { entry: { environments: [ENVIRONMENT], locales: [LOCALE] } },
  });
}

async function publishAsset(uid) {
  await cma(STACK_API_KEY, `/assets/${uid}/publish`, {
    method: 'POST',
    body: { asset: { environments: [ENVIRONMENT], locales: [LOCALE] } },
  });
}

// A reference field always stores an ARRAY on the wire, even a single reference.
// Sending a bare object 422s with a misleading "Cannot read properties of undefined (reading 'map')".
const ref = (uid, ct) => ({ uid, _content_type_uid: ct });

/**
 * Turn a sample block into what the CMA accepts: an `image` naming a
 * SHOP_PHOTOS key becomes that asset's uid (and fills `image_alt` from the
 * photo, unless the content set its own), and a `body` builder becomes its
 * rich-text document. Walks nested groups, so product cards and tiles resolve
 * the same way.
 */
function resolveShopFields(value, photoUids) {
  if (Array.isArray(value)) return value.map((v) => resolveShopFields(v, photoUids));
  if (typeof value === 'function') return value();
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = resolveShopFields(v, photoUids);
  if (typeof value.image === 'string') {
    const key = value.image;
    if (!photoUids[key]) throw new Error(`shop page uses unknown photo "${key}"`);
    out.image = photoUids[key];
    out.image_alt = value.image_alt ?? SHOP_PHOTOS[key].alt;
  }
  return out;
}

async function main() {
  await resolveAuth();
  console.log(`\n\x1b[1mSeeding content into ${STACK_API_KEY}\x1b[0m`);

  log.step('Assets');
  const logoUid = await uploadAsset(
    'Meridian mark',
    'meridian-mark.svg',
    logo(),
    'image/svg+xml',
    'Meridian brand mark. Vector, so it stays sharp at any size.',
  );

  const photo = async (title, key, filename) => {
    const meta = PHOTOS[key];
    return uploadAsset(
      title,
      filename,
      await fetchPhoto(meta.id),
      'image/jpeg',
      `${meta.credit}. Free for commercial use under the Unsplash License.`,
    );
  };

  const heroUid = await photo('Home hero', 'home_hero', 'home-hero.jpg');
  const coverUids = {};
  for (const a of ARTICLES) {
    coverUids[a.title] = await photo(`Cover — ${a.title}`, a.title, `${slug(a.title)}.jpg`);
  }
  const shopPhotoUids = {};
  for (const [key, meta] of Object.entries(SHOP_PHOTOS)) {
    shopPhotoUids[key] = await uploadAsset(
      `Shop — ${key.replace(/_/g, ' ')}`,
      `shop-${key.replace(/_/g, '-')}.jpg`,
      await fetchPhoto(meta.id, { ar: meta.ar }),
      'image/jpeg',
      `${meta.credit}. Free for commercial use under the Unsplash License.`,
    );
  }
  const assetUids = [
    logoUid,
    heroUid,
    ...Object.values(coverUids),
    ...Object.values(shopPhotoUids),
  ];

  log.step('Site settings');
  const settingsUid = await upsertEntry('site_settings', { ...SITE_SETTINGS, logo: logoUid });

  // Articles reference each other, so they are created first WITHOUT their
  // cross-references, then updated once every uid is known.
  log.step('Articles (pass 1 — create)');
  const articleUids = {};
  for (const a of ARTICLES) {
    articleUids[a.title] = await upsertEntry('article', {
      title: a.title,
      url: `/articles/${slug(a.title)}`,
      summary: a.summary,
      author_name: a.author_name,
      published_on: a.published_on,
      cover_image: coverUids[a.title],
      cover_image_alt: a.cover_image_alt,
      body: a.body(),
      seo: { meta_title: a.title, meta_description: a.summary },
    });
  }

  log.step('Articles (pass 2 — cross-references)');
  for (const a of ARTICLES) {
    const others = ARTICLES.filter((x) => x.title !== a.title)
      .slice(0, 3)
      .map((x) => ref(articleUids[x.title], 'article'));
    await cma(STACK_API_KEY, `/content_types/article/entries/${articleUids[a.title]}`, {
      method: 'PUT',
      body: { entry: { featured_articles: others } },
    });
  }
  log.ok(`${ARTICLES.length} articles cross-linked`);

  log.step('Home page');
  const homeUid = await upsertEntry('page_home', {
    title: HOME.title,
    url: HOME.url,
    hero: { ...HOME.hero, body: HOME.hero.body(), image: heroUid },
    featured_articles: ARTICLES.slice(0, 3).map((a) => ref(articleUids[a.title], 'article')),
    seo: HOME.seo,
  });

  log.step('Shop landing pages');
  const shopUids = {};
  for (const page of SHOP_PAGES) {
    shopUids[page.title] = await upsertEntry('shop_landing_page', {
      title: page.title,
      url: page.url,
      summary: page.summary,
      blocks: resolveShopFields(page.blocks, shopPhotoUids),
      seo: page.seo,
    });
  }

  log.step(`Publishing to "${ENVIRONMENT}"`);
  for (const uid of assetUids) await publishAsset(uid);
  log.ok(`${assetUids.length} assets published`);
  await publishEntry('site_settings', settingsUid);
  for (const uid of Object.values(articleUids)) await publishEntry('article', uid);
  await publishEntry('page_home', homeUid);
  for (const uid of Object.values(shopUids)) await publishEntry('shop_landing_page', uid);
  log.ok(`${2 + Object.keys(articleUids).length + Object.keys(shopUids).length} entries published`);

  // Publishing is asynchronous. Assert it landed rather than trusting the 200s.
  log.step('Verifying publish state');
  await new Promise((r) => setTimeout(r, 3000));
  let unpublished = [];
  for (const [ct, uid] of [
    ['site_settings', settingsUid],
    ['page_home', homeUid],
    ...Object.values(articleUids).map((u) => ['article', u]),
    ...Object.values(shopUids).map((u) => ['shop_landing_page', u]),
  ]) {
    const { entry } = await cma(
      STACK_API_KEY,
      `/content_types/${ct}/entries/${uid}?include_publish_details=true`,
    );
    // The latest version must be the published one, not merely some version.
    const live = (entry.publish_details ?? []).some((d) => d.version === entry._version);
    if (!live) unpublished.push(`${ct}/${entry.title}`);
  }
  if (unpublished.length) {
    log.warn(
      `not yet live (publishing is async — re-check in a moment): ${unpublished.join(', ')}`,
    );
  } else {
    log.ok('every entry is published at its latest version');
  }

  log.step('Done');
  log.info(`home entry      ${homeUid}`);
  log.info(`site settings   ${settingsUid}`);
  ARTICLES.forEach((a) => log.info(`article         ${articleUids[a.title]}  ${a.title}`));
  SHOP_PAGES.forEach((pg) => log.info(`shop page       ${shopUids[pg.title]}  ${pg.title}`));
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
