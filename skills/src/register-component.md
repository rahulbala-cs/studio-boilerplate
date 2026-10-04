---
name: register-component
---

## When to use

Read a React component, infer a prop schema, and write a `registerComponent` call so Studio's palette uses the customer's component instead of built-in defaults. Lazy by default.

Use when the user wants Studio's palette to surface their components: "make my Hero available in Studio", "Studio shows defaults instead of mine", "register components in src/components". The BYOC moment. Do NOT use to register design tokens (use `import-design-tokens`). Do NOT invent prop schemas. Only register props visible in source.

> **Auth preflight: settle the credential before the first API call.** Resolve it OAuth-first per [`authenticate-cma`](authenticate-cma.md): `CS_OAUTH_ACCESS_TOKEN`, else the Contentstack MCP's stored session. **Never ask the user for a session `authtoken`.** If nothing resolves, or a refresh fails with `400 invalid_refresh_token`, hand them `! CONTENTSTACK_REGION=<code> npx @contentstack/mcp --auth` (it needs a TTY and a browser, so it cannot be run for them) and wait. `403 error_code 316` is a valid credential aimed at another org: fix the org or the `api_key`, do **not** re-authenticate.

> **Reuse preflight: mandatory when the project already has compositions.** Before naming a single new atomic, component or Section, run [`match-existing-pattern`](match-existing-pattern.md) § Step 1b: it groups existing Sections by the schema they bind and ranks the component palette by real usage. Decomposition is where reuse has to bite. Once this step names `Heading` instead of the project's `alpha-atom-heading`, the duplicate survives into the plan and into the build. Mark every row reuse, extend, or new, and never new without having looked.

# Register a component with Studio

> **Atomic check before you register anything.** Registration is where a monolith becomes permanent. If the component renders **more than one heading / image / body / list**, stop and run [`decompose-jsx-to-atomics`](decompose-jsx-to-atomics.md) first. Register its atomics and containers, not the whole thing. Registering a page-level component is how a project ends up with one Section, nothing reusable, and a coarse prop that renders blank. Exception: it is genuinely interactive (form, carousel, modal) and cannot be expressed with built-ins, then register it whole and expose an `action` prop so authors can still wire behaviour.
>
> **And check reuse first:** header, footer, nav and menus are shared across every page. Register the atomics once and bind their lists through a Repeater, rather than registering a per-page variant.

## Before you start: walk Q2, Q3, Q4 of the framework

