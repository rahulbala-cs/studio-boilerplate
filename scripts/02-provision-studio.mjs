/**
 * Step 2 — the Studio project.
 *
 *   compositions content type (two-pass, self-references last)
 *   → Studio project registration + configuration
 *
 * Touches two API surfaces: the CMA for the content type, the Studio API for the
 * project. Skip either and the canvas has nothing to load.
 */
import { resolveAuth, cma, studio, log, orgUid } from './lib/cma.mjs';
import { compositionsContentType } from './lib/compositions-ct.mjs';
import {
  STACK_API_KEY,
  COMPOSITIONS_CT,
  STUDIO_PROJECT_NAME,
  CANVAS_URL,
  ENVIRONMENT_UID,
  LOCALE,
  writeEnv,
} from './lib/config.mjs';

async function ensureCompositionsCT() {
  log.step(`Compositions content type "${COMPOSITIONS_CT}"`);
  const { firstPass, full } = compositionsContentType(COMPOSITIONS_CT);
  let exists = true;
  try {
    await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}`);
  } catch (e) {
    if (e.status !== 422 && e.status !== 404) throw e;
    exists = false;
  }
  if (!exists) {
    await cma(STACK_API_KEY, '/content_types', {
      method: 'POST',
      body: { content_type: firstPass },
    });
    log.ok('created (without self-references)');
  } else {
    log.skip('exists');
  }
  await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}`, {
    method: 'PUT',
    body: { content_type: full },
  });
  log.ok('full schema applied (linked_sections + symbols)');

  // Assert the three shapes that fail silently when wrong.
  const { content_type } = await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}`);
  const byUid = Object.fromEntries(content_type.schema.map((f) => [f.uid, f]));
  const problems = [];
  if (byUid.linked_schemas?.data_type !== 'group' || byUid.linked_schemas?.multiple !== true) {
    problems.push('linked_schemas must be a group with multiple:true');
  }
  if (byUid.linked_sections?.data_type !== 'reference') {
    problems.push('linked_sections must be a reference field');
  }
  if (byUid.symbols?.data_type !== 'reference') problems.push('symbols must be a reference field');
  const um = (byUid.url_metadata?.schema ?? []).map((f) => f.uid);
  if (!um.includes('url_source') || !um.includes('url_queries')) {
    problems.push('url_metadata needs both url_source and url_queries');
  }
  if (!byUid.ui_preview)
    problems.push('ui_preview file field missing — section thumbnails would no-op');
  const sv = (byUid.static_value?.schema ?? []).map((f) => f.uid);
  if (sv.length !== 13) problems.push(`static_value has ${sv.length} buckets, expected 13`);
  if (problems.length)
    throw new Error(`Compositions CT is mis-shaped:\n  - ${problems.join('\n  - ')}`);
  log.ok(
    `verified: linked_schemas group[], linked_sections ref, ${sv.length} static_value buckets`,
  );
}

async function ensureProject() {
  log.step(`Studio project "${STUDIO_PROJECT_NAME}"`);
  const { projects = [] } = await studio('/projects');

  // Never create blind: a second project on the same stack splits compositions
  // across two projects with nothing reporting it.
  const onThisStack = projects.filter((p) => p.connectedStackApiKey === STACK_API_KEY);
  let project = onThisStack.find((p) => p.name === STUDIO_PROJECT_NAME) ?? onThisStack[0];

  if (project) {
    log.skip(`reusing existing project ${project.uid}`);
  } else {
    project = await studio('/projects', {
      method: 'POST',
      body: {
        name: STUDIO_PROJECT_NAME,
        description: 'Reference implementation: content types → components → sections → templates.',
        connectedStackApiKey: STACK_API_KEY,
        contentTypeUid: COMPOSITIONS_CT,
        canvasUrl: CANVAS_URL,
      },
    });
    project = project.project ?? project;
    log.ok(`created ${project.uid}`);
  }

  // Configuration attaches environment + locale. The environment must be the
  // UID — passing the name is accepted and then silently never binds.
  await studio(`/projects/${project.uid}`, {
    method: 'PUT',
    body: {
      name: STUDIO_PROJECT_NAME,
      canvasUrl: CANVAS_URL,
      connectedStackApiKey: STACK_API_KEY,
      contentTypeUid: COMPOSITIONS_CT,
      settings: {
        configuration: { environment: ENVIRONMENT_UID, locale: LOCALE },
        // Shows Studio's Data tab, where the Site Header and Footer pin Site Settings.
        isFreeformEnabled: true,
      },
    },
  });
  const res = await studio(`/projects/${project.uid}`);
  if (!(res.project ?? res)?.settings?.isFreeformEnabled) {
    log.warn('Enable Freeform Feature did not persist: turn it on in Studio → Project settings.');
  }
  log.ok(`configured: canvas ${CANVAS_URL}, env ${ENVIRONMENT_UID}, locale ${LOCALE}`);
  return project.uid;
}

async function main() {
  await resolveAuth();
  if (!ENVIRONMENT_UID)
    throw new Error('CONTENTSTACK_ENVIRONMENT_UID missing — run 01-provision-stack.mjs first.');
  console.log(`\n\x1b[1mProvisioning Studio project\x1b[0m  (org ${orgUid()})`);
  await ensureCompositionsCT();
  const projectUid = await ensureProject();
  writeEnv({ STUDIO_PROJECT_UID: projectUid });
  log.step('Done');
  log.info(`STUDIO_PROJECT_UID=${projectUid} written to .env`);
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e.message}\x1b[0m`);
  process.exit(1);
});
