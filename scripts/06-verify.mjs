/**
 * Step 6 — the handover gate.
 *
 * Eight things decide whether what you built is usable by a marketer rather than
 * only by a developer. Every one of them fails SILENTLY: the page still renders,
 * nothing errors, and the gap only surfaces when a non-developer opens Studio
 * and finds they cannot select, recognise, or edit anything.
 *
 * That asymmetry is why this is a script and not a checklist. It prints counts,
 * never adjectives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuth, cma, studio, log } from './lib/cma.mjs';
import { decodeUi, countSectionNodes } from './lib/composition.mjs';
import {
  STACK_API_KEY,
  COMPOSITIONS_CT,
  ENVIRONMENT,
  ENVIRONMENT_UID,
  CANVAS_URL,
  STUDIO_PROJECT_UID,
} from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) =>
  fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : '';
const countOf = (s, re) => (s.match(re) ?? []).length;
/** Strip comments before counting: this file talks ABOUT `wrap: false`, and a
 *  naive grep counts the prose as code and reports a mismatch that isn't one. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const results = [];
const check = (n, label, ok, detail) => {
  results.push({ n, label, ok, detail });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}. ${label}\n      ${detail}`);
};

/** The compositions list caps at 100 server-side — page, or you audit a slice. */
async function allCompositions() {
  const out = [];
  for (let skip = 0; ; skip += 100) {
    const res = await cma(
      STACK_API_KEY,
      `/content_types/${COMPOSITIONS_CT}/entries?limit=100&skip=${skip}&include_count=true&include_publish_details=true`,
    );
    out.push(...(res.entries ?? []));
    if (out.length >= (res.count ?? 0) || !res.entries?.length) return out;
  }
}

