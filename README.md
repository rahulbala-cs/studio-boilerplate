# Contentstack Studio — reference implementation

A small, complete Studio project that shows how the pieces fit together. Use it
as a reference and as a starting point for your own.

Three page types, fourteen reusable Sections, four registered components, four
content types. Idempotent scripts create everything, so you can point it at an
empty stack and watch the whole project get built.

```
content types  →  components  →  Sections  →  Templates  →  pages
   (the data)     (the code)    (the blocks)  (the layouts)  (what a visitor sees)
```

---

## The one-minute version

- **Content types** model the data: `site_settings`, `article`, `page_home`, and `shop_landing_page`, whose body is a list of blocks the editor picks and orders.
- **Components** are your React code, registered so Studio offers them in its palette. Four, all atoms or layout.
- **Sections** are reusable page parts built from components. Each declares the slice of content it renders (its _linked schema_), or pins a site-wide entry. Fourteen: seven for the fixed-shape pages, seven for the block-built shop page.
- **Templates** compose Sections into a page and bind to one content type. Three: one per page type.
- **Pages** are what a visitor gets. One catch-all route serves them all, in every language.

Once set up, a marketer can change any wording or image, reorder the blocks on
a page, add a menu item, and publish a new page, without a developer.

---

## Prerequisites

- Node.js 20 or later.
- A Contentstack organization with Studio enabled, and OAuth access to it.
- An empty stack in the **NA** or **EU** region. The provisioning scripts support
  those two; the app itself runs against any region.
- A browser that trusts the local HTTPS certificate `next dev` generates on first run.

## Quick start

```bash
npm install
cp .env.example .env          # then put your stack's API key in it

# Authenticate once (interactive, needs a browser).
CONTENTSTACK_REGION=NA npx @contentstack/mcp --auth

npm run provision             # builds everything in the stack, then verifies it
npm run dev                   # https://localhost:3000 (redirects to /en)
```

`npm run provision` runs six steps in order and is safe to re-run:

