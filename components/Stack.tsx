'use client';

/**
 * Layer 2 — a layout primitive.
 *
 * Arranges whatever is dropped into it. Deliberately has no opinion about what
 * it contains, which is why the Header, the Footer and the Featured Articles
 * grid can all reuse it.
 *
 * `className` is merged rather than replaced: Studio passes through any classes
 * set on the node, which is how a Section gives one instance a card treatment
 * without forking the component.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StudioAttributes } from '@contentstack/studio-react';

export type Gap = 'none' | 'tight' | 'normal' | 'loose';
export type Align = 'start' | 'center' | 'end' | 'between' | 'stretch';
/**
 * `horizontal` packs items to their content width — right for a nav.
 * `split`      gives every child an equal share and wraps to one column on
 *              narrow screens — right for a two-column hero.
 * `grid`       is a real auto-fitting grid — right for card collections, where a
 *              wrapping flex row leaves an orphaned last item stretched across
 *              the whole row.
 */
export type Direction = 'vertical' | 'horizontal' | 'split' | 'grid';
/**
 * Which side the LAST child sits on in a `split`. A split is usually copy then
 * media, so this reads as "media side". The values match the Shop Landing
 * Page's `image_position` field on purpose, so a Section can bind the field
 * straight to this prop and the editor flips the layout from the entry.
 */
export type Side = 'right' | 'left';

export interface StackProps {
  children?: ReactNode;
  direction?: Direction;
  gap?: Gap;
  align?: Align;
  wrapItems?: boolean;
  side?: Side;
  /**
   * For a Stack that wraps a list Repeater (`repeaterWrapper`). When the list is
   * empty, Visual Editor shows its own "This page doesn't have any … added"
   * panel with an add button inside the Stack, so a new entry's first block can
   * be added from the page instead of only from the form.
   */
  emptyAddButton?: boolean;
  className?: string;
}

/** The class Visual Editor looks for; it renders its add panel inside. */
const VE_EMPTY_PARENT = 'visual-builder__empty-block-parent';
const VE_EMPTY_PANEL = 'visual-builder__empty-block';

/**
 * True once mounted inside Visual Editor's iframe with an empty list.
 *
 * Client-only on purpose: visitors never need the class, and Visual Editor
 * looks for it only when elements are added or removed (a class change alone
 * is not enough). So once the class is on, a no-op comment node is appended to
 * trigger that rescan. Without it, a server-rendered empty list is never
 * noticed on first load.
 */
function useEmptyListPanel(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || window.self === window.top) return;
    // The panel Visual Editor injects is not a list item.
    const sync = () =>
      setEmpty(![...el.children].some((c) => !c.classList.contains(VE_EMPTY_PANEL)));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { childList: true });
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (empty) ref.current?.appendChild(document.createComment('ve-rescan'));
  }, [empty]);

  return { ref, empty };
}

export default function Stack({
  children,
  direction = 'vertical',
  gap = 'normal',
  align = 'start',
  wrapItems = true,
  side = 'right',
  emptyAddButton = false,
  className,
  ...rest
}: StackProps & StudioAttributes & Record<string, unknown>) {
  const { studioAttributes } = rest as StudioAttributes;
  const { ref, empty } = useEmptyListPanel(emptyAddButton);
  const classes = [
    'stack',
    `stack--${direction}`,
    `stack--gap-${gap}`,
    `stack--align-${align}`,
    wrapItems && (direction === 'horizontal' || direction === 'split') ? 'stack--wrap' : '',
    direction === 'split' && side === 'left' ? 'stack--side-left' : '',
    empty ? VE_EMPTY_PARENT : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={classes} {...studioAttributes}>
      {children}
    </div>
  );
}
