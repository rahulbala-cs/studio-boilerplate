'use client';

/**
 * Empty fields, made visible and clickable inside Contentstack's editors.
 *
 * lib/complete-entry.ts gives every field of a new entry an edit tag. A tagged
 * field that is still empty renders as an element with no size, though, and
 * Visual Editor cannot select what has no size. So inside an editor iframe
 * (Visual Editor, Live Preview, Studio), every empty tagged element is labelled
 * with its field name, and app/globals.css draws it as a dashed "Add Headline"
 * box. Visitors never see any of it: nothing here runs outside an iframe.
 */
import { useEffect, useState } from 'react';

const inIframe = () => typeof window !== 'undefined' && window.self !== window.top;

/**
 * For components that render nothing when their value is empty (Eyebrow,
 * CtaButton). False on the server and on first paint, so hydration matches;
 * true after mount inside an editor, where the empty element should render so
 * an author can click it and type.
 */
export function useInEditor() {
  const [inEditor, setInEditor] = useState(false);
  useEffect(() => setInEditor(inIframe()), []);
  return inEditor;
}

/** "blocks.0.hero_split.cta_label" → "Cta label". Indexes and `url` are skipped. */
function fieldLabel(cslp: string) {
  const parts = cslp.split('.').filter((p) => !/^\d+$/.test(p) && p !== 'url' && p !== 'href');
  const name = parts[parts.length - 1] ?? 'field';
  const words = name.replace(/_/g, ' ').replace(/\bcta\b/, 'CTA');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelEmptyFields() {
  document.querySelectorAll<HTMLElement>('[data-cslp]').forEach((el) => {
    // Leaves only: a list wrapper is empty when its list is, and Visual Editor
    // already shows its own "add" panel there (see components/Stack.tsx).
    const empty = el.tagName !== 'IMG' && el.childElementCount === 0 && !el.textContent?.trim();
    if (empty) el.dataset.csEmpty = `Add ${fieldLabel(el.dataset.cslp ?? '')}`;
    else delete el.dataset.csEmpty;
  });
}

let installed = false;

/** Called once from lib/studio.client.ts. A no-op for visitors. */
export function installEditorHints() {
  if (installed || !inIframe()) return;
  installed = true;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => {
      installed = false;
      installEditorHints();
    });
    return;
  }
  document.documentElement.dataset.csEditing = '';
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      labelEmptyFields();
    });
  };
  // Pages re-render after every edit; relabel whenever the DOM changes.
  new MutationObserver(run).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  run();
}