| Step | What it does |
|---|---|
| `01-provision-stack` | locales, environment (one Base URL per locale), Live Preview, delivery + preview tokens, Global Field, content types |
| `02-provision-studio` | the `compositions` content type and the Studio project |
| `03-seed-content` | assets, entries, and publishing |
| `04-author-sections` | the fourteen Sections, each with its palette thumbnail |
| `05-author-templates` | the three Templates |
| `06-verify` | the eight-point check in [Things that fail silently](#things-that-fail-silently) |

Each step also runs on its own: `npm run provision:stack`, `provision:studio`,
`provision:content`, `provision:sections`, `provision:templates`, `verify`.

**Region.** Two variables, one data centre: `CONTENTSTACK_REGION` (`NA` or `EU`)
for the scripts, and `NEXT_PUBLIC_CONTENTSTACK_REGION` (`us`, `eu`, `azure-na`,
`azure-eu`, `gcp-na`, `gcp-eu`, `au`) for the app. Both must point at the same
data centre.

**The dev script** is `next dev --turbo --experimental-https`. HTTPS is required
because Studio is served over HTTPS and blocks an `http://localhost` iframe as
mixed content. Turbopack is required because Next 14's webpack dev server loads
the Studio SDK once per route, and every page then fails with "multiple renderers
concurrently rendering the same context provider". Production builds are not
affected.

**Authentication** is OAuth only, resolved from `CS_OAUTH_ACCESS_TOKEN` (with
`CS_ORG_UID`, for CI) or from the Contentstack MCP's stored session. No script
asks for a session `authtoken`.

---

## How the pieces fit

### 1. Content types — the data

Defined as data in [`scripts/lib/content-model.mjs`](scripts/lib/content-model.mjs).

```
GF  seo                meta_title · meta_description
                       on every page type — no Section (renders in <head>)

CT  site_settings      brand_name · logo · nav_links (repeating) · footer_note
CT  article            title · url · summary · cover_image · cover_image_alt · author_name
                       published_on · body (rich text) · featured_articles · seo
CT  page_home          title · url · hero (group) · featured_articles · seo
CT  shop_landing_page  title · url · summary · blocks (modular blocks) · seo
                       blocks: hero_split · hero_full_bleed · promo_banner
                               category_tiles · product_grid · editorial
```

`featured_articles` has the **same field uid on both page types that use it**,
on purpose. A Section binds by field name, so two Templates can share one
Section only if their content types name the field identically.

### 2. Components — your code, in Studio's palette

Four registered components in [`lib/studio-components.ts`](lib/studio-components.ts):

| Component | Kind | Why it exists |
|---|---|---|
| `SectionShell` | layout + slot | the full-width band: tone, width, vertical space |
| `Stack` | layout + slot | one-axis arrangement, or an auto-fitting grid |
| `Eyebrow` | atom | one styled label |
| `CtaButton` | atom | one link, styled as a button |

Everything else on screen (headings, body copy, images, links, rich text) uses
Studio's **built-in** components, so an author can restyle and restructure it. A
component that renders a heading _and_ an image _and_ a button is three decisions
an author can no longer make: register the pieces and compose the shape in a
Section.

Each registration ships, in the same file: `thumbnailUrl` (or the palette shows a
text placeholder), `wrap: false` paired with a `studioAttributes` spread in the
component (or the node can't be selected on the canvas), and a `defaultValue` per
prop (or the palette tile previews blank).

### 3. Sections — the reusable blocks

Built in [`scripts/lib/sections.mjs`](scripts/lib/sections.mjs), in dependency order.

| # | Section | Renders | Pattern it demonstrates |
|---|---|---|---|
| 1 | Site Header | the Site Settings entry (pinned) | a Section that **pins its own entry**; menu as a **Repeater over a field** |
| 2 | Site Footer | the Site Settings entry (pinned) | **reusing the same entry and field** in a second Section |
| 3 | Hero Banner | `hero` (group) | scoping to a **group** |
| 4 | Article Card | `article` (per item) | a **fill Section** for a slot |
| 5 | Featured Articles | `featured_articles` (multi ref) | **list Section**: Repeater + **Section Slot** + slot **default** + **exposed props** |
| 6 | Article Header | `article` (whole entry) | **whole-entry scope**: several fields, no `selected_field` |
| 7 | Article Body | `article` (whole entry) | rich text as its own block |

**The scoping rule behind every binding path:**

- `selected_field` **set**: the Section's `template` _is_ that field's value. Paths are relative to it.
- `selected_field` **unset**: `template` is the whole page entry. Paths are `template.<field>`.

Set it on a Section that reads several unrelated fields and everything outside
the scoped path resolves to `undefined`, with no error.

**Site-wide content is pinned, not referenced.** Header and Footer read the one
Site Settings entry through their own `data_sources` (in Studio: **Data** tab →
**Additional Entry Data**). No page links to it, so every page on every template,
including a brand-new one, gets the real header and footer. The Data tab appears
once the project's **Enable Freeform Feature** setting is on, which
`02-provision-studio` sets. Pinned entries load in the page's locale.

### 4. Templates — the layouts

```
Connected  /                          page_home          (one entry, one URL)
           Site Header → Hero Banner → Featured Articles → Site Footer

Connected  /articles/{{entry.title}}  article            (every entry, its own page)
           Site Header → Article Header → Article Body → Featured Articles → Site Footer

Connected  /shop/{{entry.title}}      shop_landing_page  (every entry, its own page)
           Site Header → Repeater over the entry's blocks → Site Footer
```

All three are **Connected** templates, bound to a content type, which is why
"every article gets its own page" needs no extra work. Featured Articles appears
on two of them with a different heading on each: one exposed prop, not two
Sections.

### 5. A page built from blocks — the Shop Landing Page

Home and Article have a **fixed shape**. The Shop Landing Page doesn't: its body
is one Modular Blocks field, and the **editor** decides which blocks a page uses
and in what order, in the entry form or in Visual Editor. Studio decides how each
block type looks.

```
Template: Shop Landing Page
├── Site Header
├── Stack (list) → Repeater over `blocks` → Stack (item)
│   ├── Condition: hero_split       → Block · Hero Split
│   ├── Condition: hero_full_bleed  → Block · Hero Full Bleed
│   ├── Condition: promo_banner     → Block · Promo Banner
│   ├── Condition: category_tiles   → Block · Category Tiles
│   ├── Condition: product_grid     → Block · Product Grid
│   └── Condition: editorial        → Block · Editorial Story
└── Site Footer
```

The Repeater and Condition Blocks sit on the template itself, so the routing is
visible in the template's layer tree. The **Page Blocks** Section packs the same
list into one reusable Section (with a Section Slot per block type). It stays in
the library, but this template doesn't use it.

- **Reorder the blocks in the entry and the page follows.** No Studio change, no deploy.
- **Each block type is its own Section.** Redesign the Promo Banner once and every page changes.
- **A different arrangement is a separate block type** (Split and Full Bleed are
  both heroes). **A different style is a field** bound to a component prop:
  `image_position` flips the Split hero, `tone` colours the Promo Banner.
- **Why not fixed Sections in a fixed order?** Then the Template decides the order,
  not the editor.

Four rules, all silent when broken (details in
[`scripts/lib/shop-sections.mjs`](scripts/lib/shop-sections.mjs)):

1. A Condition Block needs a `conditionBinding`, or it renders nothing.
2. Its `dataBinding` narrows the item to that block's fields, so block Sections bind `headline`, not `hero_split.headline`.
3. Copy uses the built-in Paragraph (`text`), not `plain-text`, which renders a bare text node and drops classes.
4. A block Section's linked schema is `blocks.<block uid>` with cardinality `single`.

**Visual Editor list editing.** Adding, moving and deleting blocks needs an edit
tag on the list (`blocks`) and on each item (`blocks.N`). The list Stack is marked
`repeaterWrapper`, and an item Stack sits directly under the Repeater, so both are
emitted. With `emptyAddButton`, an empty list shows Visual Editor's own "add a
block" panel. The tiles, products and nav lists work the same way.

The products are typed into the entry so the demo stands alone. In production
they would come from your commerce platform as external data.

### 6. New entries in Visual Editor

A new entry holds only the fields someone has typed into. Other fields are
missing, or `null` in a draft, so Studio shows component defaults ("Your text
here") and those fields get no edit tag: they can only be filled in from the form.

- [`lib/complete-entry.ts`](lib/complete-entry.ts) uses the SDK's
  `fetchTemplateEntry` hook to give every missing or `null` field an empty value
  of the right shape (`''`, `{ url: '' }` for images, `[]` for lists). Every field
  is then tagged and clickable. Filled values are never touched.
- [`lib/editor-hints.ts`](lib/editor-hints.ts) draws empty fields as a dashed
  "Add Headline" box, inside an editor iframe only.

### 7. Pages — one route

[`app/[locale]/[[...slug]]/page.tsx`](app/%5Blocale%5D/%5B%5B...slug%5D%5D/page.tsx)
is a catch-all. Studio resolves which composition answers a URL, so a new
Template needs no route change. When Studio opens a URL with no saved composition
yet (an author building a new Template), the route renders an empty editor; a
visitor on the same URL gets a 404.

### 8. Locales — one prefix per language

Every page lives under a locale prefix (`/en`, `/en/articles/…`). One variable maps
prefixes to stack locale codes; the first entry is the default and must be the
stack's master locale:

```
NEXT_PUBLIC_CONTENTSTACK_LOCALES=en:en-us            # this repo
NEXT_PUBLIC_CONTENTSTACK_LOCALES=en:en-us,fr:fr-fr   # add French
```

- Templates store URLs **without** the prefix; the route passes the locale to the
  SDK separately, so one Template serves every language.
- Each locale gets its own **Base URL** on the environment (`https://localhost:3000/en`).
  Studio builds the canvas address from it, which is why the canvas route sits under `[locale]` too.
- **Nothing Studio requests may redirect**: its preview iframe fails on any 3xx.
  The Home template's URL is `/`, so Studio asks for `/en/`, and `next.config.mjs`
  sets `skipTrailingSlashRedirect`.
- Unprefixed URLs redirect ([`middleware.ts`](middleware.ts)) to the visitor's
  last locale, else the default.

To add a language: add it to the variable, re-run `npm run provision:stack`, then
localize and publish the entries and compositions in it.

---

## Deploying to production

- **Don't set `NEXT_PUBLIC_CONTENTSTACK_PREVIEW_TOKEN` on the public site.**
  Without it, Live Preview is off and only published content is served. Run
  previews from a separate preview deployment.
- `NEXT_PUBLIC_*` variables are inlined at **build** time. Changing one needs a rebuild.
- Studio and Visual Editor iframe the site. `next.config.mjs` sends
  `Content-Security-Policy: frame-ancestors 'self' https://*.contentstack.com`;
  make sure your host or CDN doesn't add `X-Frame-Options` or a stricter CSP.
- Set the environment's Base URL to the deployed origin (with the locale prefix),
  and keep `skipTrailingSlashRedirect`.

---

## Things that fail silently

Each of these renders a good-looking page and breaks only the editing experience.
`npm run verify` checks the first eight.

| # | Deliverable | What happens when it's missing |
|---|---|---|
| 1 | `cslp.appendTags` in SDK init | nothing anywhere is click-to-edit |
| 2 | `studioAttributes` + `wrap: false` | the node can't be selected on the canvas |
| 3 | `thumbnailUrl` per registration | the palette shows a text placeholder |
| 4 | `ui_preview` per Section | blank tile in the Sections list |
| 5 | Live Preview + preview token | blank canvas |
| 6 | the `/[locale]/canvas` route | nothing can be authored |
| 7 | published | Delivery serves the **previous** version while the CMA looks correct |
| 8 | Template composed of Sections | it renders correctly and has no reusable parts |
| — | Live Preview `mode: 'builder'` | Visual Editor opens the page, but nothing can be clicked to edit |
| — | `fetchTemplateEntry` completing the entry | a new entry reads "Your text here", and its empty fields can only be edited from the form |
| — | `pointer-events: none` on decorative overlays | an image under a gradient can't be selected |

Every write in `scripts/` publishes in the same step because of number 7: editing
a composition creates an unpublished version, and every other check says it worked.

---

## Design notes

- **Server and client halves.** [`lib/studio.server.ts`](lib/studio.server.ts)
  imports `@contentstack/studio-core` (fetching only);
  [`lib/studio.client.ts`](lib/studio.client.ts) imports `@contentstack/studio-react`.
  Importing `studio-react` from a Server Component crashes with "Cannot read
  properties of null (reading 'useContext')".
- **No header, footer or SDK boot in the layout.** Header and footer are Sections,
  so authors can edit them. The SDK boots in `StudioRender.tsx` and the canvas
  route, not the shared layout.
- **`seo` has no Section.** It renders into `<head>` through `generateMetadata`,
  with its own fetch, because the composition only carries fields Sections bind.
  See [`lib/seo.ts`](lib/seo.ts).
- **Alt text is a content field** (`cover_image_alt`, `image_alt`), not a hardcoded string.

## Deliberately left out

- **Freeform templates and pinned queries.** Every page here is Connected.
- **External data** (the `data` prop), **Studio state and `action` props**, and
  **Personalize variant aliases.**
- **Design tokens.** Worth adding next: registering your colours and spacing makes
  them available in Studio's Design panel.
- **Embedded entries in rich text.** Register a renderer when you allow embeds;
  [`lib/studio-components.ts`](lib/studio-components.ts) has an example in a comment.

---

## Adapting this

1. Point `.env` at your own empty stack and run `npm run provision`. Everything is find-or-create.
2. Edit [`scripts/lib/content-model.mjs`](scripts/lib/content-model.mjs) and re-run
   `npm run provision:stack`. The scripts own these content types: fields added in
   the UI are overwritten on re-run.
3. Replace the components in [`components/`](components), update
   [`lib/studio-components.ts`](lib/studio-components.ts), and restart the dev server.
4. Edit [`scripts/lib/sections.mjs`](scripts/lib/sections.mjs) or
   [`scripts/lib/shop-sections.mjs`](scripts/lib/shop-sections.mjs) and re-run
   `npm run provision:sections`; edit [`scripts/lib/templates.mjs`](scripts/lib/templates.mjs)
   and re-run `npm run provision:templates`.
5. Run `npm run verify` before you call it done.

After editing files in `lib/` or `components/`, **restart `npm run dev`**. A hot
reload can leave the SDK in a broken state ("Invalid hook call", every page 500s)
until the server restarts.

After the first pass, do most authoring **in Studio's UI**. The scripts exist so the
project can be rebuilt from zero, not as the day-to-day way to work.

## Sample content

The Meridian brand, all sample entries, and the typed-in products are demo
content. The sample photos are from [Unsplash](https://unsplash.com), used under
the [Unsplash License](https://unsplash.com/license). They are downloaded at seed
time (not stored in this repo), each asset's description records its source, and
they come with no model or property releases. Replace them before production.

## AI-assistant skills

[`skills/`](skills) is an optional set of Claude Code skills for working with
Studio: setup, Sections, Templates and troubleshooting. Nothing in the app depends
on it.

---

## Repo map

```
app/
  [locale]/[[...slug]]/page.tsx          one catch-all route: every Studio page
  [locale]/[[...slug]]/StudioRender.tsx  client boundary that renders a composition
  [locale]/canvas/page.tsx               the route Studio iframes to author Sections
  [locale]/layout.tsx                    root layout: <html lang>, no header or footer
  globals.css                            tokens, then the markup Studio renders

middleware.ts              redirects unprefixed URLs to a locale
next.config.mjs            frame-ancestors header; no trailing-slash redirect
components/                the four registered components + palette thumbnails
lib/
  locales.ts               URL prefix → stack locale code
  stack.ts                 Delivery SDK + region hosts (no React)
  studio.server.ts         server half: fetching only
  studio.client.ts         client half: rendering, Live Preview, registry
  studio-components.ts     registerComponent calls
  complete-entry.ts        gives a new entry every field, so all of it is editable
  editor-hints.ts          "Add …" boxes for empty fields, inside editors only
  resolve-composition.ts   a composition miss becomes a 404, not a 500
  seo.ts                   <head> metadata from the seo Global Field

scripts/
  provision.mjs            runs 01→06
  lib/cma.mjs              OAuth API client with in-process token refresh
  lib/content-model.mjs    the whole schema, as data
  lib/compositions-ct.mjs  Studio's own content type
  lib/composition.mjs      the ui-tree contract: nodes, bindings, validation
  lib/sections.mjs         the seven Sections for the fixed-shape pages
  lib/shop-sections.mjs    Page Blocks + one Section per shop block type
  lib/templates.mjs        the three Templates
  lib/sample-content.mjs   the sample entries
  lib/artwork.mjs          brand mark SVG + sample photo list
  lib/section-preview.mjs  Section thumbnails, drawn from each composition's tree

skills/                    optional Claude Code skills for Studio
```
