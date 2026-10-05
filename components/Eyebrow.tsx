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
import { useInEditor } from '@/studio/editor-hints';

export interface EyebrowProps {
  text?: string | null;
  /** CSLP tag for `text`. Supplied by Studio, never constructed by hand. */
  $text?: Cslptag;
  /** Classes Studio sets on the node (Design panel styles, node classes). */
  className?: string;
}

export default function Eyebrow({
  text,
  $text,
  className,
  ...rest
}: EyebrowProps & StudioAttributes & Record<string, unknown>) {
  const { studioAttributes } = rest as StudioAttributes;
  const inEditor = useInEditor();
  // Bindings resolve at runtime and may resolve to nothing. Render null rather
  // than an empty styled box — and never throw, because one throw during canvas
  // preview kills the whole render. Inside an editor the empty element does
  // render, so an author can click it and type (see studio/editor-hints.ts).
  if (!text && !inEditor) return null;
  return (
    // `className` is merged, not replaced: it carries the styles an author sets
    // in Studio. `$text` goes AFTER studioAttributes: inside a Repeater,
    // studioAttributes carries the item's own `data-cslp`, and the field's tag
    // must win or clicking the label selects the whole item.
    <p
      className={['eyebrow', className].filter(Boolean).join(' ')}
      {...studioAttributes}
      {...$text}
    >
      {text}
    </p>
  );
}
