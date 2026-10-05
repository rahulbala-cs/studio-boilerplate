'use client';

/**
 * The CLIENT half: SDK init, Live Preview, and the component registry.
 *
 * Everything React-aware lives behind this boundary. See studio/server.ts
 * for why the two halves are separate.
 */
import ContentstackLivePreview from '@contentstack/live-preview-utils';
import { studioSdk } from '@contentstack/studio-react';
import { fetchTemplateEntry } from './complete-entry';
import { installEditorHints } from './editor-hints';
import { createStack, compositionsCt, apiKey, environment, previewToken } from '@/lib/stack';

const stack = createStack();

// Wrapped deliberately. If Live Preview init throws (bad token, Live Preview off
// on the stack, a network blip) an unwrapped call takes studioSdk.init down with
// it, and Studio then reports "SDK Not Initialized" — pointing at the wrong layer.
try {
  if (previewToken) {
    ContentstackLivePreview.init({
      enable: true,
      // Required for Visual Editor. With the default ("preview") the page loads
      // but nothing on it can be clicked to edit, and nothing errors.
      mode: 'builder',
      // Server-rendered pages: each edit reloads the iframe with a fresh
      // `live_preview` hash, which the server fetches the draft with.
      ssr: true,
      stackDetails: { apiKey, environment },
      clientUrlParams: { host: 'app.contentstack.com' },
      // Only inside the Live Preview panel. Without the exclusion a floating
      // "Edit" button renders for every ordinary visitor on the site.
      editButton: { enable: true, exclude: ['outsideLivePreviewPortal'] },
      // Builder mode otherwise shows every visitor a floating "Start Editing" button.
      editInVisualBuilderButton: { enable: false },
    });
  }
} catch (err) {
  console.warn('[studio] Live Preview init failed; continuing without it.', err);
}

// Same options as studio/server.ts; see the comments there.
studioSdk.init({
  stackSdk: stack,
  contentTypeUid: compositionsCt,
  cslp: { appendTags: true },
  fetchTemplateEntry,
});

// Inside an editor iframe only: empty fields get a clickable "Add …" box.
installEditorHints();
