/**
 * The seven Sections of the Home and Article pages, as trees.
 *
 * A Section is a reusable page part with a declared data shape (its "linked
 * schema"). When a Template places one, the SDK hands it a scoped slice of the
 * page entry, chosen by `selected_field`. Header and Footer are the exception:
 * they pin Site Settings themselves (below).
 *
 * ── The scoping rule, which decides every binding path below ─────────────────
 *   selected_field SET   → the Section's `template` IS that field's value
 *                          (references resolved). Bind paths relative to it.
 *   selected_field UNSET → `template` is the WHOLE page entry.
 *                          Bind paths as template.<field>.
 *
 * Setting it on a Section that reads several unrelated fields loses access to
 * everything outside the scoped path, and those bindings resolve to undefined
 * with no error. Leaving it unset on a single-field list Section means the
 * Repeater has nothing to iterate.
 *
 * ── Why two linked_schemas entries on the shared Sections ───────────────────
 * Featured Articles is placed on both page templates, so it declares one entry
 * per page content type. This only works because both CTs name the field
 * identically — see the note in content-model.mjs.
 *
 * ── Header and Footer read no page data at all ───────────────────────────────
 * Site-wide content lives in ONE Site Settings entry, and the two Sections pin
 * it themselves. A page cannot forget to link it, so every template and every
 * new entry gets the real header and footer with nothing to wire.
 */
import {
  nid,
  node,
  page,
  sectionSlot,
  tmpl,
  rep,
  pinned,
  pinnedEntries,
  StaticValues,
} from './composition.mjs';

export const SHELL = 'meridian-section-shell';
export const STACK = 'meridian-stack';
export const EYEBROW = 'meridian-eyebrow';
export const CTA = 'meridian-cta-button';

const PAGE_CTS = ['page_home', 'article'];

/** Every registered prop is written, or it shows blank in Studio's panel.
 *  `bound` swaps a literal for a data binding, so the entry can drive a layout
 *  choice (the Promo Banner's tone, the Split hero's media side). */
export const shellProps = (
  sv,
  uid,
  { tone = 'default', width = 'normal', density = 'normal' } = {},
  bound = {},
) => ({
  tone: { type: 'choice', binding: bound.tone ?? sv.add(uid, 'tone', 'choice', tone) },
  width: { type: 'choice', binding: sv.add(uid, 'width', 'choice', width) },
  density: { type: 'choice', binding: sv.add(uid, 'density', 'choice', density) },
});

export const stackProps = (
  sv,
  uid,
  {
    direction = 'vertical',
    gap = 'normal',
    align = 'start',
    wrapItems = true,
    side = 'right',
    emptyAddButton = false,
  } = {},
  bound = {},
) => ({
  direction: { type: 'choice', binding: sv.add(uid, 'direction', 'choice', direction) },
  gap: { type: 'choice', binding: sv.add(uid, 'gap', 'choice', gap) },
  align: { type: 'choice', binding: sv.add(uid, 'align', 'choice', align) },
  wrapItems: { type: 'boolean', binding: sv.add(uid, 'wrapItems', 'boolean', wrapItems) },
  side: { type: 'choice', binding: bound.side ?? sv.add(uid, 'side', 'choice', side) },
  emptyAddButton: {
    type: 'boolean',
    binding: sv.add(uid, 'emptyAddButton', 'boolean', emptyAddButton),
  },
});

export const heading = (sv, uid, binding, level, title) =>
  node('header', uid, {
    title,
    props: {
      text: { type: 'plaintext', binding },
      Tag: { type: 'choice', binding: sv.add(uid, 'Tag', 'choice', level) },
    },
  });

export const image = (sv, uid, srcBinding, altBinding, title, classes = ['media']) =>
  node('image', uid, {
    title,
    classes,
    props: {
      src: { type: 'imageurl', binding: srcBinding },
      alt: { type: 'string', binding: altBinding },
    },
  });

/** A nav menu: one Repeater over a repeating field, never a hardcoded list.
 *  This is the whole reason the header belongs in Studio — an author adds a
 *  menu item by adding a row to `nav_links`, with no code change. */
const navRepeater = (sv, prefix, site) => {
  const rid = nid(prefix, 'nav-repeater');
  const lid = nid(prefix, 'nav-link');
  return node('repeater', rid, {
    title: 'Navigation items',
    // Without mode:"preview" the canvas shows a single placeholder while
    // production renders all of them — the author never sees the real menu.
    metadata: { mode: 'preview', repeaterBindingFieldType: 'group' },
    props: { items: { type: 'array', binding: site('nav_links') } },
    children: [
      node('link', lid, {
        title: 'Menu link',
        classes: ['nav-link'],
        props: {
          // Repeater-scope bindings, relative to the current item. A template
          // binding at nav_links.0.label would render item 0 on every iteration.
          href: { type: 'href', binding: rep(rid, 'href') },
          label: { type: 'string', binding: rep(rid, 'label') },
          openInNewTab: { type: 'boolean', binding: sv.add(lid, 'openInNewTab', 'boolean', false) },
        },
      }),
    ],
  });
};

