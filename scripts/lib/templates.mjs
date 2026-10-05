/**
 * The three Templates.
 *
 * A Template composes Sections; it does not hold content of its own. All three
 * are CONNECTED templates — bound to a content type — which is the default
 * flavour and the one that makes "every article gets its own page" work.
 *
 * Three things the API path has to write that the Studio UI writes for itself,
 * each of which fails silently when missing:
 *
 *  1. `linked_sections` — a reference per placed Section. SSR walks the tree and
 *     renders fine without it, but the EDITOR loads templates with
 *     `?include[]=linked_sections` and shows "Template Did Not Load" when empty.
 *  2. `url_metadata` — the pattern alone is not enough. Without the metadata
 *     Studio has no derivation to show, so the first author to touch the URL
 *     re-types it by hand and the content-type link is gone for good.
 *  3. `data_sources.resolvedReferences` — reference fields arrive as bare
 *     `{uid}` stubs otherwise, so the Repeater iterates nothing.
 */
import { nid, node, page, tmpl, rep, StaticValues } from './composition.mjs';
import {
  FEATURED_SLOT_UID,
  EXPOSED_HEADING,
  EXPOSED_TONE,
  STACK,
  stackProps,
} from './sections.mjs';
import { SHOP_BLOCK_TYPES } from './shop-sections.mjs';
import { COMPOSITIONS_CT } from './config.mjs';

const URL_QUERIES = JSON.stringify({ include: [], only: {}, where: {} });

/** Place one Section on a Template. */
function place(
  sectionUid,
  instanceUid,
  { title, selectedField, matchedCt, slotFills, props } = {},
) {
  const n = node('section-composition', instanceUid, {
    title,
    metadata: {
      // The runtime resolves the Section by this. It must be the Section's ENTRY
      // uid, which is why composable_uid is set to the entry uid everywhere.
      compositionUID: sectionUid,
      // Both the runtime and the editor must agree on the scope. The editor
      // derives it from the Section's linked_schemas; this override is the
      // runtime's copy of the same answer. `matchedSchemaCt` picks WHICH
      // linked_schemas row applies — the shared Sections declare one per page
      // content type, and cardinality is read off the matched row.
      ...(selectedField || matchedCt
        ? {
            sectionBindingOverride: {
              ...(selectedField ? { selectedField } : {}),
              ...(matchedCt ? { matchedSchemaCt: matchedCt } : {}),
            },
          }
        : {}),
    },
    props: props ?? {},
  });
  // Filling a Section Slot means putting a real section-composition node under
  // the wrapper's section-slot uid.
  if (slotFills) {
    for (const [slotUid, fill] of Object.entries(slotFills)) n.slots[slotUid] = [fill];
  }
  return n;
}

/**
 * The reference field the Featured Articles Section reads through. Without this
 * map the CDA is never told to expand it, so it stays a stub and the cards
 * render empty. (Site Settings is not here: Header and Footer pin it.)
 */
const DATA_SOURCES = JSON.stringify([
  { uid: 'template', data: null, resolvedReferences: { template: ['featured_articles'] } },
]);

