/**
 * The Shop Landing Page Sections: one per block type, plus the list Section
 * that routes each block to its Section.
 *
 * ── How an editor's block order becomes the page ─────────────────────────────
 *
 *   Page Blocks (whole entry)
 *   └── Stack (the list)
 *       └── Repeater over `blocks`, in the entry's order
 *           └── Stack (one block)
 *               ├── Condition Block: hero_split      → Section Slot → Block · Hero Split
 *               ├── Condition Block: hero_full_bleed → Section Slot → Block · Hero Full Bleed
 *               └── …one per block type
 *
 * For each item, exactly one Condition Block passes — the one whose block uid
 * the item carries — and its Section renders. So the ENTRY decides which blocks
 * appear and in what order; Studio decides how each block type looks. Reorder
 * the blocks in the entry form and the page follows, with no Studio change.
 *
 * ── Four rules, all silent when broken ───────────────────────────────────────
 *
 *  1. A Condition Block needs a `conditionBinding`. Without one the SDK
 *     evaluates the condition as false and renders NOTHING — no error. For a
 *     modular block it binds the Repeater's current item at the block uid; the
 *     condition passes when that key is present.
 *  2. Its `dataBinding` (same path) narrows the item to that block's fields for
 *     everything inside it. That is why the block Sections bind `headline`, not
 *     `hero_split.headline`.
 *  3. Copy uses the built-in `text` (Paragraph), not `plain-text`: plain-text
 *     renders a bare text node, so a class set on it (`price`,
 *     `promo__message`) never reaches the page.
 *  4. A block Section's linked schema is the page-rooted path
 *     `blocks.<block uid>` with cardinality "single". The SDK roots the fetch
 *     projection at that path; declare anything else and the Delivery API is
 *     asked for fields that do not exist, and returns none.
 */
import { nid, node, page, sectionSlot, tmpl, rep, StaticValues } from './composition.mjs';
import { SHELL, STACK, EYEBROW, CTA, shellProps, stackProps, heading, image } from './sections.mjs';

const CT = 'shop_landing_page';
const FIELD = 'blocks';

/** The block types, in the order the Page Blocks Section lists them. */
export const SHOP_BLOCK_TYPES = [
  { block: 'hero_split', key: 'block_hero_split', title: 'Block · Hero Split' },
  { block: 'hero_full_bleed', key: 'block_hero_full_bleed', title: 'Block · Hero Full Bleed' },
  { block: 'promo_banner', key: 'block_promo_banner', title: 'Block · Promo Banner' },
  { block: 'category_tiles', key: 'block_category_tiles', title: 'Block · Category Tiles' },
  { block: 'product_grid', key: 'block_product_grid', title: 'Block · Product Grid' },
  { block: 'editorial', key: 'block_editorial', title: 'Block · Editorial Story' },
];

/** Each block type gets its own Section Slot inside Page Blocks. */
export const blockSlotUid = (block) => nid('page_blocks', 'slot', block);