// ─── 1. Site Header ──────────────────────────────────────────────────────────
function siteHeader(_sections, { siteSettingsUid }) {
  const sv = new StaticValues();
  const P = 'site_header';
  const site = (path) => pinned('site_settings', siteSettingsUid, path);
  const shell = nid(P, 'shell');
  const row = nid(P, 'row');
  const brand = nid(P, 'brand');
  const navWrap = nid(P, 'nav');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Header band',
      props: shellProps(sv, shell, { tone: 'muted', width: 'wide', density: 'compact' }),
      children: [
        node(STACK, row, {
          title: 'Header row',
          props: stackProps(sv, row, { direction: 'horizontal', align: 'between' }),
          children: [
            node(STACK, brand, {
              title: 'Brand lockup',
              props: stackProps(sv, brand, {
                direction: 'horizontal',
                align: 'center',
                gap: 'tight',
              }),
              children: [
                image(sv, nid(P, 'logo'), site('logo.url'), site('brand_name'), 'Logo', [
                  'brand-mark',
                ]),
                node('plain-text', nid(P, 'brandname'), {
                  title: 'Brand name',
                  props: { text: { type: 'string', binding: site('brand_name') } },
                }),
              ],
            }),
            node(STACK, navWrap, {
              title: 'Navigation',
              // Takes the `nav_links` tag, so Visual Editor can add and move
              // menu items in place (see shop-sections.mjs § Page Blocks).
              metadata: { repeaterWrapper: true },
              props: stackProps(sv, navWrap, {
                direction: 'horizontal',
                align: 'center',
                emptyAddButton: true,
              }),
              children: [navRepeater(sv, P, site)],
            }),
          ],
        }),
      ],
    }),
  ]);

  return {
    title: 'Site Header',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    // The Section pins the ONE Site Settings entry itself (Studio: Data tab →
    // Additional Entry Data). It reads nothing from the page, so it works on
    // every template and every entry, including one created a second ago.
    data_sources: pinnedEntries('site_settings', [siteSettingsUid]),
    linked_schemas: [],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 2. Site Footer ──────────────────────────────────────────────────────────
function siteFooter(_sections, { siteSettingsUid }) {
  const sv = new StaticValues();
  const P = 'site_footer';
  const site = (path) => pinned('site_settings', siteSettingsUid, path);
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');
  const row = nid(P, 'row');
  const navWrap = nid(P, 'nav');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Footer band',
      props: shellProps(sv, shell, { tone: 'muted', width: 'wide', density: 'compact' }),
      children: [
        node(STACK, col, {
          title: 'Footer column',
          props: stackProps(sv, col, { gap: 'normal' }),
          children: [
            node(STACK, row, {
              title: 'Footer row',
              props: stackProps(sv, row, { direction: 'horizontal', align: 'between' }),
              children: [
                node('plain-text', nid(P, 'brandname'), {
                  title: 'Brand name',
                  props: { text: { type: 'string', binding: site('brand_name') } },
                }),
                node(STACK, navWrap, {
                  title: 'Footer navigation',
                  metadata: { repeaterWrapper: true },
                  props: stackProps(sv, navWrap, {
                    direction: 'horizontal',
                    align: 'center',
                    emptyAddButton: true,
                  }),
                  // The SAME repeating field drives the footer menu. One field,
                  // two Sections, no duplicate content for an author to keep in sync.
                  children: [navRepeater(sv, P, site)],
                }),
              ],
            }),
            node('plain-text', nid(P, 'note'), {
              title: 'Footer note',
              props: { text: { type: 'string', binding: site('footer_note') } },
            }),
          ],
        }),
      ],
    }),
  ]);

  return {
    title: 'Site Footer',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    // Pins Site Settings itself, exactly like the Site Header.
    data_sources: pinnedEntries('site_settings', [siteSettingsUid]),
    linked_schemas: [],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 3. Hero Banner ──────────────────────────────────────────────────────────
function heroBanner() {
  const sv = new StaticValues();
  const P = 'hero_banner';
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');
  const copy = nid(P, 'copy');
  const cta = nid(P, 'cta');
  const img = nid(P, 'image');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Hero band',
      props: shellProps(sv, shell, { tone: 'default', width: 'normal' }),
      children: [
        node(STACK, col, {
          title: 'Hero layout',
          // Two columns on desktop, one on a phone. `split` rather than
          // `horizontal`: horizontal packs children to their content width,
          // which is right for a nav and wrong for a hero.
          props: stackProps(sv, col, { direction: 'split', gap: 'loose', align: 'center' }),
          children: [
            node(STACK, copy, {
              title: 'Hero copy',
              props: stackProps(sv, copy, { gap: 'normal' }),
              children: [
                node(EYEBROW, nid(P, 'eyebrow'), {
                  title: 'Eyebrow',
                  props: { text: { type: 'string', binding: tmpl('eyebrow') } },
                }),
                heading(sv, nid(P, 'headline'), tmpl('headline'), 'h1', 'Headline'),
                // Rich text goes through the RichText built-in, never Heading or
                // Paragraph — those would print the markup as literal characters.
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
                      binding: sv.add(cta, 'variant', 'choice', 'primary'),
                    },
                  },
                }),
              ],
            }),
            image(sv, img, tmpl('image.url'), tmpl('image_alt'), 'Hero image'),
          ],
        }),
      ],
    }),
  ]);

  return {
    title: 'Hero Banner',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    // Scoped to the `hero` group, so paths are headline / body / image.url
    // rather than hero.headline and so on.
    linked_schemas: [
      {
        content_type_uid: 'page_home',
        selected_field: 'hero',
        display_name: 'Hero',
        cardinality: 'single',
      },
    ],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 4. Article Card (the FILL section for the slot below) ───────────────────
function articleCard() {
  const sv = new StaticValues();
  const P = 'article_card';
  const col = nid(P, 'col');
  const cta = nid(P, 'cta');

  // No Section Shell here on purpose: this card is dropped into the parent's
  // grid cell, and the parent owns the layout. A component that sets its own
  // width cannot be reused in a different cell.
  const tree = page(nid(P, 'page'), [
    node(STACK, col, {
      title: 'Card',
      classes: ['card'],
      props: stackProps(sv, col, { gap: 'tight' }),
      children: [
        image(sv, nid(P, 'cover'), tmpl('cover_image.url'), tmpl('cover_image_alt'), 'Cover image'),
        heading(sv, nid(P, 'title'), tmpl('title'), 'h3', 'Title'),
        node('plain-text', nid(P, 'summary'), {
          title: 'Summary',
          props: { text: { type: 'string', binding: tmpl('summary') } },
        }),
        node(CTA, cta, {
          title: 'Read link',
          props: {
            label: { type: 'string', binding: sv.add(cta, 'label', 'string', 'Read the story') },
            href: { type: 'href', binding: tmpl('url') },
            variant: { type: 'choice', binding: sv.add(cta, 'variant', 'choice', 'quiet') },
          },
        }),
      ],
    }),
  ]);

  return {
    title: 'Article Card',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    // Bindings are template-scoped, not repeater-scoped: the wrapper's Repeater
    // re-scopes this Section to each article, so repeater bindings resolve to undefined.
    linked_schemas: PAGE_CTS.map((ct) => ({
      content_type_uid: ct,
      selected_field: 'featured_articles',
      display_name: 'Featured Articles',
      cardinality: 'single',
    })),
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 5. Featured Articles (List Section — the slot WRAPPER) ──────────────────
export const FEATURED_SLOT_UID = nid('featured_articles', 'slot');
export const EXPOSED_HEADING = 'exp_featured_heading';
export const EXPOSED_TONE = 'exp_featured_tone';

function featuredArticles(ctx = {}) {
  const sv = new StaticValues();
  const P = 'featured_articles';
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');
  const grid = nid(P, 'grid');
  const repeaterId = nid(P, 'repeater');
  const head = nid(P, 'heading');

  const headingNode = heading(
    sv,
    head,
    sv.add(head, 'text', 'plaintext', 'Featured Articles'),
    'h2',
    'Section heading',
  );

  const tree = page(
    nid(P, 'page'),
    [
      node(SHELL, shell, {
        title: 'Featured band',
        props: shellProps(sv, shell, { tone: 'muted', width: 'wide' }),
        children: [
          node(STACK, col, {
            title: 'Featured layout',
            props: stackProps(sv, col, { gap: 'loose' }),
            children: [
              headingNode,
              node(STACK, grid, {
                title: 'Card grid',
                // A wrapping flex row leaves an orphaned last card stretched
                // across the full width; an auto-fitting grid does not.
                props: stackProps(sv, grid, { direction: 'grid', align: 'stretch' }),
                children: [
                  node('repeater', repeaterId, {
                    title: 'Each featured article',
                    metadata: { mode: 'preview', repeaterBindingFieldType: 'reference' },
                    // The Section is scoped TO featured_articles, so `template`
                    // already IS the resolved array. The Repeater therefore binds
                    // scope-root — a path of { featured_articles: {} } would look
                    // for that field ON the array and find nothing.
                    props: { items: { type: 'array', binding: tmpl('') } },
                    // No Condition Block: the reference targets one content type,
                    // so there is nothing to narrow, and a condition with nothing
                    // to match renders nothing. Add one branch per type if
                    // `featured_articles` ever allows a second content type.
                    children: [
                      sectionSlot(FEATURED_SLOT_UID, 'Article card', sv, ctx.article_card?.uid),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    {
      // Exposed props let ONE Section render differently per Template instead of
      // forking into two near-identical Sections. This is what makes the same
      // band read "Featured Articles" on the home page and "More reading" on an
      // article page.
      exposedProps: [
        {
          nodeUid: head,
          propKey: 'text',
          uid: EXPOSED_HEADING,
          displayName: 'Heading',
          propType: 'plaintext',
          bindingAtExposeTime: { type: 'static_value', value: `${head}-text` },
        },
        {
          nodeUid: shell,
          propKey: 'tone',
          uid: EXPOSED_TONE,
          displayName: 'Band tone',
          propType: 'choice',
          bindingAtExposeTime: { type: 'static_value', value: `${shell}-tone` },
        },
      ],
    },
  );

  return {
    title: 'Featured Articles',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    // The wrapper IS the collection: its template is the resolved array that
    // the Repeater iterates.
    linked_schemas: PAGE_CTS.map((ct) => ({
      content_type_uid: ct,
      selected_field: 'featured_articles',
      display_name: 'Featured Articles',
      cardinality: 'multiple',
    })),
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 6. Article Header ───────────────────────────────────────────────────────
function articleHeader() {
  const sv = new StaticValues();
  const P = 'article_header';
  const shell = nid(P, 'shell');
  const col = nid(P, 'col');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Article header band',
      props: shellProps(sv, shell, { tone: 'default', width: 'narrow' }),
      children: [
        node(STACK, col, {
          title: 'Article intro',
          props: stackProps(sv, col, { gap: 'normal' }),
          children: [
            node(EYEBROW, nid(P, 'author'), {
              title: 'Author',
              props: { text: { type: 'string', binding: tmpl('author_name') } },
            }),
            heading(sv, nid(P, 'title'), tmpl('title'), 'h1', 'Title'),
            node('plain-text', nid(P, 'summary'), {
              title: 'Summary',
              props: { text: { type: 'string', binding: tmpl('summary') } },
            }),
            image(
              sv,
              nid(P, 'cover'),
              tmpl('cover_image.url'),
              tmpl('cover_image_alt'),
              'Cover image',
            ),
          ],
        }),
      ],
    }),
  ]);

  return {
    title: 'Article Header',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    // No selected_field: this Section reads several fields straight off the page
    // entry, so it needs whole-entry scope.
    linked_schemas: [
      { content_type_uid: 'article', display_name: 'Article', cardinality: 'single' },
    ],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

// ─── 7. Article Body ─────────────────────────────────────────────────────────
function articleBody() {
  const sv = new StaticValues();
  const P = 'article_body';
  const shell = nid(P, 'shell');

  const tree = page(nid(P, 'page'), [
    node(SHELL, shell, {
      title: 'Article body band',
      // Compact on top: this band sits directly under the Article Header, and two
      // full-size bands back to back leave a gap that reads as a mistake.
      props: shellProps(sv, shell, { tone: 'default', width: 'narrow', density: 'compact' }),
      children: [
        node('rich-text', nid(P, 'body'), {
          title: 'Body',
          classes: ['prose'],
          props: { text: { type: 'any', binding: tmpl('body') } },
        }),
      ],
    }),
  ]);

  return {
    title: 'Article Body',
    place_composition_as: 'section',
    schema_version: '1.0.0',
    connected_content_type: '',
    data_sources: '[]',
    linked_schemas: [
      { content_type_uid: 'article', display_name: 'Article', cardinality: 'single' },
    ],
    linked_sections: [],
    static_value: sv.toEntryField(),
    __tree: tree,
  };
}

/** Build order is dependency order: a fill section before the wrapper that
 *  slots it, and every section before the templates that place it. */
export const SECTIONS = [
  { key: 'site_header', build: siteHeader },
  { key: 'site_footer', build: siteFooter },
  { key: 'hero_banner', build: heroBanner },
  { key: 'article_card', build: articleCard },
  { key: 'featured_articles', build: featuredArticles },
  { key: 'article_header', build: articleHeader },
  { key: 'article_body', build: articleBody },
];
