'use client';

/**
 * Layer 1 — an atom.
 *
 * Label and href are SEPARATE props, deliberately. Contentstack's `link` field is
 * an object (`{ title, href }`), and binding the whole object to one prop ships
 * `[object Object]` into the DOM. Two props means two clicks in the Data Picker
 * and zero mystery renders.
 */
import type { Cslptag, StudioAttributes } from '@contentstack/studio-react';
import { useInEditor } from '@/studio/editor-hints';

export type Variant = 'primary' | 'secondary' | 'quiet';

/** Tolerant link signature: accept the leaf, the object, or nothing. */
type LinkProp = string | { title?: string; href?: string } | null | undefined;

const toHref = (link: LinkProp): string | undefined => {
  if (!link) return undefined;
  return typeof link === 'string' ? link : link.href;
};

export interface CtaButtonProps {
  label?: string | null;
  href?: LinkProp;
  variant?: Variant;
  $label?: Cslptag;
  $href?: Cslptag;
  /** Classes Studio sets on the node (Design panel styles, node classes). */
  className?: string;
}

export default function CtaButton({
  label,
  href,
  variant = 'primary',
  $label,
  $href,
  className,
  ...rest
}: CtaButtonProps & StudioAttributes & Record<string, unknown>) {
  const { studioAttributes } = rest as StudioAttributes;
  const url = toHref(href);
  const inEditor = useInEditor();
  // No label, no button, for visitors. Inside an editor the empty button
  // renders so an author can click it and type (see studio/editor-hints.ts).
  if (!label && !inEditor) return null;
  return (
    // Merged className and field tags after studioAttributes: see Eyebrow.tsx.
    <a
      className={['cta', `cta--${variant}`, className].filter(Boolean).join(' ')}
      href={url ?? '#'}
      {...studioAttributes}
      {...$href}
      {...$label}
    >
      {label}
    </a>
  );
}