async function main() {
  await resolveAuth();
  console.log('\n\x1b[1mDefinition of done — 8 checks\x1b[0m\n');

  // 1 — Visual Editor wiring. Without appendTags no component gets an edit tag;
  // without builder mode Visual Editor opens but nothing is clickable; without
  // fetchTemplateEntry a new entry's empty fields can only be edited in the form.
  const client = code(read('lib/studio.client.ts'));
  const server = code(read('lib/studio.server.ts'));
  const both = (re) => countOf(client, re) + countOf(server, re);
  const appendTags = both(/appendTags:\s*true/g);
  const completer = both(/fetchTemplateEntry\b/g) >= 2;
  const builder = /mode:\s*['"]builder['"]/.test(client);
  check(
    1,
    'Visual Editor wiring in SDK init',
    appendTags >= 2 && completer && builder,
    `appendTags in ${appendTags} of 2 init modules · fetchTemplateEntry=${completer} · Live Preview mode builder=${builder}`,
  );

  // 2 — the node's own tag. wrap:false without the spread is WORSE than neither:
  // Studio puts nothing on a wrapper and the component drops it, so the node
  // cannot be selected on the canvas at all.
  const registry = code(read('lib/studio-components.ts'));
  const registrations = countOf(registry, /register(?:Lazy)?Component\(/g);
  const wraps = countOf(registry, /wrap:\s*false/g);
  const componentFiles = fs
    .readdirSync(path.join(ROOT, 'components'))
    .filter((f) => f.endsWith('.tsx'));
  const spreading = componentFiles.filter((f) =>
    /\{\.\.\.studioAttributes\}/.test(code(read(`components/${f}`))),
  ).length;
  check(
    2,
    'studioAttributes spread + wrap:false on every registration',
    registrations === wraps && registrations === spreading,
    `${registrations} registrations · ${wraps} wrap:false · ${spreading}/${componentFiles.length} components spreading studioAttributes`,
  );

  // 3 — palette thumbnails. Missing, Studio renders a text placeholder.
  const thumbs = countOf(registry, /thumbnailUrl:/g);
  check(
    3,
    'thumbnailUrl on every registerComponent call',
    registrations === thumbs,
    `${registrations} registrations · ${thumbs} thumbnails`,
  );

  // 4 — section thumbnails. A DIFFERENT system from #3, constantly conflated:
  // ui_preview is an asset on the composition entry, thumbnailUrl is a data URI
  // in code. Fixing one does nothing for the other.
  //
  // The discriminator is `place_composition_as`, NOT a `type` field. Filtering on
  // `type` matches nothing and reports a clean run having inspected zero sections.
  const comps = await allCompositions();
  const sections = comps.filter((c) => c.place_composition_as === 'section');
  const templates = comps.filter((c) => c.place_composition_as === 'page');
  const blank = sections.filter((s) => !s.ui_preview?.url);
  check(
    4,
    'ui_preview set on every Section',
    sections.length > 0 && blank.length === 0,
    `inspected ${comps.length} compositions · ${sections.length} sections · ${blank.length} blank${blank.length ? `: ${blank.map((b) => b.title).join(', ')}` : ''}`,
  );

  // 5 — Live Preview + a preview token, or the canvas never loads.
  const settings = await cma(STACK_API_KEY, '/stacks/settings');
  const lp = settings.stack_settings?.live_preview ?? {};
  const { tokens = [] } = await cma(STACK_API_KEY, '/stacks/delivery_tokens');
  let hasPreviewToken = false;
  for (const t of tokens) {
    const full = await cma(
      STACK_API_KEY,
      `/stacks/delivery_tokens/${t.uid}?include_preview_token=true`,
    );
    if (full.token?.preview_token) hasPreviewToken = true;
  }
  check(
    5,
    'Live Preview enabled on the stack + preview token minted',
    !!lp.enabled && hasPreviewToken,
    `live_preview.enabled=${!!lp.enabled} · default-env=${lp['default-env'] ?? '(none)'} · preview token=${hasPreviewToken}`,
  );

  // 6 — the canvas route, and the project pointing at it.
  const canvasFile = read('app/[locale]/canvas/page.tsx');
  const { projects = [] } = await studio('/projects');
  const project =
    projects.find((p) => p.uid === STUDIO_PROJECT_UID) ??
    projects.find((p) => p.connectedStackApiKey === STACK_API_KEY);
  check(
    6,
    'Canvas route mounted and matching the project config',
    /<StudioCanvas/.test(canvasFile) && project?.canvasUrl === CANVAS_URL,
    `app/[locale]${CANVAS_URL}/page.tsx mounts <StudioCanvas /> · project canvasUrl=${project?.canvasUrl ?? '(none)'}`,
  );

  // 7 — published. The hardest of these to see: the CMA looks perfect, the canvas
  // resolves the right composition, and Delivery serves the PREVIOUS version. So
  // the LATEST version must be the one published to this environment.
  const isLive = (c) =>
    (c.publish_details ?? []).some(
      (d) =>
        (d.environment === ENVIRONMENT_UID || d.environment === ENVIRONMENT) &&
        d.version === c._version,
    );
  const unpublished = comps.filter((c) => !isLive(c));
  check(
    7,
    'Every Section and Template published',
    unpublished.length === 0,
    `${comps.length - unpublished.length}/${comps.length} published to "${ENVIRONMENT}"${unpublished.length ? ` · missing: ${unpublished.map((u) => u.title).join(', ')}` : ''}`,
  );

  // 8 — composed of Sections. Nothing else catches this: a monolith renders
  // correctly, matches the design, and passes all seven checks above.
  const counts = templates.map((t) => ({
    title: t.title,
    nodes: countSectionNodes(decodeUi(t.ui)),
    linked: (t.linked_sections ?? []).length,
  }));
  check(
    8,
    'Every Template is composed of Sections, not one component',
    counts.length > 0 && counts.every((c) => c.nodes > 0 && c.linked > 0),
    counts
      .map((c) => `${c.title}: ${c.nodes} section nodes, ${c.linked} linked_sections`)
      .join(' · '),
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length
      ? `\n\x1b[31m${failed.length} of 8 checks failed — not ready to hand over.\x1b[0m\n`
      : '\n\x1b[32mAll 8 checks passed.\x1b[0m\n',
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
