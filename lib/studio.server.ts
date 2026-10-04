import 'server-only';

/**
 * The SERVER half of the Studio SDK: fetching only, no rendering.
 *
 * It imports `studio-core`, never `studio-react`. studio-react's components call
 * `useContext`, and importing them into a Server Component, even indirectly,
 * fails with "Cannot read properties of null (reading 'useContext')".
 * Rendering lives in lib/studio.client.ts.
 */
import { studioSdk } from '@contentstack/studio-core';
import { fetchTemplateEntry } from './complete-entry';
import { createStack, compositionsCt } from './stack';

export const stack = createStack();

export const sdk = studioSdk.init({
  stackSdk: stack,
  contentTypeUid: compositionsCt,
  // Both options must match studio.client.ts.
  // appendTags: emits the data-cslp edit tags Visual Editor maps elements to fields with.
  cslp: { appendTags: true },
  // Gives a new entry every field, so all of it is editable. See lib/complete-entry.ts.
  fetchTemplateEntry,
});