export function buildTemplates(s) {
  // ── Home ──────────────────────────────────────────────────────────────────
  const homeSv = new StaticValues();
  const homeFeatured = nid('home', 'featured');
  const home = {
    title: 'Home Template',
    place_composition_as: 'page',
    schema_version: '1.0.0',
    connected_content_type: 'page_home',
    url: '/',
    url_metadata: { url_source: 'content_type_url_pattern', url_queries: URL_QUERIES },
    data_sources: DATA_SOURCES,
    linked_schemas: [],
    linked_sections: [
      s.site_header.uid,
      s.hero_banner.uid,
      s.featured_articles.uid,
      s.article_card.uid, // the fill section counts too
      s.site_footer.uid,
    ].map((uid) => ({ uid, _content_type_uid: COMPOSITIONS_CT })),
    static_value: null, // filled below, once every key is registered
    __tree: null,
  };

  home.__tree = page(nid('home', 'page'), [
    place(s.site_header.uid, nid('home', 'header'), {
      title: 'Site Header',
    }),
    place(s.hero_banner.uid, nid('home', 'hero'), {
      title: 'Hero Banner',
      selectedField: 'hero',
      matchedCt: 'page_home',
    }),
    place(s.featured_articles.uid, homeFeatured, {
      title: 'Featured Articles',
      selectedField: 'featured_articles',
      matchedCt: 'page_home',
      // Fills the Section's slot with the Article Card, per instance. The card
      // inherits the wrapper's internal Repeater, so it re-scopes to each item.
      slotFills: {
        [FEATURED_SLOT_UID]: place(s.article_card.uid, nid('home', 'card'), {
          title: 'Article Card',
          selectedField: 'featured_articles',
          matchedCt: 'page_home',
        }),
      },
      props: {
        [EXPOSED_HEADING]: {
          type: 'plaintext',
          binding: homeSv.add(homeFeatured, 'heading', 'plaintext', 'Featured Articles'),
        },
        [EXPOSED_TONE]: {
          type: 'choice',
          binding: homeSv.add(homeFeatured, 'tone', 'choice', 'muted'),
        },
      },
    }),
    place(s.site_footer.uid, nid('home', 'footer'), {
      title: 'Site Footer',
    }),
  ]);
  home.static_value = homeSv.toEntryField();

  // ── Article ───────────────────────────────────────────────────────────────
  const artSv = new StaticValues();
  const artFeatured = nid('article', 'featured');
  const article = {
    title: 'Article Template',
    place_composition_as: 'page',
    schema_version: '1.0.0',
    connected_content_type: 'article',
    // `:slug` is treated as a literal by the CMS pattern compiler; `:title` is
    // the token it actually substitutes. The CT pattern (/:title + /articles/
    // prefix) and this URL have to agree by construction.
    url: '/articles/{{entry.title}}',
    url_metadata: { url_source: 'content_type_url_pattern', url_queries: URL_QUERIES },
    data_sources: DATA_SOURCES,
    linked_schemas: [],
    linked_sections: [
      s.site_header.uid,
      s.article_header.uid,
      s.article_body.uid,
      s.featured_articles.uid,
      s.article_card.uid,
      s.site_footer.uid,
    ].map((uid) => ({ uid, _content_type_uid: COMPOSITIONS_CT })),
    static_value: null,
    __tree: null,
  };

  article.__tree = page(nid('article', 'page'), [
    place(s.site_header.uid, nid('article', 'header'), {
      title: 'Site Header',
    }),
    place(s.article_header.uid, nid('article', 'articlehead'), {
      title: 'Article Header',
      matchedCt: 'article',
    }),
    place(s.article_body.uid, nid('article', 'body'), {
      title: 'Article Body',
      matchedCt: 'article',
    }),
    place(s.featured_articles.uid, artFeatured, {
      title: 'More reading',
      selectedField: 'featured_articles',
      matchedCt: 'article',
      slotFills: {
        [FEATURED_SLOT_UID]: place(s.article_card.uid, nid('article', 'card'), {
          title: 'Article Card',
          selectedField: 'featured_articles',
          matchedCt: 'article',
        }),
      },
      // The SAME Section, reading differently here. One exposed prop instead of
      // a second near-identical Section — which is the point of exposing one.
      props: {
        [EXPOSED_HEADING]: {
          type: 'plaintext',
          binding: artSv.add(artFeatured, 'heading', 'plaintext', 'More reading'),
        },
        [EXPOSED_TONE]: {
          type: 'choice',
          binding: artSv.add(artFeatured, 'tone', 'choice', 'muted'),
        },
      },
    }),
    place(s.site_footer.uid, nid('article', 'footer'), {
      title: 'Site Footer',
    }),
  ]);
  article.static_value = artSv.toEntryField();

  // ── Shop Landing Page ─────────────────────────────────────────────────────
  // The block list is built right here on the template, not inside a Section:
  //
  //   Stack (list) → Repeater over `blocks` → Stack (item)
  //     ├── Condition Block: hero_split → Block · Hero Split
  //     └── …one per block type
  //
  // The entry decides which blocks appear and in what order; each block Section
  // decides how its type looks. The conditions follow the rules at the top of
  // shop-sections.mjs. (Page Blocks packs this same list into one Section; it
  // stays in the library but this template does not use it.)
  const shopSv = new StaticValues();
  const shopList = nid('shop', 'list');
  const shopRid = nid('shop', 'repeater');
  const shopItem = nid('shop', 'item');
  const blockBranches = SHOP_BLOCK_TYPES.map(({ block, key, title }) =>
    node('condition-block', nid('shop', 'condition', block), {
      title: `If ${title.replace('Block · ', '')}`,
      metadata: {
        condition: {
          type: 'modular_block',
          operator: 'eq',
          value: block,
          subType: 'block_name',
          conditionBinding: rep(shopRid, block),
          dataBinding: rep(shopRid, block),
        },
      },
      children: [
        place(s[key].uid, nid('shop', 'fill', block), {
          title,
          selectedField: `blocks.${block}`,
          matchedCt: 'shop_landing_page',
        }),
      ],
    }),
  );
  const shop = {
    title: 'Shop Landing Page Template',
    place_composition_as: 'page',
    schema_version: '1.0.0',
    connected_content_type: 'shop_landing_page',
    // Same contract as the Article template: the CT's URL pattern (/:title under
    // /shop/) decides the URL, and a request resolves by the entry's own `url`.
    url: '/shop/{{entry.title}}',
    url_metadata: { url_source: 'content_type_url_pattern', url_queries: URL_QUERIES },
    // No references to resolve: the blocks are inline, and Header and Footer
    // pin Site Settings themselves.
    data_sources: JSON.stringify([{ uid: 'template', data: null, resolvedReferences: {} }]),
    linked_schemas: [],
    linked_sections: [
      s.site_header.uid,
      ...SHOP_BLOCK_TYPES.map(({ key }) => s[key].uid),
      s.site_footer.uid,
    ].map((uid) => ({ uid, _content_type_uid: COMPOSITIONS_CT })),
    static_value: null, // filled below, once every key is registered
    __tree: page(nid('shop', 'page'), [
      place(s.site_header.uid, nid('shop', 'header'), {
        title: 'Site Header',
      }),
      // The two Stacks are for Visual Editor's add / move / delete controls,
      // which need a `blocks` tag around the list and a `blocks.N` tag around
      // each block (see Page Blocks in shop-sections.mjs for the full why).
      node(STACK, shopList, {
        title: 'Blocks list',
        metadata: { repeaterWrapper: true },
        props: stackProps(shopSv, shopList, {
          gap: 'none',
          align: 'stretch',
          emptyAddButton: true,
        }),
        children: [
          node('repeater', shopRid, {
            title: 'Each block, in entry order',
            metadata: { mode: 'preview', repeaterBindingFieldType: 'blocks' },
            props: { items: { type: 'array', binding: tmpl('blocks') } },
            children: [
              node(STACK, shopItem, {
                title: 'Block',
                props: stackProps(shopSv, shopItem, { gap: 'none', align: 'stretch' }),
                children: blockBranches,
              }),
            ],
          }),
        ],
      }),
      place(s.site_footer.uid, nid('shop', 'footer'), {
        title: 'Site Footer',
      }),
    ]),
  };
  shop.static_value = shopSv.toEntryField();

  return [home, article, shop];
}
