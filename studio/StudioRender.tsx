'use client';

/**
 * The client boundary for visitor pages: SDK init, component registry, renderer.
 *
 * Import order is load-bearing. Both side-effect imports must run before
 * <StudioComponent /> renders, or the first paint happens against an empty
 * registry and every registered component falls back to a placeholder.
 *
 * This is also the ONLY module in the server graph that pulls in the Studio
 * renderer — see app/[locale]/layout.tsx for why that matters.
 */
import './client'; // studioSdk.init + Live Preview
import './register'; // registerComponents call
import { useEffect, useState } from 'react';
import { registerBreakpoints, StudioComponent } from '@contentstack/studio-react';

// Gives authors the tablet/mobile switcher on the canvas. Without it they can
// only ever see and design the desktop view.
//
// The first entry MUST be the `default` breakpoint and carries no media query —
// it is the canvas's base state. The rest are the sizes the switcher offers.
registerBreakpoints([
  { id: 'default', displayName: 'Desktop', previewSize: { width: 1440, height: 900 } },
  {
    id: 'tablet',
    displayName: 'Tablet',
    query: '(max-width: 1024px)',
    previewSize: { width: 834, height: 1112 },
  },
  {
    id: 'mobile',
    displayName: 'Mobile',
    query: '(max-width: 640px)',
    previewSize: { width: 390, height: 844 },
  },
]);

/**
 * <StudioComponent /> is the ONE renderer for both visitor pages and pages
 * opened inside Studio's builder iframe — it detects the mode itself and
 * attaches the Visual Editor overlay when needed.
 *
 * The spec is fetched on the server and passed straight through. Do not re-fetch
 * with useCompositionData here; that is a hydration mismatch.
 *
 * `editorFallback` is the one exception: Studio opened a URL that has no saved
 * composition yet (a new Template). With no spec, <StudioComponent /> takes its
 * editor path and asks Studio for the spec over postMessage — which only works
 * in the browser, and on the server it throws for want of a config. So that
 * branch renders after mount, never during SSR.
 */
type EditorFallback = { url: string; locale: string; searchQuery: string };

export function StudioRender({
  specOptions,
  editorFallback,
}: {
  specOptions: unknown;
  editorFallback?: EditorFallback;
}) {
  if (editorFallback) return <EmptyEditor {...editorFallback} />;
  return <StudioComponent specOptions={specOptions as never} />;
}

function EmptyEditor({ url, locale, searchQuery }: EditorFallback) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <StudioComponent
      specOptions={
        {
          spec: null,
          fetchOptions: { compositionQuery: { url }, options: { locale }, searchQuery },
        } as never
      }
    />
  );
}
