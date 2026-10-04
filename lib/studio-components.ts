/**
 * Component registrations — what Studio offers in its palette.
 *
 * Four primitives, all of them atoms or layout. No composites, deliberately:
 * a component that renders a heading AND an image AND a body AND a button is
 * four decisions an author can no longer make. Everything larger is composed
 * from these in a Section, where a marketer can reach it.
 *
 * Every registration ships three things in this same file, never as a follow-up:
 *   • thumbnailUrl  — or the palette shows a text placeholder
 *   • wrap: false   — pairs with the studioAttributes spread in the component
 *   • defaultValue  — or the palette tile previews blank
 *
 * Registered eagerly: these four are tiny and on every page. Use
 * `registerLazyComponent` for genuinely heavy components (a carousel, a map).
 */
import { registerComponent } from '@contentstack/studio-react';
import SectionShell from '@/components/SectionShell';
import Stack from '@/components/Stack';
import Eyebrow from '@/components/Eyebrow';
import CtaButton from '@/components/CtaButton';
import { thumb, GLYPHS } from '@/components/thumbnails';

registerComponent({
  type: 'meridian-section-shell',
  displayName: 'Section Shell',
  sections: ['Meridian · Layout'],
  component: SectionShell,
  // Pairs with the studioAttributes spread inside the component. Emit both or
  // neither: wrap:false without the spread makes the node unselectable entirely.
  wrap: false,
  thumbnailUrl: thumb(GLYPHS.sectionShell, 'Section Shell'),
  props: {
    children: { type: 'slot', displayName: 'Content' }, // slots never take a defaultValue
    tone: {
      type: 'choice',
      displayName: 'Tone',
      // The Shop Landing Page's Promo Banner `tone` field uses these same values,
      // so a Section binds that field straight to this prop.
      options: ['default', 'muted', 'accent', 'dark'],
      defaultValue: 'default',
    },
    width: {
      type: 'choice',
      displayName: 'Width',
      options: ['narrow', 'normal', 'wide'],
      defaultValue: 'normal',
    },
    density: {
      type: 'choice',
      displayName: 'Vertical space',
      options: ['compact', 'normal', 'spacious'],
      defaultValue: 'normal',
    },
  },
});

registerComponent({
  type: 'meridian-stack',
  displayName: 'Stack',
  sections: ['Meridian · Layout'],
  component: Stack,
  wrap: false,
  thumbnailUrl: thumb(GLYPHS.stack, 'Stack'),
  props: {
    children: { type: 'slot', displayName: 'Items' },
    direction: {
      type: 'choice',
      displayName: 'Direction',
      options: ['vertical', 'horizontal', 'split', 'grid'],
      defaultValue: 'vertical',
    },
    gap: {
      type: 'choice',
      displayName: 'Gap',
      options: ['none', 'tight', 'normal', 'loose'],
      defaultValue: 'normal',
    },
    align: {
      type: 'choice',
      displayName: 'Align',
      options: ['start', 'center', 'end', 'between', 'stretch'],
      defaultValue: 'start',
    },
    wrapItems: { type: 'boolean', displayName: 'Wrap items', defaultValue: true },
    side: {
      type: 'choice',
      displayName: 'Split: media side',
      options: ['right', 'left'],
      defaultValue: 'right',
    },
    emptyAddButton: {
      type: 'boolean',
      displayName: 'Visual Editor: add button when list is empty',
      defaultValue: false,
    },
  },
});

registerComponent({
  type: 'meridian-eyebrow',
  displayName: 'Eyebrow',
  sections: ['Meridian · Elements'],
  component: Eyebrow,
  wrap: false,
  thumbnailUrl: thumb(GLYPHS.eyebrow, 'Eyebrow'),
  props: {
    text: { type: 'string', displayName: 'Text', defaultValue: 'Field notes' },
  },
});

registerComponent({
  type: 'meridian-cta-button',
  displayName: 'CTA Button',
  sections: ['Meridian · Elements'],
  component: CtaButton,
  wrap: false,
  thumbnailUrl: thumb(GLYPHS.ctaButton, 'CTA Button'),
  props: {
    // Label and href are separate props on purpose — see CtaButton.tsx.
    label: { type: 'string', displayName: 'Label', defaultValue: 'Read more' },
    href: { type: 'href', displayName: 'Link', defaultValue: '/' },
    variant: {
      type: 'choice',
      displayName: 'Variant',
      options: ['primary', 'secondary', 'quiet'],
      defaultValue: 'primary',
    },
  },
});

/**
 * Rich text: the default serializer is enough HERE, on purpose.
 *
 * `registerRTERenderer` exists to customise TWO things: how embedded entries and
 * assets render, and any non-standard element types. This model has neither — the
 * article bodies use only standard nodes (paragraphs, headings, lists, links) —
 * so the built-in serializer already produces correct semantic HTML, and we style
 * that markup from globals.css instead.
 *
 * Register one the moment you let authors embed entries or assets in a rich-text
 * field. Without it, an embedded entry renders as a bare title span. Note the
 * renderers return HTML STRINGS, not JSX:
 *
 *   import { registerRTERenderer } from '@contentstack/studio-react';
 *
 *   registerRTERenderer({
 *     embeddedEntry: ({ entry, displayType }) =>
 *       displayType === 'block'
 *         ? `<article class="embed"><h3>${entry.title}</h3></article>`
 *         : `<a href="${entry.url ?? '#'}">${entry.title}</a>`,
 *     customElementTypes: {
 *       'code-block': (_attrs, child) => `<pre><code>${child}</code></pre>`,
 *     },
 *   });
 */
