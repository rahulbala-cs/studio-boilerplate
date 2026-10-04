'use client';

/**
 * Layer 1 — an atom. Renders exactly ONE piece of content.
 *
 * The `$text` prop is the CSLP tag for whichever field `text` was bound to, and
 * it is what makes the label click-to-edit in Studio. Spread it on the element
 * that renders the value — putting it on a parent makes the whole block one edit
 * target instead of the field.
 */
import type { Cslptag, StudioAttributes } from '@contentstack/studio-react';
import { useInEditor } from '@/lib/editor-hints';

export interface EyebrowProps {
  text?: string | null;
  /** CSLP tag for `text`. Supplied by Studio, never constructed by hand. */
  $text?: Cslptag;
}

export default function Eyebrow({
  text,
  $text,
  ...rest
}: EyebrowProps & StudioAttributes & Record<string, unknown>) {
  const { studioAttributes } = rest as StudioAttributes;
  const inEditor = useInEditor();
  // Bindings resolve at runtime and may resolve to nothing. Render null rather
  // than an empty styled box — and never throw, because one throw during canvas
  // preview kills the whole render. Inside an editor the empty element does
  // render, so an author can click it and type (see lib/editor-hints.ts).
  if (!text && !inEditor) return null;
  return (
    <p className="eyebrow" {...$text} {...studioAttributes}>
      {text}
    </p>
  );
}