This skill runs the last three questions of the [four-question decision framework](../../docs/00-getting-started/composable-primitives.md#four-questions-to-answer-when-building-any-component). Q1 (classify: atom, layout, or compound?) is answered before you land here. If the input is a compound, `decompose-jsx-to-atomics` or `decompose-design` decomposes it into atoms + layouts before registration. If the input is already a valid atom or layout, proceed.

- **Q2: Does the registry already have it?** Before writing a `registerComponent` call, check whether an existing primitive covers the shape. If yes, reuse (don't re-register). If not, proceed to Q3.
- **Q3: Which props?** For each proposed prop: does it vary per-instance AND represent functional/content intent (not visual polish)? If either is no, refuse the prop. Let a DS token decide.
- **Q4: Which are Exposed?** For each schema prop: is it author-understandable AND DS-portable? If either is no, keep static per-Section. Never expose atom props.

If any answer is ambiguous, halt and ask the user to disambiguate. Never silently register a prop that fails Q3 or expose a prop that fails Q4.

## Before you start: pick the layer

Every component you register is one of two shapes. Decide which before writing the registration:

- **Layer 1: Atomic** (renders one CMS field). All scalar props. `<Heading>`, `<Text>`, `<Image>`, `<Button>`. This skill's default path.
- **Layer 2: Container / Skeleton / Layout** (holds other components). Has at least one `slot`-typed prop as a drop zone. `<Card>` with a body slot, `<Split>` with left+right slots. Same skill. § "Exposing extensible regions with slot props" covers it.

If the thing you want to register is neither: a pure layout primitive (Grid, Stack, Container, Box), a whole page-shaped composition, or a component with an array-of-objects prop. **Stop.** Read [From designs to Sections: the three-layer mental model](../../docs/00-overview/from-designs-to-sections.md) first. It's a 10-minute page that saves hours of "why doesn't my Grid work in Studio."

## Context

Studio composes pages from React components. By default it uses its **own** built-ins (Hero, Card, Button) so authors can play immediately, but for production, every component should come from the customer's library. Registering tells Studio's palette "use THIS component for type 'site-hero'" so authors drop branded components, not defaults.

The registration is a `registerComponent` call that names the component, gives it a unique `type`, and declares the **prop schema** Studio's right-panel will offer for binding. Prop types are strict and finite, exactly: `string`, `boolean`, `number`, `choice`, `href`, `imageurl`, `datestring`, `array`, `object`, `slot`, `json_rte`, `any`. There is no `text`, `link`, `color`, or `image`, common false-friends from other systems.

Reference: `docs/20-bring-your-own-components/register-components.md`, `docs/20-bring-your-own-components/component-schema-prop-types.md`.

## Task

1. **Locate the registration entry point.** Look for `src/register-components.tsx`, `src/register-studio.ts`, or `src/lib/contentstack.ts` (whichever file imports `registerComponent` from `@contentstack/studio-react`). If none exists, create `src/register-components.tsx` and ensure it's imported once at app startup (before any `<StudioCanvas />` or `<StudioComponent />` mounts).

2. **Read the component at `componentPath`.** Extract the prop names and types. Source of truth ranked by reliability:
   - Explicit TypeScript interface (`interface HeroProps { … }`), most reliable
   - `propTypes` block, second-best
   - Destructured args + JSDoc comments, fallback only

3. **Map each prop to a Studio prop type.** Use the **exact** strings below (13 in total). Anything else is rejected:

   | Source shape | Studio prop type |
   |---|---|
   | `string` / `string \| undefined` | `string` |
   | `number` | `number` |
   | `boolean` | `boolean` |
   | `string` constrained to known values (union literal, enum) | `choice` (set `options:` to the literal values. `defaultValue` is the **bare value** for single-select (`"centered"`) and an **array** only when `multiSelect: true`) |
   | URL string used as `href` | `href` |
   | URL string used as image `src` | `imageurl` |
   | ISO date string | `datestring` |
   | array | `array`, binds to a **multi-value field** (Reference multi, Group multi, Modular Block, scalar multi). Reference sources need `data_sources.resolvedReferences`. Groups / Modular Blocks / scalar multi-values live on the entry and need no resolution. See § Array & object props: binding rules |
   | object | `object`, binds when the shape matches an entry Group / Global Field. See § Array & object props: binding rules |
   | React `children` / placeholder for extensible region | `slot`, fillable at template time via `use-section-slot` § component-slot-prop placement. The prop turns that region of the component into an author-controlled drop target. No `defaultValue` (slots start empty). |
   | rich text (JSON RTE field, HTML payload) | **`json_rte`**, not `string`. RTE renders markup, and `string` would show it as literal `<p>` text. |
   | unknown / can't infer, and the value is a **primitive** | `any`, **never for object- or array-shaped data.** See the flatten trap below |
   | A callback an **author** should be able to point at your app's logic (`onClick`, `onSelect`, `onSubmit`) | **`action`**: the author picks a registered studio function. Your component just calls the prop. Needs `registerStudioFunctions`. See [`wire-studio-state`](wire-studio-state.md). **Omit this and interactivity stays hardcoded**, so the component is a black box authors can't wire |

   ### The `any` flatten trap: why structured data renders blank

   `any` is not a harmless catch-all. Verified in `studio-registry/src/data-binder/retrieve-data.ts`, the binder runs a **recursive single-key unwrap** on every prop type except `object` and `array`:

   ```js
   // Unwrap single-key objects (common in Contentstack Modular Blocks)
   // We only do this if we are not explicitly expecting an object or array.
   if (type !== "object" && type !== "array" && !handledRepeaterContext) {
     resolvedData = getFlattenedData(resolvedData);
   ```

   and `getFlattenedData` descends **as long as the object has exactly one key**, ignoring `$` and `_metadata`:

   ```js
   const keys = Object.keys(data).filter((k) => k !== "$" && k !== "_metadata");
   if (keys.length === 1) return getFlattenedData(data[keys[0]]);   // recurses
   ```

   **So a single-field block bound to an `any` prop is silently replaced by its inner value.** A block like `image_grid → { image: [...] }` or `tabs → { tabs: [...] }` has one real key, so the object you expected never arrives. The component receives the bare inner array. Read it as an object and every lookup is `undefined`. The array's indices surface as `{0,1,2,3}`. **Blank render, no error, nothing in the console.** The `_metadata` exclusion makes it worse: a block carrying one field plus `_metadata` still counts as single-key and still unwraps.

   **The fix is the prop type, not the data.** `object` and `array` are the only two types that skip the unwrap:

   | The bound field is | Use | Why |
   |---|---|---|
   | A Group / Global Field / whole block object | **`object`** | Skips the unwrap. The shape arrives intact |
   | A list: Modular Blocks, multi-Reference, multi-Group, scalar list | **`array`** | Skips the unwrap. Render with `.map()` |
   | A genuine primitive of unknown type | `any` | Flattening a primitive is a no-op, so it's safe here only |

   Match the type to the **real** shape. "The shape varies per block" is not a reason to reach for `any`. It's a reason to use `object`.

   This is a **resolver-level** behaviour (`retrievePropValue`), so it bites UI / picker-authored bindings exactly as it bites API-authored ones, not an API-only footgun. It is also **not specific to Modular Blocks**: any single-key object collapses: a Group with one sub-field, a single-item wrapper, a block carrying one field plus `_metadata`. Rule of thumb: whenever the value you want is an object or a list, type the prop `object` / `array`. `any` is safe only for a genuine primitive.

   **These 12 strings govern YOUR registered components only.** Studio's built-in nodes (`header`, `plain-text`, `rich-text`, `image`, …) carry their own prop-type vocabulary, e.g. the built-in Header's text prop is typed **`plaintext`**, which is not in the list above and is not valid in a `registerComponent` schema. Reading an existing composition and copying a built-in's prop type into your registration is a silent rejection. The two vocabularies overlap in places and diverge in others. Never transplant between them. Built-in node types are catalogued in [`author-composition-via-api`](author-composition-via-api.md) § Built-in node `type` values.

4. **Set `defaultValue` for every prop** where the component has a default value in its source. The default appears as the palette tile preview. Without it, the tile renders blank and authors don't know what the component looks like. Use `defaultValue:` exactly, NOT `default:` (the latter is silently ignored).

5. **Ship a `thumbnailUrl`: every registration, no exceptions.** (This and the `studioAttributes` contract below are two of the six in [`complete-the-build`](complete-the-build.md). Both ship in the same commit as the registration, never as a follow-up.) `thumbnailUrl` defaults to `""` in the registry (`studio-registry`, `registry-options-processor`), and Studio then renders a **text placeholder** instead of a preview. A palette of twenty text placeholders is unusable for the marketers this whole exercise exists to serve, and nothing errors, so it ships unnoticed.

   Rules that matter (full guidance + the `thumb()` helper and tier glyph library: [`palette-conventions`](../../docs/20-bring-your-own-components/component-palette-conventions.md)):

   - **Inline SVG data URI**, built with `encodeURIComponent`. **Never a CDN/asset URL**. The palette renders inside Studio's iframe, where external requests hit CORS or fail silently, leaving you back at a blank tile.
   - **Brand tokens for colors**, not invented hex.
   - **Preview the shape, not the pixels**: the thumbnail says what kind of thing this is (atomic / slot-shell / pattern).

   ```ts
   registerComponent(Hero, {
     name: "Hero",
     sections: ["Acme · Patterns"],
     thumbnailUrl: thumb(HeroGlyph, "Hero Block"),   // data:image/svg+xml,...
     props: { /* … */ },
   });
   ```

   **Retrofitting an existing registration file?** Every `registerComponent` call without `thumbnailUrl` is a blank tile today. Sweep them all: `grep -c "registerComponent" <file>` vs `grep -c "thumbnailUrl" <file>`. The counts must match.

5b. **Next.js App Router: registration must run in the CLIENT realm.** A registered component that is (or renders) a `"use client"` component cannot be registered from a Server Component module graph. On the server the SDK sees a client reference, and Next throws at render time ("Attempted to call the default export of \<module\> from the server but it's on the client") or the palette silently comes up empty because the registry that got populated was the server-side one.

   The rule: **`registerComponents()` runs from the same client boundary that runs `studioSdk.init`.** `install-studio` already creates one for init (`app/studio-init.tsx`, `"use client"`, side-effect import of `@/lib/contentstack`). Put the registration import there too, so both land in the client bundle in the right order:

   ```tsx
   // app/studio-init.tsx
   "use client";
   import "@/lib/contentstack";        // studioSdk.init
   import "@/lib/studio-components";   // registerComponent calls — SAME client boundary
   export function StudioInit() { return null; }
   ```

   Do **not** import the registration module from `app/layout.tsx`, a `page.tsx` Server Component, or any non-`"use client"` module. Pages Router / Vite / Remix don't have this split. A module-scope import in `_app.tsx` or `main.tsx` is fine. Related: [`install-studio`](install-studio.md) § App Router init boundary, and [`troubleshoot-ssr-rendering`](troubleshoot-ssr-rendering.md) for the registry-singleton symptoms.

6. **Write the registration: prefer LAZY by default.** Append (or update) the registration file. The recommended shape is **lazy**: the component is downloaded only when it first renders, keeping the initial bundle small and code-splitting each registration automatically. The SDK wraps the dynamic `import()` with `React.lazy` + `Suspense` for you.

   ```ts
   import { registerComponent } from "@contentstack/studio-react";

   registerComponent({
     type: "site-hero",                                    // componentType — unique UID
     displayName: "Hero",                                  // componentName — palette label
     component: () =>                                      // ← LAZY: arity-0 thunk that returns a dynamic import
       import("./components/Hero").then(m => ({ default: m.Hero })),
     props: {
       headline:    { type: "string",   displayName: "Headline",    defaultValue: "Welcome" },
       description: { type: "string",   displayName: "Description", defaultValue: "Lorem ipsum" },
       imageUrl:    { type: "imageurl", displayName: "Image",       defaultValue: "https://…" },
       ctaHref:     { type: "href",     displayName: "CTA Link",    defaultValue: "/get-started" },
       layout:      { type: "choice",   displayName: "Layout",      defaultValue: ["centered"], options: ["centered", "split"] },
     },
   });
   ```

   If the component is the **default** export: `component: () => import("./components/Hero")` is enough. An explicit form `registerLazyComponent(config, loader)` exists with identical runtime behaviour.

   **5a. Exposing extensible regions with `slot` props.** To let template authors drop content into a region of the component (a card body, a sidebar, a CTA area), declare a `slot`-typed prop. The component renders the prop wherever the extensible region should appear. Studio surfaces it as a drop target for any component or Section.

   ```ts
   import { registerComponent } from "@contentstack/studio-react";

   registerComponent({
     type: "site-card",
     displayName: "Card",
     component: () => import("./components/Card"),
     props: {
       title: { type: "string", displayName: "Title", defaultValue: "Card title" },
       body:  { type: "slot",   displayName: "Body" },   // ← extensible region, no defaultValue
     },
   });
   ```

   The React component receives the slot as a prop (or via `children`, depending on what its TypeScript interface declares) and renders it inside its tree:

   ```tsx
   function Card({ title, body }: { title: string; body: React.ReactNode }) {
     return <div className="card"><h3>{title}</h3>{body}</div>;
   }
   ```

   At template-authoring time, the slot region shows as a dashed drop target. Authors drop a component or Section into it (see `use-section-slot` § component-slot-prop placement for the canonical filling pattern). Slots take ANY component or Section. There is no type constraint. Slot fills are stored per-template, so the same Card can carry different filled content on different templates.

   For a richer pattern (slot count driven by another prop, slot template factories), see `docs/20-bring-your-own-components/component-schema-prop-types.md` § slot.

   **5b. The two valid `component:` shapes**, decided by arity:

   | Shape | `component:` value | When |
   |---|---|---|
   | **Lazy (default)** | arity-0 function returning a `Promise` (dynamic `import()`) | Every BYOC registration unless tiny+hot. |
   | **Eager** | function with ≥1 parameter (ordinary React component) | Tiny components on hot paths. |

   ```ts
   component: () => import("./components/Hero")          // ✅ LAZY
   component: Hero                                       // ✅ EAGER — function Hero(props) {…}
   component: (props) => createElement(Hero, props)      // ✅ EAGER — wrap arity-0
   ```

   **Arity-0 trap.** A parameter-less function that does NOT return a Promise (e.g. `function Header() {…}`) is treated as a lazy loader, called outside render, and throws React #321 "Invalid hook call". Rule: **return a `Promise` (lazy), OR give it a `props` parameter (eager).**

7. **Confirm Studio palette shows the new tile.** Open the canvas, switch the palette accordion to **Registered Components**, find `Hero`. **The tile must show the thumbnail image**. A text placeholder means `thumbnailUrl` is missing or the data URI is malformed. A broken-image icon means you used an external URL and the iframe blocked it. The tile preview itself renders from the `defaultValue`s. If that area is blank, a prop is missing a default or the prop type was wrong.

## Inputs needed from the user

1. `componentPath`: file path to read.
2. `componentName`: display label.
3. `componentType`: unique kebab-case UID (reject duplicates. Check the registration file before writing).

Do NOT invent component paths. If the user just says "register my Hero" without a path, ask which file.

## Array & object props: binding rules

`array` and `object` **do** bind to CMS fields, but under specific conditions that are easy to miss. Registering a `type: "array"` prop and expecting the picker to bind it to any Reference field will silently degrade to a manual-entry sub-field in cases the SDK doesn't cover. Two paths:

**Bindable: `type: "array"` bound to a multi-value field.** The SDK reads the bound array directly, the array arrives at the component populated, and the component renders items with its own `.map()`. No Repeater, no Condition Block. Valid sources:

- **Reference multi (or single)**: needs `data_sources.resolvedReferences` on the composition so CDA returns `?include[]=<field>`. Otherwise the array arrives as `{ uid }` stubs. This is the case that catches migrators. It's easy to bind and see stub UIDs render, missing the resolvedReferences step.
- **Group multi (`multiple: true` on a Group field)**: the group values are stored on the entry itself. No resolution needed. Array arrives populated as-is.
- **Modular Block**: the block payload is on the entry. No resolution needed. Note that Modular Blocks are polymorphic (each item can be a different block type). If your `.map()` renders every item the same, the array-prop path works. If it needs per-block-type rendering, use a Repeater + Condition Block instead (see below).
- **Scalar multi-values**: a `multiple: true` single-line-text field arrives as an array of strings. No resolution needed.

Common requirements across all four:

- The prop is `type: "array"` on the registration.
- The wrapper's per-item render works against the shape delivered by the CMS for that field type.
- The list is single-shape (no per-iteration variant authoring or template-author swap).

This is the **preferred path** for wrapping an existing production component whose interface already takes an array of items. See `build-repeating-section` § When to skip the Repeater entirely: the array-prop alternative.

**Layout fidelity (not just data shape) decides Repeater vs array-prop.** A Repeater renders items **uniformly in sequence**. It cannot reproduce a bespoke or asymmetric layout (a bento mosaic, a 1-big-plus-3-small grid, a carousel). When the design is fixed and non-uniform, or you simply want the production component's own layout verbatim, bind the whole array/object to the real component (`array` / `object`) and let its own markup + CSS run. The render is pixel-identical to the live site. Reach for a Repeater only when the layout genuinely IS a uniform list, or when items are polymorphic and need per-type rendering (Repeater + Condition Block).

**Bindable: `type: "object"` bound to a matching entry Group / Global Field.** Same idea for a single-entry-object shape (a nested `cta: { label, href }` binding into an entry Group with matching sub-fields). Groups live on the entry, no `resolvedReferences` step.

**When array/object won't fit: reach for the Repeater or the adapter pattern.** If the list iterates a **Modular Block** (polymorphic, each item can be a different block type), template authors need to **swap a different child Section per template instance**, or the production leaf's shape doesn't reduce cleanly to array-item scalars, use one of:

- **`build-repeating-section`**: greenfield parent+child+Repeater pattern with a Section Slot for template-author swaps.
- **`adapt-collection-component`**: compatibility-adapter pattern for wrapping a legacy production component whose leaf can't be simplified.

Both surface author variability the array-prop path can't. Choose by the constraints above, not by default.

The narrow non-CMS use for `type: "array"` / `type: "object"` remains: authoring-time-only configuration where a marketer should type values in by hand (e.g. a "tags" prop not stored in CMS).

**Before you register a whole-array/object component (a `Card Grid` / `Article Grid` that `.map()`s internally), confirm a matching multi-valued field exists on the CT it will bind against.** A single array prop collapses the entire list to **one binding point**. Studio never exposes the per-item fields, so binding correctness rests entirely on that one array field resolving. If the target CT has **no** multi-Reference / Modular Block / `multiple:true` Group / scalar-multi to feed it (e.g. an `Article List` page CT that holds only `Title`/`URL`/`SEO` and references its articles nowhere), the prop has nothing to bind to and the component renders its `defaultValue` array forever, placeholder cards that read as real content in Design Mode. Two correct moves:
- **The source lives in a different CT** (articles, products): add a multi-Reference on the page CT ([`migrate-ct-schema`](migrate-ct-schema.md)) or pin a query ([`pin-query-to-freeform`](pin-query-to-freeform.md)) **before** binding, or
- **Prefer atomic + Repeater**: register the leaf card's fields as atomic components and iterate with a Repeater + child Section ([`build-repeating-section`](build-repeating-section.md)), so per-item binding is visible and verifiable in Studio rather than hidden inside one array prop.

`build-section` Step 5e enforces this at bind time. Catching it at registration saves a round trip.

## Tolerant image signatures: accept `string | { url }` on every `imageurl` prop

Every `imageurl`-typed prop must accept both a plain URL string AND a Contentstack asset object with a `.url` field. Contentstack stores assets as objects (`{ url, filename, uid, … }`). The picker sometimes binds the object, sometimes the `.url` sub-field, depending on the depth of the picked path.

If the component's TypeScript signature demands one shape, the other silently fails: icons "map correctly" but render invisible, or the object gets `.toString()`'d and the URL area shows `[object Object]`. Both bugs ship to production without a warning.

Contract for every `imageurl` prop:

```tsx
type ImageProp = string | { url?: string } | null | undefined;

function coerce(img: ImageProp): string | undefined {
  if (!img) return undefined;
  return typeof img === "string" ? img : img.url;
}
```

Every registered component's `imageurl` prop declares its TS type as `string | { url?: string } | null | undefined`, and the component internally calls a coerce helper (or optional-chains `img?.url ?? img`). This is a first-class contract, peer of the null-safety and `$`-twin contracts, not a pitfall row.

Rationale: Studio's picker doesn't ship type-aware binding coercion today (Part 1 #2 in the product improvements backlog). Until it does, the component compensates.

## Tolerant link signatures: bind the leaves, not the whole link object

Contentstack's `link` field is a two-property object: `{ title: string; href: string }`. Studio's picker binds each leaf separately. A component with an `href`-typed prop expects a URL string, not the whole link object. Binding the object silently ships `[object Object]` into the DOM.

Contract for every navigable component:

- **`href`-typed prop**: TS type: `string | null | undefined`. Never accept `{ href: string }`. Bind against `linkField → href`.
- **Label**: separate `string` prop bound against `linkField → title`.
- **A single object prop for the whole link is an anti-pattern.** If the design conceptually has one "link" object, still register the leaves as separate props (`ctaLabel: string`, `ctaHref: href`) and let the picker bind each. Two clicks in the picker, zero mystery renders.

If you can't split (a shared design-system component takes `link: {title, href}`), coerce inside:

```tsx
type LinkProp = string | { title?: string; href?: string } | null | undefined;

function href(link: LinkProp): string | undefined {
  if (!link) return undefined;
  return typeof link === "string" ? link : link.href;
}
function label(link: LinkProp, fallback: string): string {
  if (!link || typeof link === "string") return fallback;
  return link.title ?? fallback;
}
```

Same shape as the image tolerance contract above.

## `{{entry.title}}` and other unresolved placeholders: Studio only resolves `{{entry.url}}` in Connected template URL patterns

Studio's Template URL Pattern field supports one placeholder: **`{{entry.url}}`**. It resolves to the CT's `url` field at render time. Every other pattern (`{{entry.title}}`, `{{entry.slug}}`, `{{author.name}}`) is left **literal in the response**. The SDK does not template-expand them.

Where this bites:

- Composition **canonical URL** field with `{{entry.title}}` renders literally in the `<link rel="canonical">` tag. Google indexes the literal string. SEO ranking dies silently.
- Template preview iframe URL with a non-`{{entry.url}}` placeholder never resolves. Iframe stays on the placeholder URL.
- OG image / social preview URLs with placeholders produce broken share cards.

The only supported form:

```
URL Pattern: /blog/{{entry.url}}      ✓ resolves to entry.url
URL Pattern: {{entry.url}}            ✓ resolves to entry.url (route inherits from CT)
URL Pattern: /blog/{{entry.title}}    ✗ ships literal "{{entry.title}}" — SEO break
URL Pattern: /author/{{author.name}}  ✗ same
```

If you need a title-based slug, populate the CT's `url` field with the slug at entry time (Contentstack workflows / hook / manual), do not template-expand at render time.

## Layout contract: registered components must be layout-agnostic

A registered component is dropped by template authors into Sections, Section Slots, Repeaters, and other contexts the component author never anticipated. The component must render correctly across those contexts without depending on a specific ancestor.

The rule, from standard CSS architecture (BEM, Every Layout, Atomic Design, separation of concerns between layout and content):

- **The component renders at `width: 100%` of whatever container it's placed in.** It fills its cell. It doesn't decide how big its cell should be.
- **The component does NOT hard-code a `max-width` to "protect itself"** from being placed in a too-wide container. Hard-coded sizes spread layout decisions into content components and break reuse (a card capped at 300px looks fine in a 4-up grid, ridiculous in a single-product hero, crammed in a 6-up grid).
- **Container queries** (CSS `@container`) are the right tool for size-dependent internal layout inside the component. They let the component adapt to its container without knowing the ancestor.
- **Layout responsibility lives in the parent Section**, not in the component. The Section that owns the Slot / Repeater provides the layout container (grid tracks, flex with `gap` + `flex-basis`, or a `max-width`-constrained Box). The component fills the cell that container defines.

If you find yourself adding `.fs-grid > .fs-card { ... }` overrides to make a card behave inside a grid, the coupling is backwards. The card knows about the grid. Decouple: card stays `width: 100%`, grid (in the parent Section) provides the track.

## Null-safe rendering contract

Bindings resolve at runtime, and may resolve to `undefined`, `null`, an empty string, an empty array, or a placeholder value. Every registered component MUST render without throwing under those inputs.

The SDK's resolution chain: `boundValue ?? staticValue ?? defaultValue ?? placeholder`. If you set `defaultValue` on every prop, MOST cases resolve to a real value, but four paths still surface `undefined`/`null`/empty to your component:

1. **No `defaultValue` and no binding**: picker emits an unbound prop, no static value, no default, so the resolved value is `undefined`.
2. **Binding to a deep optional path**: e.g. `featured_image.0.url` when `featured_image` is an empty array (multi-file field with no upload yet), which resolves to `undefined`.
3. **Binding to an optional reference**: entry exists but the reference field is empty, which resolves to `undefined`.
4. **Empty-string field**: Contentstack stores `""` for cleared text fields. Truthy checks (`if (props.title)`) treat it as missing but JSX renders nothing, safe but easy to confuse with a render bug.

The component contract:

```tsx
// ❌ Throws when featured_image.0 is undefined
export function Card({ image }) {
  return <img src={image.url} alt={image.alt} />;
}

// ✅ Optional-chains and short-circuits cleanly
export function Card({ image, title }) {
  if (!image?.url) return null;            // render nothing when essential prop missing
  return (
    <article>
      <img src={image.url} alt={image.alt ?? ""} />
      {title && <h3>{title}</h3>}
    </article>
  );
}
```

Rules:

- **Optional-chain every nested access**: `props.image?.url`, `props.cta?.[0]?.href`.
- **Nullish-coalesce non-binding renders**: `alt={image.alt ?? ""}`, `count={items?.length ?? 0}`.
- **Decide what "missing" means**: render `null`, render a skeleton, or render a labelled empty state. **Never crash.** Compositions get authored against half-filled entries during preview. One throw kills the whole canvas.
- **Don't rely on `defaultValue` alone.** It's a safety net for unbound props, not for empty entry data.

## CSLP tags: the `$` props that make bound values editable

Also searchable as: `data-cslp`, `Cslptag`, `$title` / `$image`, `$`-twin, click-to-edit, inline editing, "Visual Builder renders but won't edit".

Full reference: [CSLP tags: the `$` props that make bound values editable](../../docs/20-bring-your-own-components/component-schema-prop-types.md#cslp-tags-the--props-that-make-bound-values-editable).

**Silent-failure #1 in hand-written registered components:** a bindable prop is registered, the component renders the value fine, and **click-to-edit never attaches**. No error, no warning. The page looks finished and authors cannot touch it.

Every bindable prop arrives **twice**: the resolved value under its own name, and the CSLP tag for the field it came from under the same name with a `$` prefix. The `$` prop holds one attribute, `data-cslp`, which is the field's address in the entry. It is the anchor Visual Builder attaches the edit affordance to. Its type is exported as `Cslptag`. You never construct one by hand.

### Two things must both be true

**1. The SDK must be told to emit the tags.** The switch is `cslp.appendTags` on `studioSdk.init`:

```ts
studioSdk.init({ stackSdk: stack, contentTypeUid: "compositions", cslp: { appendTags: true } });
```

Without it **every `$` prop is `undefined`** no matter how correctly the components are written, and no element on the page carries a tag. [`install-studio`](install-studio.md) emits this. If you are registering components into a project someone else wired, grep for `appendTags` before debugging anything else.

**2. Each `$` prop must be spread on the element that renders its value.**

```tsx
import type { Cslptag } from "@contentstack/studio-react";

interface HeroProps {
  eyebrow?: string;
  headline?: string;
  backgroundImage?: string;
  // One `$` prop per bindable prop above.
  $eyebrow?: Cslptag;
  $headline?: Cslptag;
  $backgroundImage?: Cslptag;
}

// ❌ Renders every value, and nothing is editable.
export function Hero({ eyebrow, headline, backgroundImage }: HeroProps) {
  return (
    <section style={{ backgroundImage: `url(${backgroundImage})` }}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{headline}</h1>
    </section>
  );
}

// ✅ Each `$` prop spread on the element that renders its value.
export function Hero({
  eyebrow, $eyebrow,
  headline, $headline,
  backgroundImage, $backgroundImage,
}: HeroProps) {
  return (
    <section {...$backgroundImage} style={{ backgroundImage: `url(${backgroundImage})` }}>
      {eyebrow && <p className="eyebrow" {...$eyebrow}>{eyebrow}</p>}
      <h1 {...$headline}>{headline}</h1>
    </section>
  );
}
```

The spread has to land on the element rendering the value, not on a parent. A tag on the wrapper makes the whole block one edit target instead of the field.

**Checklist for every component you register:**

- [ ] `studioSdk.init` passes `cslp: { appendTags: true }`.
- [ ] For each bindable prop that renders **visible text or an image**: `$prop` is declared on the props interface as `Cslptag` and destructured.
- [ ] For each `$prop`: `{...$prop}` is spread on the DOM element that renders that prop's content, not on an ancestor.
- [ ] Slot-typed props (`type: "slot"`) hold child nodes, not values, and have no `$` prop.
- [ ] Non-visible props (analytics IDs, aria labels not tied to visible text) don't strictly need one, but adding it costs nothing.

**Verify from the rendered page, not from the source.** `curl -s <url> | grep -c 'data-cslp'`, or DevTools on the composition. Zero tags means `appendTags`. Some fields tagged and others not means those others aren't spreading their `$` prop. A tag reads `<ct_uid>.<entry_uid>.<locale>.<field_path>`, so you can confirm it points at the field you meant.

## The `studioAttributes` contract: the node's own CSLP tag and identity

The `$` props above (also called `$`-twins) cover **fields**. There is a second, separate attribute bag covering the **node**, and missing it is silent in the same way.

For every registered component the renderer passes `studioAttributes`: the node's `data-cslp` plus the `data-composable-studio-*` identifiers Studio uses to locate the node on the canvas. Spread it on the component's **root** element:

```tsx
// ✅ The pattern every built-in SDK component uses (41 of them do this).
export function Number(props: NumberProps) {
  const { studioAttributes, number, $number, ...rest } = props;
  return (
    <p {...rest} {...studioAttributes} {...$number}>
      {number}
    </p>
  );
}
```

Both bags, one component, different jobs:

| Bag | Scope | Spread on | Enables |
| --- | --- | --- | --- |
| `studioAttributes` | the node | the **root** element | node-level `data-cslp`, canvas hit-testing, selection |
| `$<propName>` | one field | the element rendering **that** prop | inline click-to-edit for that field |

### The two halves are one change: emit both or neither

**Every registered component takes `studioAttributes` and is registered `wrap: false`.**

Why this matters. Studio renders a registered component inside a wrapper `<div>` unless its entry says otherwise. That div sits between the styled container the component is placed in and the component's own root, so the CSS around it never reaches the component. A grid or flex parent styles the wrapper, and the component inside it goes unstyled.

Under `wrap: false` Studio hands the component the editor's selection ref and node ids as `studioAttributes` **instead of** putting them on a wrapper. So the two halves are a single change:

1. The component declares `studioAttributes` and spreads it on its root element.
2. Its register entry carries `wrap: false` at the top level, right after `component:`.

Emit both or neither. A component registered `wrap: false` that does not spread them **cannot be selected on the canvas**, worse than the div it was avoiding.

```tsx
import type { StudioAttributes } from '@contentstack/studio-react';

export interface HeroProps { title?: string }

const Hero = ({ title, studioAttributes }: HeroProps & StudioAttributes) => (
  <section className="hero" {...studioAttributes}>
    <h1>{title}</h1>
  </section>
);
```

```ts
{
  type: 'hero',
  component: Hero,
  wrap: false,
  displayName: 'Hero',
  props: { title: { type: 'string', displayName: 'Title', defaultValue: '' } }
}
```

**Where the spread goes.** On the **outermost** element, and **last** (after any `{...props}`) so it wins.

**The root must reach a real DOM node:**

- a plain HTML tag (`<section>`, `<div>`, `<article>`), always correct, prefer this.
- a forwarding component you already pass DOM attributes to (`<Link className={…}>`), acceptable.
- **never** a Fragment (`<>…</>`), and **never** a component you pass only semantic props to (`<Card title={…} />`). The ref would land nowhere.

If the design needs sibling roots, wrap them in one plain element and put the spread there.

**TypeScript.** Intersect the props type with `StudioAttributes` and import it with `import type`. It is a type-only export, and a value import breaks projects on `verbatimModuleSyntax`. A JavaScript component just destructures the name.

**Variants of the same rule:**

| Shape | How the spread is reached |
| --- | --- |
| Props not destructured | `(props: HeroProps & StudioAttributes)`, spread as `<section {...props.studioAttributes}>` |
| Component takes no props | `({ studioAttributes }: StudioAttributes)`, it still takes this one |

`studioAttributes` is **not content**. Never register it as a prop, never give it a CSLP tag, never put it in a `<Slot data={…}>`.

If a later edit rewrites a component's root, carry the spread onto the new root. Never leave the prop declared but unspread, and never leave `wrap: false` on a component that no longer spreads it.

**An existing `wrap` that is not `false`**: `wrap: true`, `wrap: 'section'`, is a deliberate choice about that component's markup. Leave it as written.

**Prerequisite: CSLP must be switched on.** `cslp: { appendTags: true }` gates **both** bags, not just the `$` props: with it absent, `studioAttributes` arrives empty too and no amount of correct spreading produces a `data-cslp`. Check this first when tags are missing everywhere at once, rather than auditing components one by one. See § Two things must both be true above, and [`install-studio`](install-studio.md).

**Retrofitting a component library?** Both halves have to line up, so count them separately, a mismatch is the bug:

```bash
grep -c  "registerComponent"  <file>              # registrations
grep -c  "wrap: false"        <file>              # halves in the registry
grep -rl "studioAttributes"   <components-dir> | wc -l   # halves in the components
```

All three should agree. `wrap: false` outnumbering the spreads is the dangerous direction. Those components are unselectable, where the ones merely missing `wrap: false` still render inside a wrapper.

A real audit of 19 atomic components found **0** spreading `studioAttributes`, so every one of them rendered without a node-level `data-cslp`, and nothing anywhere reported it.

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| Spreading `studioAttributes` but not `$prop` | The node is selectable on canvas, but no individual field is inline-editable, looks like Visual Editor "half works" | Spread both. They are different bags with different scopes |
| Spreading `{...rest}` and assuming it carries the tags | `studioAttributes` is its own named prop, not part of `rest`. Destructuring `rest` alone silently drops it | Destructure `studioAttributes` explicitly, as the built-ins do |
| Spreading `studioAttributes` on an inner element | Studio's hit-testing measures the node's root box. On an inner element, selection and drop targeting land on the wrong rectangle | Root element only |
| Component renders a fragment (`<>…</>`) | There is no root DOM node, so the ref lands nowhere and the node is unselectable | Give it one plain root element and spread there |
| `wrap: false` set, `studioAttributes` never spread | Studio put nothing on a wrapper and the component dropped it. The node cannot be selected at all, worse than the wrapper div | Emit both halves, or neither |
| Prop declared but unspread after a root rewrite | An edit replaced the root element and the spread stayed on the old one | Carry the spread onto the new root in the same edit |
| Spread placed before `{...props}` | A later spread overwrites the attributes | Spread `studioAttributes` **last**, on the outermost element |
| Spread onto a semantic-props component (`<Card title={…} />`) | It never reaches a DOM node, so there is no ref for hit-testing | Use a plain tag, or a component that forwards DOM attributes |
| `import { StudioAttributes }` as a value | It is a type-only export, breaks builds on `verbatimModuleSyntax` | `import type { StudioAttributes }` |
| Registering `studioAttributes` as a prop | It is identity, not content. A CSLP tag or `<Slot data>` entry on it corrupts the node | Never register, tag, or bind it |
| Tags missing on every component at once | Almost always `cslp.appendTags` not enabled, not a component bug | Fix the SDK config first |

**Verify in the browser** (both bags at once): open the component in Studio, inspect the rendered DOM, and confirm the component's root element carries `data-cslp` **and** each bound text/image element carries its own. A root with no tag means `studioAttributes` was dropped. A root with a tag but bare fields means the `$`-twins were.

## Acceptance

This skill succeeds only when ALL of the following are true.

- [ ] The registration file contains a `registerComponent` call for the supplied `componentType` that did not exist before this skill ran.
- [ ] **The component spreads `studioAttributes` on its root element** (or the registration sets `wrap`), verified in the DOM by a `data-cslp` on the root. Without it the node has no CSLP tag and Visual Editor cannot select it.
- [ ] **Every bindable prop that renders visible content spreads its `$`-twin** on the element rendering it, verified by a `data-cslp` on each of those elements.
- [ ] Every prop on the source component's TypeScript interface (or propTypes) appears in the `props:` object, no prop dropped silently.
- [ ] Every `type:` value is one of the 13 allowed strings (`string`, `boolean`, `number`, `choice`, `href`, `imageurl`, `datestring`, `array`, `object`, `slot`, `json_rte`, `any`, `action`), not `text`, `link`, `color`, or `image`.
- [ ] **Any callback an author should control is an `action` prop**, not a hardcoded handler. Otherwise the component's behaviour is fixed at build time. See [`wire-studio-state`](wire-studio-state.md).
- [ ] A `choice` prop's `defaultValue` shape follows `multiSelect`: **multi-select (`multiSelect: true`) must be an array** (`["centered"]`). **Single-select takes the bare value** (`"centered"`). Single-select still accepts a one-element array, but only for backward compatibility, prefer the bare value. Source: `SingleChoiceProp = PropBase<…, string | string[]>` and `MultiChoiceProp = PropBase<…, string[]>` in `studio-registry`.
- [ ] `defaultValue:` (not `default:`) is set on every prop where the source component has a default. **Exception: `slot` props never carry a `defaultValue`**, they start empty until template authors fill them.
- [ ] Choice props include an `options:` array of the allowed literal values.
- [ ] The registration file is imported once at app startup, verified by grep for the import in `main.tsx` / `_app.tsx` / `App.tsx`.
- [ ] Studio's **Registered Components** palette accordion shows the new tile with the supplied `displayName`.
- [ ] The tile preview renders (not blank) because the defaults are populated.
- [ ] `component:` follows one of the two valid shapes: **lazy** (arity-0 function that returns a `Promise` of the component, typically `() => import("./Foo")`) OR **eager** (function with at least one parameter, i.e. an ordinary React component). The default recommendation is lazy. A zero-parameter function that does NOT return a Promise triggers React #321 / "Invalid hook call" at render.
- [ ] The component is **layout-agnostic**, `width: 100%` of its container, no hard-coded `max-width` to "protect" against wrong contexts, no styles that rely on a specific ancestor selector (`.fs-grid > .fs-card { ... }`). Layout sizing is delegated to the parent Section, not baked into the component.
- [ ] **Call-site literal sweep**. If this component is already used in production code, grep every JSX use of it. Every literal prop set at a call site (`isInteractive={false}`, `variant="compact"`, `columns={3}`, `isLogoBgWhite={false}`) becomes a `defaultValue` on the corresponding registered prop, or a named preset. Skipping this is the single most common cause of "composed page looks 80% right but wrong on hover/motion/spacing." Sample grep: `rg -tn tsx -o "<ComponentName[^>]*/>" | head`. If the component is new (no production call sites yet), acceptance is trivially satisfied, but state that explicitly.
- [ ] **Tolerant image signatures**: every `imageurl` prop's TS type accepts `string | { url?: string } | null | undefined`, and the component internally coerces. See § Tolerant image signatures above. This is a first-class contract, not an optional nicety. Studio's picker binds sometimes the object, sometimes `.url`, and either shape must render correctly.
- [ ] **Tolerant link signatures**: every `href`-typed prop binds against a link field's `href` leaf (never the whole link object). Where the design mandates a single link prop, the component coerces `string | {title, href}` inside via `href()` / `label()` helpers. See § Tolerant link signatures above.
- [ ] **Palette group + thumbnail**: the registration declares `sections: ["<Brand> · Elements | Patterns | Layouts"]` (never `"Template"` or `"Section"` in the name) and a `thumbnailUrl` data URI that visually previews the tier. See [`palette-conventions`](../../docs/20-bring-your-own-components/component-palette-conventions.md).

## Common pitfalls

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| Using `default:` instead of `defaultValue:` | Studio silently ignores `default:`, palette preview renders blank | Use `defaultValue:` exactly |
| `registerComponent` without `thumbnailUrl` | Registry defaults it to `""`, so Studio renders a **text placeholder**, not a preview. No error, no warning. A twenty-component palette becomes an unbrowsable text wall and authors can't find anything | Add a `thumbnailUrl` inline-SVG data URI to every registration. Sweep the file: `registerComponent` count must equal `thumbnailUrl` count |
| `thumbnailUrl` pointing at a CDN / Contentstack asset / `/public` URL | The palette renders inside Studio's iframe. External requests hit CORS or fail silently, so the tile is blank or broken-image. Looks identical to "no thumbnail set" | Inline SVG data URI via `encodeURIComponent`. Zero network fetches. See `palette-conventions` |
| Registering components from a Server Component graph on Next App Router | Next throws "Attempted to call the default export … from the server but it's on the client", or the palette is empty because the server-side registry got populated instead of the client one | Import the registration module from the `"use client"` boundary that runs `studioSdk.init` (`app/studio-init.tsx`), never from `layout.tsx` or a server `page.tsx`. See step 5b |
| `type: "any"` on a prop bound to a Group / Global Field / block object, or to a list | The binder recursively unwraps single-key objects for every type except `object`/`array`, so a single-field block collapses to its inner value. Lookups return `undefined`, the array's indices show as `{0,1,2,3}`, and the component renders **blank with no error** | Use `object` for a group/block, `array` for a list, the only two types that skip the unwrap. Reserve `any` for genuine primitives. See § The `any` flatten trap |
| Using `text`, `link`, `color`, `image` as prop types | These don't exist. Registration is rejected at runtime | Use the 13 allowed types only |
| Hardcoding an interactive component's behaviour instead of exposing an `action` prop | Authors can drop the component but can't decide what it does. Every new behaviour needs a code change. The palette looks complete while Studio only decorates the app | Declare `type: "action"` for the callback and register the function it can call. See [`wire-studio-state`](wire-studio-state.md) |
| A design prop typed `string` instead of `choice` | A free string re-opens the drift the library exists to prevent: `color: '#6c5ce7'`, `gap: '24px'`, one value per author. `choice` with a closed `options` list means the author picks from a menu and cannot type a raw value | Type every design prop (`color`, `size`, `align`, `variant`, `gap`, `tag`) as `choice` with `options` + `defaultValue`. Reserve `string` for content |
| Copying a prop type off a built-in node into a `registerComponent` schema (e.g. `plaintext` from the built-in Header) | Built-ins use a separate prop-type vocabulary. `plaintext` isn't one of the 12 and the registration is rejected | Map to the registered-component equivalent (`plaintext` becomes `string`). Read built-in defs for structure, never for prop-type strings |
| Registering a prop that's not actually on the component | The Data Picker offers a binding that crashes at render time | Read the source. Register only props you see |
| Duplicate `type:` UID across two components | **First registration wins. Duplicates are silently skipped** (the SDK's default is idempotent so HMR / RSC-plus-client / build-worker re-evaluation doesn't break). A real bug stays hidden because the second definition never lands. | Search the registration file for the UID before writing. Pass `{ strict: true }` as the second arg to `registerComponents([...], { strict: true })` to throw on duplicates instead. |
| Forgetting to import the registration file at startup | Components never appear in the palette | Add `import "./register-components"` to `main.tsx` / `_app.tsx` |
| Registering the unwrapped primitive (e.g. `Box` from a UI lib) instead of the customer's component | Loses brand styling. Studio composes pages out of unstyled primitives | Register the customer's wrapped component (e.g. `<Hero>`), not the lib primitive |
| Inferring a `string` prop as `choice` because TS uses a union of two literals | Authors can't type freeform text into a free-form field | Use `choice` only when the union is a closed set the user MUST pick from |
| Arity-0 component (`function Header() {…}` as `component: Header`) | SDK treats as lazy loader and calls it outside render, which throws React #321 "Invalid hook call". | Use lazy shape `() => import(...)` or give it a `props` param. |
| Registering eagerly when lazy would do | Eager ships in entry bundle. Many components balloon TTI. | Default to lazy `() => import("./Foo")`. |
| Component depends on layout ancestor (e.g. `.fs-card` only sized by `.fs-grid`) | Renders full-bleed in a Slot/Repeater that doesn't provide that ancestor. | Decouple. See Layout contract above. Layout lives in parent Section. See `use-section-slot` § Layout container. |
| Setting `defaultValue` on a `slot` prop | Slots start empty until authors fill them. A static default doesn't fit the model and is silently ignored. | Omit `defaultValue` on `slot` props. The slot renders as a dashed drop target until an author drops content. |
| Naming a slot prop something the component doesn't render | The slot becomes a drop target in Studio but its contents never appear at render time because the component ignores the prop. | The prop name must match what the React component's signature uses, typically `children` (for `<Card>{...}</Card>` style), but any name works as long as the component renders `{propName}` somewhere in its JSX. |
| Trying to constrain a slot to "only accept Sections of type X" | Slots accept any registered component or Section. No built-in type filter exists. Adding a constraint isn't supported. | If you need a typed value override (one specific kind of content), use an exposed Section Prop instead. If you need a typed component constraint, surface the expectation in the slot's `displayName` ("Drop a CTA Section here") so authors self-route. |
| Component throws on `undefined` / `null` / empty-array props during canvas preview | Bindings resolve at runtime. An unfilled entry field, empty multi-file field, or unbound prop surfaces `undefined` to the component. One thrown access kills the whole canvas render. Author can't recover without re-binding. | See § Null-safe rendering contract above. Optional-chain every nested access (`props.image?.url`). Return `null` or a skeleton when essential data is missing. |
| Confusing `slot` (component prop type) with Section Slot (drop region inside a Section) | They are different mechanisms at different levels, both surface drop targets, both can hold the other. | A `slot` PROP is part of a registered component's schema. A Section Slot is a Smart Container carved into a Section. The recommended composition runs in three steps: declare a `slot` prop on the component, carve a Section Slot inside that prop via `use-section-slot` § component-slot-prop placement, then let authors fill that Section Slot at template time. |
| Design tab is empty for this component when selected in the canvas | The registration didn't declare a `styles` block. The Design tab surfaces the sections listed in `styles`, so with no `styles` the tab is empty. | Add `styles: [...]` to the registration listing the categories authors should be able to edit (`size`, `spacing`, `typography`, `background`, etc.). See [`docs/20-bring-your-own-components/component-schema-prop-types.md`](../../docs/20-bring-your-own-components/component-schema-prop-types.md) § styles. If the Design tab itself is missing (not just empty), the project's Freeform Feature is off (see [`install-studio`](install-studio.md) § After install) if the Design tab is missing / disabled. |

## After registering: plan your Section shape

Register the component first. Then decide which Section(s) to author in Studio for it.

- **Compound component that iterates internally** (say `<BlogArticle>` doing `.map(sections)`, `<CardList>` doing `.map(related_posts)`): **build top-down**. Author the wrapping Simple Section first, one Section that wraps the whole compound. Studio renders your existing page inside its canvas in ~5 minutes with no code changes. Then decompose one Section per iteration level as you need each to become author-editable.
- **Atomic component that renders one shape** (`<Card>` bound to card_ref, `<Hero>` bound to hero_group): author its Simple Section directly. Compose it later inside a List Section when a parent iteration needs to drop it as a slot's default content.

Both directions produce the same Section chain in the end. Top-down is faster for existing compound-heavy apps. Bottom-up has a cleaner mental model for greenfield.

Use [`build-section`](build-section.md) (or [`build-repeating-section`](build-repeating-section.md) for List Sections) to author each Section. The skill walks the Studio-UI flow. Full worked example with a 4-level nested schema: [From components to Studio compositions](../../docs/00-overview/standard-studio-page-anatomy.md).

## See also

- `docs/20-bring-your-own-components/register-components.md`: full reference, including `registerComponents` (batch) and `registerLazyComponent` (code-split)
- `docs/20-bring-your-own-components/component-schema-prop-types.md`: every prop type with all options
- `docs/20-bring-your-own-components/set-component-default-data.md`: separate `wire-component-default-data` skill for advanced default data
- `wire-component-default-data`: for components whose defaults aren't representable as static `defaultValue:` literals
- `use-section-slot`: fill a `slot`-typed prop on a registered component (the `component-slot-prop` placement mode), or carve a Section Slot inside one
- `wire-slot-data`: carry data the component holds into whatever an author drops into its `slot` prop
- `import-design-tokens`: register your design system after registering components
