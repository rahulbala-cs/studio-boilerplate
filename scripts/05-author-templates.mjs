/**
 * Step 5 — author the Templates, then prove they are composed of Sections.
 *
 * The structural check at the end is the only one a monolith fails. A template
 * whose whole body is one component renders correctly, matches the design, and
 * passes every other check — it simply has no Sections, nothing to reorder and
 * nothing to reuse. Counting `section-composition` nodes is how you catch it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuth, cma, log } from './lib/cma.mjs';
import { buildTemplates } from './lib/templates.mjs';
import { upsertComposition, decodeUi, countSectionNodes } from './lib/composition.mjs';
import { STACK_API_KEY, COMPOSITIONS_CT } from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const STATE = path.join(ROOT, '.provision-state.json');

async function main() {
  await resolveAuth();
  if (!fs.existsSync(STATE)) throw new Error('Run 04-author-sections.mjs first.');
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  if (state.stack !== STACK_API_KEY) {
    throw new Error('Section state is from another stack. Run npm run provision:sections first.');
  }

  console.log('\n\x1b[1mAuthoring Templates\x1b[0m');
  const templates = buildTemplates(state.sections);
  state.templates = state.templates ?? {};

  for (const def of templates) {
    log.step(`${def.title}  →  ${def.url}`);
    const { uid, created } = await upsertComposition(def);
    log.ok(`${created ? 'created' : 'updated'} ${uid}`);

    // Read it back: a 200 is not proof. If the compositions CT were missing the
    // url_metadata group the CMA would have dropped it without a word, leaving
    // the template on legacy URL semantics.
    const { entry } = await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}`);
    if (entry.url_metadata?.url_source !== 'content_type_url_pattern') {
      throw new Error(
        `${def.title}: url_metadata did not persist (got ${JSON.stringify(entry.url_metadata)})`,
      );
    }

    const placed = countSectionNodes(decodeUi(entry.ui));
    const linked = (entry.linked_sections ?? []).length;
    if (placed === 0 && linked === 0) {
      throw new Error(
        `${def.title}: MONOLITH — no section-composition nodes. Decompose before shipping.`,
      );
    }
    log.ok(`composed of Sections: ${placed} placed, ${linked} linked_sections`);
    log.info(
      `url_source ${entry.url_metadata.url_source} · connected to ${entry.connected_content_type}`,
    );
    state.templates[def.connected_content_type] = { uid, title: def.title, url: def.url };
  }

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  log.step('Done');
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