/** A block Section: one block's fields, scoped by the Condition Block above it. */
function blockSection(title, block, tree, sv) {
  return {
    title,
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    linked_schemas: [
      {
        content_type_uid: CT,
        selected_field: `${FIELD}.${block}`,
        display_name: title.replace('Block · ', ''),
        cardinality: 'single',
      },
    ],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

/** Eyebrow, headline, subheading and CTA — the copy both heroes share. */
function heroCopy(sv, P, { ctaVariant }) {
  const cta = nid(P, 'cta');
  return [
    node(EYEBROW, nid(P, 'eyebrow'), {
      title: 'Eyebrow',
      props: { text: { type: 'string', binding: tmpl('eyebrow') } },
    }),
    heading(sv, nid(P, 'headline'), tmpl('headline'), 'h1', 'Headline'),
    node('text', nid(P, 'subheading'), {
      title: 'Subheading',
      props: { text: { type: 'plaintext', binding: tmpl('subheading') } },
    }),
    node(CTA, cta, {
      title: 'Call to action',
      props: {
        label: { type: 'string', binding: tmpl('cta_label') },
        href: { type: 'href', binding: tmpl('cta_href') },
        variant: { type: 'choice', binding: sv.add(cta, 'variant', 'choice', ctaVariant) },
      },
    }),
  ];
}

// ─── Hero · Split — variation 1 ──────────────────────────────────────────────
function heroSplit() {
  const sv = new StaticValues();
  const P = 'block_hero_split';
  const shell = nid(P, 'shell');
  const cols = nid(P, 'cols');
  const copy = nid(P, 'copy');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Hero band',
      props: shellProps(sv, shell, { width: 'wide' }),
      children: [
        node(STACK, cols, {
          title: 'Copy and image',
          // The stylistic variation: the entry's `image_position` is bound
          // straight to the Stack's media side. Same Section, either layout.
          props: stackProps(
            sv,
            cols,
            { direction: 'split', gap: 'loose', align: 'center' },
            { side: tmpl('image_position') },
          ),
          children: [
            node(STACK, copy, {
              title: 'Hero copy',
              props: stackProps(sv, copy, { gap: 'normal' }),
              children: heroCopy(sv, P, { ctaVariant: 'primary' }),
            }),
            image(sv, nid(P, 'image'), tmpl('image.url'), tmpl('image_alt'), 'Hero image', [
              'media',
              'media--tall',
            ]),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Hero Split', 'hero_split', tree, sv);
}

// ─── Hero · Full Bleed — variation 2 ─────────────────────────────────────────
function heroFullBleed() {
  const sv = new StaticValues();
  const P = 'block_hero_full_bleed';
  const shell = nid(P, 'shell');
  const frame = nid(P, 'frame');
  const copy = nid(P, 'copy');

  // A different ARRANGEMENT of the same pieces — text laid over the image —
  // which is why this is its own block type and Section, not a field on Split.
  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Hero band',
      props: shellProps(sv, shell, { width: 'wide', density: 'compact' }),
      children: [
        node(STACK, frame, {
          title: 'Image frame',
          classes: ['bleed'],
          props: stackProps(sv, frame, { align: 'start' }),
          children: [
            image(sv, nid(P, 'image'), tmpl('image.url'), tmpl('image_alt'), 'Background image', [
              'bleed__media',
            ]),
            node(STACK, copy, {
              title: 'Hero copy',
              classes: ['bleed__copy'],
              props: stackProps(sv, copy, { gap: 'normal' }),
              children: heroCopy(sv, P, { ctaVariant: 'primary' }),
            }),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Hero Full Bleed', 'hero_full_bleed', tree, sv);
}

// ─── Promo Banner ────────────────────────────────────────────────────────────
function promoBanner() {
  const sv = new StaticValues();
  const P = 'block_promo_banner';
  const shell = nid(P, 'shell');
  const row = nid(P, 'row');
  const cta = nid(P, 'cta');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Promo band',
      // The entry's `tone` picks the band colour: a field-level variation.
      props: shellProps(sv, shell, { width: 'wide', density: 'compact' }, { tone: tmpl('tone') }),
      children: [
        node(STACK, row, {
          title: 'Message and link',
          props: stackProps(sv, row, { direction: 'horizontal', align: 'between' }),
          children: [
            node('text', nid(P, 'message'), {
              title: 'Message',
              classes: ['promo__message'],
              props: { text: { type: 'plaintext', binding: tmpl('message') } },
            }),
            node(CTA, cta, {
              title: 'Link',
              props: {
                label: { type: 'string', binding: tmpl('cta_label') },
                href: { type: 'href', binding: tmpl('cta_href') },
                variant: { type: 'choice', binding: sv.add(cta, 'variant', 'choice', 'secondary') },
              },
            }),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Promo Banner', 'promo_banner', tree, sv);
}

// ─── Category Tiles ──────────────────────────────────────────────────────────
function categoryTiles() {
  const sv = new StaticValues();
  const P = 'block_category_tiles';
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');
  const grid = nid(P, 'grid');
  const rid = nid(P, 'repeater');
  const tile = nid(P, 'tile');
  const link = nid(P, 'link');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Tiles band',
      props: shellProps(sv, shell, { width: 'wide' }),
      children: [
        node(STACK, col, {
          title: 'Tiles layout',
          props: stackProps(sv, col, { gap: 'loose' }),
          children: [
            heading(sv, nid(P, 'heading'), tmpl('heading'), 'h2', 'Heading'),
            node(STACK, grid, {
              title: 'Tile grid',
              classes: ['tiles'],
              // Takes the list's `tiles` tag: Visual Editor's add/move controls
              // for a tile look up to it. See Page Blocks below.
              metadata: { repeaterWrapper: true },
              props: stackProps(sv, grid, {
                direction: 'grid',
                align: 'stretch',
                emptyAddButton: true,
              }),
              children: [
                // A Repeater over the block's own repeating group. Its bindings
                // are repeater-scoped: each tile reads the current row.
                node('repeater', rid, {
                  title: 'Each tile',
                  metadata: { mode: 'preview', repeaterBindingFieldType: 'group' },
                  props: { items: { type: 'array', binding: tmpl('tiles') } },
                  children: [
                    node(STACK, tile, {
                      title: 'Tile',
                      classes: ['tile'],
                      props: stackProps(sv, tile, { gap: 'tight' }),
                      children: [
                        image(
                          sv,
                          nid(P, 'image'),
                          rep(rid, 'image.url'),
                          rep(rid, 'image_alt'),
                          'Tile image',
                          ['media', 'media--portrait'],
                        ),
                        node(CTA, link, {
                          title: 'Tile link',
                          props: {
                            label: { type: 'string', binding: rep(rid, 'label') },
                            href: { type: 'href', binding: rep(rid, 'href') },
                            variant: {
                              type: 'choice',
                              binding: sv.add(link, 'variant', 'choice', 'quiet'),
                            },
                          },
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Category Tiles', 'category_tiles', tree, sv);
}

// ─── Product Grid ────────────────────────────────────────────────────────────
function productGrid() {
  const sv = new StaticValues();
  const P = 'block_product_grid';
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');
  const intro = nid(P, 'intro');
  const grid = nid(P, 'grid');
  const rid = nid(P, 'repeater');
  const card = nid(P, 'card');
  const link = nid(P, 'link');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Products band',
      props: shellProps(sv, shell, { tone: 'muted', width: 'wide' }),
      children: [
        node(STACK, col, {
          title: 'Products layout',
          props: stackProps(sv, col, { gap: 'loose' }),
          children: [
            node(STACK, intro, {
              title: 'Intro',
              props: stackProps(sv, intro, { gap: 'tight' }),
              children: [
                heading(sv, nid(P, 'heading'), tmpl('heading'), 'h2', 'Heading'),
                node('text', nid(P, 'intro-text'), {
                  title: 'Intro text',
                  props: { text: { type: 'plaintext', binding: tmpl('intro') } },
                }),
              ],
            }),
            node(STACK, grid, {
              title: 'Product grid',
              metadata: { repeaterWrapper: true },
              props: stackProps(sv, grid, {
                direction: 'grid',
                align: 'stretch',
                emptyAddButton: true,
              }),
              children: [
                node('repeater', rid, {
                  title: 'Each product',
                  metadata: { mode: 'preview', repeaterBindingFieldType: 'group' },
                  props: { items: { type: 'array', binding: tmpl('products') } },
                  children: [
                    node(STACK, card, {
                      title: 'Product card',
                      classes: ['card', 'product'],
                      props: stackProps(sv, card, { gap: 'tight' }),
                      children: [
                        image(
                          sv,
                          nid(P, 'image'),
                          rep(rid, 'image.url'),
                          rep(rid, 'image_alt'),
                          'Product image',
                        ),
                        node(EYEBROW, nid(P, 'badge'), {
                          title: 'Badge',
                          props: { text: { type: 'string', binding: rep(rid, 'badge') } },
                        }),
                        heading(sv, nid(P, 'name'), rep(rid, 'name'), 'h3', 'Name'),
                        node('text', nid(P, 'price'), {
                          title: 'Price',
                          classes: ['price'],
                          props: { text: { type: 'plaintext', binding: rep(rid, 'price') } },
                        }),
                        node(CTA, link, {
                          title: 'Product link',
                          props: {
                            label: {
                              type: 'string',
                              binding: sv.add(link, 'label', 'string', 'View product'),
                            },
                            href: { type: 'href', binding: rep(rid, 'href') },
                            variant: {
                              type: 'choice',
                              binding: sv.add(link, 'variant', 'choice', 'quiet'),
                            },
                          },
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Product Grid', 'product_grid', tree, sv);
}

// ─── Editorial Story ─────────────────────────────────────────────────────────
function editorial() {
  const sv = new StaticValues();
  const P = 'block_editorial';
  const shell = nid(P, 'shell');
  const cols = nid(P, 'cols');
  const copy = nid(P, 'copy');
  const cta = nid(P, 'cta');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Story band',
      props: shellProps(sv, shell, { width: 'normal' }),
      children: [
        node(STACK, cols, {
          title: 'Image and story',
          props: stackProps(sv, cols, { direction: 'split', gap: 'loose', align: 'center' }),
          children: [
            image(sv, nid(P, 'image'), tmpl('image.url'), tmpl('image_alt'), 'Story image'),
            node(STACK, copy, {
              title: 'Story',
              props: stackProps(sv, copy, { gap: 'normal' }),
              children: [
                node(EYEBROW, nid(P, 'eyebrow'), {
                  title: 'Eyebrow',
                  props: { text: { type: 'string', binding: tmpl('eyebrow') } },
                }),
                heading(sv, nid(P, 'heading'), tmpl('heading'), 'h2', 'Heading'),
                node('rich-text', nid(P, 'body'), {
                  title: 'Body',
                  classes: ['prose'],
                  props: { text: { type: 'any', binding: tmpl('body') } },
                }),
                node(CTA, cta, {
                  title: 'Call to action',
                  props: {
                    label: { type: 'string', binding: tmpl('cta_label') },
                    href: { type: 'href', binding: tmpl('cta_href') },
                    variant: {
                      type: 'choice',
                      binding: sv.add(cta, 'variant', 'choice', 'secondary'),
                    },
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);
  return blockSection('Block · Editorial Story', 'editorial', tree, sv);
}

// ─── Page Blocks: the list Section that routes each block ────────────────────
function pageBlocks(ctx = {}) {
  const sv = new StaticValues();
  const P = 'page_blocks';
  const rid = nid(P, 'repeater');

  const branches = SHOP_BLOCK_TYPES.map(({ block, key, title }) =>
    node('condition-block', nid(P, 'condition', block), {
      title: `If ${title.replace('Block · ', '')}`,
      metadata: {
        condition: {
          type: 'modular_block',
          operator: 'eq',
          value: block,
          // What Studio's Add Condition Block modal records for a block-name check.
          subType: 'block_name',
          conditionBinding: rep(rid, block),
          dataBinding: rep(rid, block),
        },
      },
      // The slot's default is that block's own Section, so the list is never
      // empty on the canvas and a template author has nothing to wire by hand.
      children: [
        sectionSlot(blockSlotUid(block), title.replace('Block · ', ''), sv, ctx[key]?.uid),
      ],
    }),
  );

  // The two Stacks exist for Visual Editor, not for layout. Its add / move /
  // delete controls for a block need two edit tags in the DOM: `blocks` on an
  // element around the list, and `blocks.N` on an element around each block.
  //  • `repeaterWrapper` makes the SDK give the outer Stack the Repeater's
  //    items tag (`blocks`).
  //  • The Repeater hands each item's tag (`blocks.N`) to its FIRST child. A
  //    Condition Block passes it on to a Section Slot, and the slot drops it,
  //    so a real element has to sit between the Repeater and the conditions.
  // Without them the blocks render and every field edits, but a block cannot be
  // added, moved or removed from the page.
  const list = nid(P, 'list');
  const item = nid(P, 'item');
  const tree = page(nid(P, 'page'), [
    node(STACK, list, {
      title: 'Blocks list',
      metadata: { repeaterWrapper: true },
      // A new entry has no blocks yet: this puts Visual Editor's "add a
      // block" panel on the page, so the first block is added in place.
      props: stackProps(sv, list, { gap: 'none', align: 'stretch', emptyAddButton: true }),
      children: [
        node('repeater', rid, {
          title: 'Each block, in entry order',
          metadata: { mode: 'preview', repeaterBindingFieldType: 'blocks' },
          // Bound from the entry, so the list's `blocks` edit tag exists. A Section
          // scoped to `blocks` renders the same but never emits it.
          props: { items: { type: 'array', binding: tmpl('blocks') } },
          children: [
            node(STACK, item, {
              title: 'Block',
              props: stackProps(sv, item, { gap: 'none', align: 'stretch' }),
              children: branches,
            }),
          ],
        }),
      ],
    }),
  ]);

  return {
    title: 'Page Blocks',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    linked_schemas: [
      // The whole entry, not `blocks`: see the Repeater's binding above.
      { content_type_uid: CT, display_name: 'Shop Landing Page', cardinality: 'single' },
    ],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

/** Dependency order: every block Section before Page Blocks, whose slots default to them. */
export const SHOP_SECTIONS = [
  { key: 'block_hero_split', build: heroSplit },
  { key: 'block_hero_full_bleed', build: heroFullBleed },
  { key: 'block_promo_banner', build: promoBanner },
  { key: 'block_category_tiles', build: categoryTiles },
  { key: 'block_product_grid', build: productGrid },
  { key: 'block_editorial', build: editorial },
  { key: 'page_blocks', build: pageBlocks },
];
