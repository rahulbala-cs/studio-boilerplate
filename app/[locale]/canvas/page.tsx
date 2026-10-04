'use client';

/**
 * The canvas route. Studio iframes this to author Sections.
 *
 * Studio requests the environment Base URL (which ends in the locale) plus the
 * project's Canvas URL (`/canvas`, set by scripts/02-provision-studio.mjs), so
 * this route serves /en/canvas. A mismatch produces MISSING_CANVAS_URL.
 *
 * Everything is imported inside an effect so this route contributes NOTHING to
 * the server module graph — see app/[locale]/layout.tsx for the failure that avoids.
 * Nothing is lost by it: <StudioCanvas> is editing-only and renders nothing
 * outside Studio anyway (it says so itself, in a console warning).
 *
 * The route renders only the canvas: no header, no footer, no analytics, no
 * third-party scripts. Anything mounted here runs inside Studio's iframe, and a
 * script that throws surfaces as a runtime overlay that looks like Studio is
 * broken.
 */
import { useEffect, useState, type ComponentType } from 'react';

export default function CanvasPage() {
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Init and registrations must land before the canvas renders, so they are
    // awaited in order rather than imported at module scope.
    (async () => {
      await import('@/lib/studio.client');
      await import('@/lib/studio-components');
      const { StudioCanvas } = await import('@contentstack/studio-react');
      if (!cancelled) setCanvas(() => StudioCanvas as ComponentType);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return Canvas ? <Canvas /> : null;
}
