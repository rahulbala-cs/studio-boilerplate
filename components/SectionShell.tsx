/**
 * Layer 2 — a layout primitive.
 *
 * A full-bleed band with a centred, width-constrained inner column. It renders
 * NO content of its own: everything visible comes from whatever an author drops
 * into its `slot`. That is what makes it reusable across every Section here.
 *
 * Layout contract: the shell owns the band's padding and the inner column's
 * max-width, because it IS the layout. Content components never set their own
 * width — they fill the cell this gives them.
 */
import type { ReactNode } from 'react';
import type { StudioAttributes } from '@contentstack/studio-react';

export type Tone = 'default' | 'muted' | 'accent' | 'dark';
export type Width = 'narrow' | 'normal' | 'wide';
export type Density = 'compact' | 'normal' | 'spacious';

export interface SectionShellProps {
  /** The drop zone. Studio fills this with whatever the author places inside. */
  children?: ReactNode;
  tone?: Tone;
  width?: Width;
  density?: Density;
  className?: string;
}

export default function SectionShell({
  children,
  tone = 'default',
  width = 'normal',
  density = 'normal',
  className,
  ...rest
}: SectionShellProps & StudioAttributes & Record<string, unknown>) {
  const { studioAttributes } = rest as StudioAttributes;
  return (
    // studioAttributes goes on the OUTERMOST element and LAST, so it wins.
    // Without it — and `wrap: false` in the registration — this node cannot be
    // selected on the canvas at all.
    <section
      // Namespaced on purpose: `width` and `density` share the value "normal",
      // so unprefixed classes would both emit `shell--normal` and the later CSS
      // rule would silently win — a band that ignores its own width setting.
      className={`shell shell--${tone} shell--w-${width} shell--d-${density} ${className ?? ''}`.trim()}
      {...studioAttributes}
    >
      <div className="shell__inner">{children}</div>
    </section>
  );
}
