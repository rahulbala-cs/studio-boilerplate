/**
 * The content model, as data.
 *
 * Everything the boilerplate models lives here so a developer can read the whole
 * schema in one file instead of reconstructing it from API calls.
 *
 * ── The one decision worth understanding ──────────────────────────────────────
 * `featured_articles` carries the SAME field uid on both `page_home` and
 * `article`. That is deliberate and load-bearing.
 *
 * A Studio Section binds to `template.<field>`. Two Templates can therefore share
 * one Section only if their page content types name that field identically. Give
 * the article CT a `related_articles` field instead and the Featured Articles
 * Section can no longer be reused — you would need a second, near-identical
 * Section. Identical uids are what make Section reuse possible at all.
 */

/** Reusable field builders — keep the CMA's verbose shapes in one place. */
const text = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: { _default: true, version: 3, ...(opts.multiline ? { multiline: true } : {}) },
  format: '',
  error_messages: { format: '' },
  mandatory: opts.mandatory ?? false,
  multiple: opts.multiple ?? false,
  non_localizable: false,
  unique: opts.unique ?? false,
});

const richText = (uid, display_name) => ({
  data_type: 'json',
  display_name,
  uid,
  field_metadata: {
    allow_json_rte: true,
    embed_entry: false,
    description: '',
    default_value: '',
    multiline: false,
    rich_text_type: 'advanced',
    options: [],
  },
  format: '',
  error_messages: { format: '' },
  reference_to: ['sys_assets'],
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

const file = (uid, display_name) => ({
  data_type: 'file',
  display_name,
  uid,
  field_metadata: { description: '', rich_text_type: 'standard' },
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

const isodate = (uid, display_name) => ({
  data_type: 'isodate',
  display_name,
  uid,
  startDate: null,
  endDate: null,
  field_metadata: { description: '', default_value: {} },
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

const group = (uid, display_name, schema, opts = {}) => ({
  data_type: 'group',
  display_name,
  uid,
  schema,
  field_metadata: {},
  mandatory: false,
  multiple: opts.multiple ?? false,
  non_localizable: false,
  unique: false,
});

const reference = (uid, display_name, to, opts = {}) => ({
  data_type: 'reference',
  display_name,
  uid,
  reference_to: Array.isArray(to) ? to : [to],
  field_metadata: { ref_multiple: opts.multiple ?? false, ref_multiple_content_types: true },
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

const globalField = (uid, display_name, to) => ({
  data_type: 'global_field',
  display_name,
  uid,
  reference_to: to,
  field_metadata: {},
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

/**
 * A dropdown. Stored as a plain string, so a Studio Condition Block or a
 * component prop can switch on it directly.
 */
const select = (uid, display_name, choices, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  display_type: 'dropdown',
  enum: { advanced: false, choices: choices.map((value) => ({ value })) },
  field_metadata: { description: '', default_value: opts.default ?? choices[0], version: 3 },
  mandatory: false,
  multiple: false,
  non_localizable: false,
  unique: false,
});

/**
 * A Modular Blocks field. Each block is a named schema; an entry holds an
 * ordered list of them, and the editor chooses which blocks and in what order.
 * On the wire each item is `{ <block uid>: { ...fields } }` — the block's uid is
 * the key, which is what a Studio Condition Block matches on to decide which
 * Section renders that item.
 */
const modularBlocks = (uid, display_name, blocks) => ({
  data_type: 'blocks',
  display_name,
  uid,
  blocks,
  field_metadata: { instruction: '', description: '' },
  mandatory: false,
  multiple: true,
  non_localizable: false,
  unique: false,
});

const block = (uid, title, schema) => ({ uid, title, schema });

/** The `title` + `url` pair every page content type needs. */
const pageBase = () => [
  text('title', 'Title', { mandatory: true, unique: true }),
  text('url', 'URL', { mandatory: false }),
];

// ─── Global Field ────────────────────────────────────────────────────────────
// Shared by every page CT. It renders into <head> through Next's generateMetadata,
// never onto the canvas — which is why it is the one shared shape with no Section.
export const GLOBAL_FIELDS = [
  {
    uid: 'seo',
    title: 'SEO',
    description: 'Search-engine metadata. Rendered into <head>, not onto the page canvas.',
    schema: [
      text('meta_title', 'Meta Title'),
      text('meta_description', 'Meta Description', { multiline: true }),
    ],
  },
];

// ─── Content Types ───────────────────────────────────────────────────────────
export const CONTENT_TYPES = [
  {
    uid: 'site_settings',
    title: 'Site Settings',
    // One entry, pinned by the Site Header and Site Footer Sections: no page
    // links to it, so every page gets the header and footer, new ones included.
    description: 'One entry. Brand, navigation and footer copy shared by every page.',
    options: { is_page: false, singleton: true, title: 'title', sub_title: [] },
    schema: [
      text('title', 'Title', { mandatory: true, unique: true }),
      text('brand_name', 'Brand Name'),
      file('logo', 'Logo'),
      // The nav is a repeating group, NOT a hardcoded list. This is what lets an
      // author add a menu item without a developer — the whole point of putting
      // the header in Studio.
      group('nav_links', 'Navigation Links', [text('label', 'Label'), text('href', 'Href')], {
        multiple: true,
      }),
      text('footer_note', 'Footer Note', { multiline: true }),
    ],
  },
  {
    uid: 'article',
    title: 'Article',
    description: 'Many entries. Each renders its own page through the Article template.',
    // A multi-entry page CT. `:title` is the working CMS substitution token —
    // `:slug` is treated as a literal string and never substituted.
    options: {
      is_page: true,
      singleton: false,
      title: 'title',
      sub_title: [],
      url_pattern: '/:title',
      url_prefix: '/articles/',
    },
    schema: [
      ...pageBase(),
      text('summary', 'Summary', { multiline: true }),
      file('cover_image', 'Cover Image'),
      // Alt text is CONTENT, not code: whoever chooses the image is the person
      // who can describe it. Hardcoding it in the component, or reusing the
      // title, makes the page technically accessible and practically useless to
      // anyone relying on it.
      text('cover_image_alt', 'Cover Image Alt Text'),
      text('author_name', 'Author Name'),
      isodate('published_on', 'Published On'),
      richText('body', 'Body'),
      reference('featured_articles', 'Featured Articles', 'article', { multiple: true }),
      globalField('seo', 'SEO', 'seo'),
    ],
  },
  {
    uid: 'page_home',
    title: 'Home Page',
    description: 'One entry at /. Its own copy lives in the `hero` group.',
    options: { is_page: true, singleton: true, title: 'title', sub_title: [] },
    schema: [
      ...pageBase(),
      group('hero', 'Hero', [
        text('eyebrow', 'Eyebrow'),
        text('headline', 'Headline'),
        richText('body', 'Body'),
        file('image', 'Image'),
        text('image_alt', 'Image Alt Text'),
        text('cta_label', 'CTA Label'),
        text('cta_href', 'CTA Href'),
      ]),
      // Same uid as on `article` — see the note at the top of this file.
      reference('featured_articles', 'Featured Articles', 'article', { multiple: true }),
      globalField('seo', 'SEO', 'seo'),
    ],
  },
];

// ─── Shop Landing Page: a page built from Modular Blocks ─────────────────────
//
// The other page types have a FIXED shape: every Home page has a hero and a
// featured list, in that order. This one does not. Its body is an ordered list
// of blocks the editor picks and arranges per entry, in the entry form or in
// Visual Editor — and Studio decides how each block type renders.
//
// Two kinds of variation, modelled differently on purpose:
//
//   • STRUCTURAL variation → a separate block type. `hero_split` and
//     `hero_full_bleed` are both heroes, but their layout differs enough that
//     each gets its own Section in Studio. The editor picks the variation by
//     picking the block.
//   • STYLISTIC variation → a field inside one block (`image_position`,
//     `tone`). Same Section, and the choice becomes a prop on it.
//
// Rule of thumb: if the two versions need a different arrangement of pieces,
// it is two blocks. If they need the same pieces styled differently, it is a
// field.

/** The fields every hero variation shares, so the two stay interchangeable. */
const heroFields = () => [
  text('eyebrow', 'Eyebrow'),
  text('headline', 'Headline', { mandatory: true }),
  text('subheading', 'Subheading', { multiline: true }),
  file('image', 'Image'),
  text('image_alt', 'Image Alt Text'),
  text('cta_label', 'CTA Label'),
  text('cta_href', 'CTA Href'),
];

export const SHOP_BLOCKS = [
  // Hero, variation 1: text beside the image.
  block('hero_split', 'Hero — Split', [
    ...heroFields(),
    select('image_position', 'Image Position', ['right', 'left']),
  ]),
  // Hero, variation 2: text over a full-width image.
  block('hero_full_bleed', 'Hero — Full Bleed', heroFields()),
  block('promo_banner', 'Promo Banner', [
    text('message', 'Message', { mandatory: true }),
    text('cta_label', 'CTA Label'),
    text('cta_href', 'CTA Href'),
    select('tone', 'Tone', ['muted', 'accent', 'dark']),
  ]),
  block('category_tiles', 'Category Tiles', [
    text('heading', 'Heading'),
    group(
      'tiles',
      'Tiles',
      [
        text('label', 'Label'),
        file('image', 'Image'),
        text('image_alt', 'Image Alt Text'),
        text('href', 'Href'),
      ],
      { multiple: true },
    ),
  ]),
  // Product cards are entered by hand here so the demo is self-contained. In
  // production these come from the commerce platform: the block would hold SKUs
  // or a category id, and Studio would fetch the rest as external data.
  block('product_grid', 'Product Grid', [
    text('heading', 'Heading'),
    text('intro', 'Intro', { multiline: true }),
    group(
      'products',
      'Products',
      [
        text('name', 'Name'),
        text('price', 'Price'),
        text('badge', 'Badge'),
        file('image', 'Image'),
        text('image_alt', 'Image Alt Text'),
        text('href', 'Href'),
      ],
      { multiple: true },
    ),
  ]),
  block('editorial', 'Editorial Story', [
    text('eyebrow', 'Eyebrow'),
    text('heading', 'Heading'),
    richText('body', 'Body'),
    file('image', 'Image'),
    text('image_alt', 'Image Alt Text'),
    text('cta_label', 'CTA Label'),
    text('cta_href', 'CTA Href'),
  ]),
];

CONTENT_TYPES.push({
  uid: 'shop_landing_page',
  title: 'Shop Landing Page',
  description:
    'Many entries, one per shop category. The body is a list of blocks the editor chooses and orders per page.',
  options: {
    is_page: true,
    singleton: false,
    title: 'title',
    sub_title: [],
    url_pattern: '/:title',
    url_prefix: '/shop/',
  },
  schema: [
    ...pageBase(),
    text('summary', 'Summary', { multiline: true }),
    modularBlocks('blocks', 'Page Blocks', SHOP_BLOCKS),
    globalField('seo', 'SEO', 'seo'),
  ],
});

/** Create order matters: `article` references itself. */
export const CREATE_ORDER = ['site_settings', 'article', 'page_home', 'shop_landing_page'];
