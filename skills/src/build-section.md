---
name: build-section
---

## When to use

Author a Section composition by linking it to a structural schema (CT / Global Field / Group / Modular Block / Block / Reference) and dropping registered components.

Use when a NEW reusable Section must exist for a Template to drop. Run AFTER components are registered, before Template work. Phrases: "build a hero section", "create card grid". Do NOT use to MODIFY an existing Section. Use Studio UI. Do NOT use for one-off page composition. Use `build-connected-template`.

> **Auth preflight: settle the credential before the first API call.** Resolve it OAuth-first per [`authenticate-cma`](authenticate-cma.md): `CS_OAUTH_ACCESS_TOKEN`, else the Contentstack MCP's stored session. **Never ask the user for a session `authtoken`.** If nothing resolves, or a refresh fails with `400 invalid_refresh_token`, hand them `! CONTENTSTACK_REGION=<code> npx @contentstack/mcp --auth` (it needs a TTY and a browser, so it cannot be run for them) and wait. `403 error_code 316` is a valid credential aimed at another org: fix the org or the `api_key`, do **not** re-authenticate.

> **Pattern preflight: mandatory.** Before the first write, run [`match-existing-pattern`](match-existing-pattern.md): read the Templates and Sections already in the project, **reuse what already covers this schema**, and build to the pattern they use. Skip it only when the project has no compositions at all. Authoring something structurally foreign to what is there is rework, and it is invisible until someone opens the Layers panel.

# Build a Section

> **Approved plan required.** This skill builds. It does not decide. If there is no plan the user has explicitly approved (Sections with their linked schemas, Section Slots, per-Section components (registered vs built-in), bindings, and the template kind), **stop and run [`plan-studio-architecture`](plan-studio-architecture.md) first**, then come back with the approved block for this piece. Building without it is how a project ends up as one monolithic template with no Sections, no slots and no reuse. Exception: the user is explicitly iterating on a piece already in an approved plan.

## Context

A Section is a reusable composition that template authors drop onto pages.

**Qualification gate: before authoring, confirm this Section qualifies.** A Section pays off when **the binding work amortizes**, i.e., when the same N bindings would otherwise be repeated by the author on every template drop. Qualifies if either:

1. **The component has ≥2 separate prop bindings**: Hero with `title` + `cover.url`, Card with `image` + `title` + `summary` + `link`, ProductHighlight composed of multiple sub-components each with their own bindings. Without a Section, the author re-wires every prop on every drop.
2. **The component takes one prop bound to a structural shape**: Modular Block list, Reference array, Group, Global Field. The outer bind is 1 click, but the internal rendering walks N sub-fields per iteration. That sub-field work amortizes.

A Section does **NOT** qualify for:

- **A single atomic component bound to a single primitive (scalar) field**: `Heading` bound to `entry.title`, `Image` bound to `entry.cover.url`, `Text` bound to `entry.tagline`. One bind, one drop, no repetition cost. Studio's Connect-a-Schema picker also rejects scalar fields. Use these components inline.

**Diagnostic question:** "How many bindings will the author wire by hand on the next drop of this component?" If ≥2, make it a Section. If 1, leave it as a registered component used inline.

If the candidate fails the qualification, STOP. It's not a Section. See [`understand-sections`](understand-sections.md) § What qualifies as a Section.

Its data contract is defined by a **linked schema**, and Studio only accepts **structural shapes** here, not single scalar fields. Allowed kinds:

| Kind | What it is | Single or multiple |
|---|---|---|
| **Content Type** | The whole entry of one CT | Single: one entry at a time |
| **Global Field** | A reusable named schema (the most common section anchor) | Single OR multiple (a list of group instances) |
| **Group** | A nested object on a CT | Single OR multiple (a list of group instances) |
| **Modular Block** | A field that holds a list of blocks. Each block can be a different shape | Always multi: pair with Repeater + Condition Block |
| **Block** | A specific block type inside a Modular Block field | Single: the block shape is fixed |
| **Reference** | Points to one or more entries of one or more CTs | Single OR multi-entry: multi pairs with Repeater + Condition Block (always required, single-CT included) |

A section connecting to a multiple variant is meant to live **inside a Repeater** on the template. The Repeater iterates the list. Each iteration places one instance of the section's shape.

Studio's picker omits scalar fields (`text`, `number`, `boolean`, `file`, `link`, `date`, etc.). A section composes UI against a shape. For a single value override at template level, use **Expose Section Prop** on a component inside the section.

Bindings on registered components come from the Data Picker. The picker shows the Section's linked-schema fields by default. Inside a Repeater it switches root to the iteration item's fields. See `use-repeater` § The scope rule, in user terms. All References inside a Repeater (single-CT and multi-CT) require a Condition Block.

## Path A vs Path B: monolith Section or Section-with-Slot + child Section

When a Section iterates over a list of cards (a multi-reference field, a Modular Block list, a multi-Group, or a multi-entry pinned query), there's a recurring architectural choice:

- **Path A: one monolithic Section.** The Section owns the Repeater AND the card markup inside it. Card props bind from the Repeater Data root (the iterated item).
- **Path B: Section-with-Slot + separate child Section.** The parent Section owns the Repeater and exposes a Section Slot inside the iteration. A separate child Section (bound to the iterated item's CT) gets dropped into the Slot at template-authoring time. The child Section is pre-bound to its own linked schema, no per-prop binding needed.

**Deciding question:** "Will this card visual ever appear outside this list?" (Featured product hero, related-items strip, recommended carousel, search result row, etc.)

- **Yes, probably yes, or unsure: take Path B.** Sections exist so visuals can be reused. Splitting the card into its own Section costs one extra Section and unlocks reuse everywhere else. **Default to Path B.**
- **Genuinely no, single-use: Path A** is acceptable. Easier to collapse Path B into Path A later than to extract a Section out of a monolith. When in doubt, Path B.

In Path B, the parent's Repeater contains a Section Slot (see `use-section-slot`), filled at template time by the child Section, never a raw component (see `understand-section-slots`). Auto-binding wires it because the child Section's linked schema matches the iterated item.

## Layout lives in the Section

A Section that exposes a Slot must wrap it in a sized layout container. See `use-section-slot` § Layout container and `register-component` § Layout contract.

Reference: `docs/32-sections/overview.md`, `docs/32-sections/link-content-types-with-linked-schema.md`, `docs/20-bring-your-own-components/register-components.md`, `docs/34-smart-containers/create-repeatable-content-with-repeaters.md`.

## How a Section gets its data: the `selectedField` model

A Section has **no data of its own**. When it's dropped on a template, the SDK hands it a scoped slice of the page entry via `getScopedData(pageEntry, selectedField)`:

- **`selectedField` set** to a field uid: the section's `template` becomes that field's value (references and groups resolved along the path).
- **`selectedField` unset**: the section's `template` becomes the **whole page entry**.

The section's own canvas therefore always shows **one empty placeholder** (no page context exists standalone). That's not a bug: the section only fills out at template-render time. Verify via SSR cold-load: `await sdk.fetchCompositionData({ url })` on the parent template's URL and dump `spec.data.section_scoped_data[<instance-uid>]`.

### Decision rule: set `selectedField` or leave it unset

| Section shape | Rule | Where its bindings resolve against |
|---|---|---|
| **One Repeater over one field** (Card Grid over `related_posts`, feature list over `features[]`) | Set `selectedField=<that field>` + use scope-root repeater binding `{ path: {} }` inside | `template` becomes the field's array value directly |
| **Multiple fields on the page entry** (Header reading `brand` + `nav_links` + `signin_label`, Hero reading a `hero` group) | **Leave `selectedField` unset**: the section needs the whole entry | `template` is the full page entry. Keep original `template.<field>` binding paths |

Setting `selectedField` on a multi-field section loses access to everything outside the scoped path. Bindings to those fields resolve to `undefined`.

Full mechanism, wire shapes, and the reference-iteration `data_sources.resolvedReferences` handling: `author-composition-via-api` § Authoring a Section composition (scoping rules and § Decision rule) single-field repeater section vs whole-entry section.

## Basic field components vs custom registered components: the simple-vs-styled tradeoff

Studio palettes ship two kinds of nodes you can drop into a Section. **All editing happens in the right panel. Neither kind supports inline-typing in the canvas.** The real tradeoff is shape and styling:

| | **Basic field components** (palette: Basic): `Heading`, `Paragraph`, `Text`, `Image`, `Link`, `RichText`, etc. | **Custom registered components** (palette: Registered Components): your `<Hero>`, `<ProductCard>`, etc. |
|---|---|---|
| Shape | Single value (a string for `Heading` / `Paragraph` / `Text`, a URL for `Image`, a JSON tree for `RichText`). The author sets it via the right panel: either as a **static value** typed inline, or as a **binding** to a CT field. | N props as declared in `registerComponent` schema. Each prop set via the right panel: static value or binding to a CT field. |
| Visual styling | Plain HTML by default: `<h1>`, `<p>`, `<img>`. Styling comes from node `styles.default.responsiveStyles.default` set via the Design panel, OR app-side CSS targeting the rendered DOM. RTE embeds use the default serializer unless you register a custom one (see `register-json-rte`). | Whatever your React + CSS produces. Pixel-perfect. Uses your design system. |
| Layout authoring | Composable via Basic `Box` + node `responsiveStyles` (see pitfall row below). | Owned by the React component code. |
| Authoring UX | Quick: drop, type a value or bind a field in the right panel, done. Good for editorial copy that lives ONLY in the composition (not modelled in the CMS). | Higher-fidelity: drop a fully-styled block, bind props to CT fields. Right-panel surface is exactly the prop schema you registered. |
| Best for | Headlines, body copy, captions, CTA labels, RTE blocks, wherever literal copy can live in the composition itself OR map 1:1 to a CT field with no surrounding shell. | Marquee / styled / interactive sections: hero, carousel, 3D viewer, anything pixel-sensitive or with multi-field internal structure. |

**These are two render paths.** The local standalone page (custom `Hero`) and the Studio composition (Basic `Heading` + `Paragraph`) will NOT look identical by default. Treat the gap as design work, not a bug.

**Recommended pattern: hybrid.** Use both inside one Section:

- **Custom registered components** for the styled / interactive shells: the hero with its background, the carousel with its animations.
- **Basic field components** for editorial copy that doesn't need a custom shell (headline, intro paragraph, footnote) or for repeated content blocks where authors should be able to swap copy quickly via the right panel without engineering ever touching the codebase.
- **Match the Basic-component styling to your brand** by setting node `responsiveStyles` via the Design panel (typography, spacing, color), or write CSS that targets the rendered semantic DOM. For RTE, register a custom renderer (`register-json-rte`).

Decision rule:

- Is THIS region a single string / scalar value that maps 1:1 to a CT field (or is composition-local copy)? Use a Basic field component.
- Is THIS region a multi-prop / styled / interactive piece? Use a custom registered component.
- Both, in the same Section, is normal and good.

### Migrating an existing component: register it whole, or decompose it?

When a Section is being built from JSX that already exists, there's a prior question the rule above doesn't answer: does the whole `<Hero>` become **one registered component**, or does it get **decomposed into built-ins** (`Box` + `Image` + `Heading` + `Paragraph` + `Link`) that reproduce the same markup?

A Section made of one registered component is a **black box to authors**: they can re-bind its props and nothing else. No restyling, no reordering its internals, no removing the subtitle. That's often the right trade, but it must be a stated choice, not a default that happens because registering was easier.

| Signal | Verdict |
|---|---|
| Interactive: local state, event handlers, cookies, personalization, modals, carousel logic | **Must be one registered component.** Studio built-ins can't express behaviour. Not a judgement call |
| Pixel-sensitive: bespoke CSS, animations, `::before` layering, container queries | **One registered component.** Decomposing means rebuilding the styling from Design-panel values, and 1:1 fidelity is unlikely |
| Static presentational: image + heading + body + link in a layout | **Decompose into built-ins.** Authors get full in-Studio editing: restyle, reorder, delete, add. This is the case that most often gets black-boxed by mistake |
| Styled shell wrapping editable content | **Hybrid**: register the shell with a `slot` prop, fill the slot with built-ins. Best of both. See `register-component` § slot prop |

**Surface the choice. Don't just pick.** For any Section that isn't forced by the first two rows, tell the user which way you're going and what it costs them:

> `Hero` is static presentational. I can either register it as one component (exact markup, authors can only re-bind props) or decompose it into Studio built-ins (authors can restyle and restructure in Studio, but I rebuild the styling and exact markup fidelity isn't guaranteed). Defaulting to **decompose** for author editability. Say the word if you want 1:1 fidelity instead.

Silence is not agreement. If the plan is to black-box a static component, that line goes in the plan explicitly with its cost.

**Binding fields is a separate axis, and it is never optional.** A registered-component Section still binds real CT fields to its props (`image.url`, `headline`, `body`). Black-box refers to author editability of structure, not to whether data is wired. Likewise a **Section Slot** is a third, unrelated concept, a swap point where a template author drops a different Section per instance. Add one only when a region genuinely needs per-instance swapping. A fixed hero doesn't. See [`understand-section-slots`](understand-section-slots.md).

## Prerequisite: the canvas chain must be wired

Section authoring requires the full canvas chain: a route mounting `<StudioCanvas />`, the project's **Canvas URL** pointing at it, and (most often missing) a **non-empty per-locale Base URL on the environment the project targets**. Missing any link = blank or Playground canvas with no explanation. If you can't confirm all three, run [`setup-section-preview`](setup-section-preview.md) first.

## Task

1. **Open Studio, then the Sections tab, then + New Section.** Confirm you are in section authoring mode (the palette shows the **Registered Components** category and **Smart Containers** category, both are section-mode signals).

2. **Name the section** using the supplied `sectionName`. The display name is what template authors see in the Sections palette.

3. **Connect A Schema.** The Schema panel offers structural shapes only, no scalar fields. Pick the kind matching `linkedSchemaKind`:
   - `content-type`: pick the connected CT
   - `global-field`: pick the Global Field UID
   - `group`: pick the group field on the parent CT
   - `modular-block`: pick the Modular Block field. The section sees the union of allowed block types
   - `block`: pick a specific block type inside a Modular Block. The section sees just that block's fields
   - `reference`: pick the Reference field. The section sees the union of `reference_to` CTs

   If the user asks to "link to the title field" or similar, redirect: that's not how sections work. Either pick the parent group / object / CT, or use **Expose Section Prop** at the component level later. If `linkedSchemaUid` is blank, warn explicitly: the section is static-only, no auto-binding, every value typed by hand at template-drop time.

   When the picked schema is a multiple variant (`isMultiple=y`), note it in the section's intent: this section is meant to be dropped inside a Repeater on a template. The Repeater iterates the list. Each iteration places the section once.

4. **Scan the linked CT for Slot candidates BEFORE binding fields directly.** Inspect the CT for any **Global Field**, **Modular Block**, **Group**, or **Reference** fields. For each one, decide:
   - **Expose it as a Section Slot** (the preferred default) when the nested data is composable, shared across pages, or likely to have variants. Carve a Slot at that location via `use-section-slot` instead of binding the nested shape inline. Doing so keeps the nested shape replaceable with any compatible Section per template instance.
   - **Bind it inline** only when the shape is genuinely one-off, small, and unlikely to be reused. This is the rarer case.

   Default for Global Field / Modular Block / Group / Reference fields: **expose a Slot**. Inlining throws away the reusability of the nested structure. If unsure, expose a Slot. It can always be filled with a single fixed child Section.

   See `understand-section-slots` § When to expose one: the Global Field / Modular Block / Group / Reference heuristic for the full rationale (Global Fields are the strongest Slot candidate of the four).

5. **Drop registered components.** For each entry in `initialComponents`:
   a. Open the palette and switch to the **Registered Components** category. Do not drop Studio default components: they bypass the project's brand system.
   b. Drag the component onto the section canvas. Use the canvas drop indicators to confirm placement inside the intended container.
   c. Select the dropped node and bind each prop via the Data Picker. The picker shows the Section's linked-schema fields by default. If the dropped node sits inside a Repeater, the picker switches root to the **iteration item's** fields automatically (labelled "Repeater Data"). Bind from whichever root the picker is showing. Add a Condition Block around any Reference or Modular Block iteration.

   d. **Field-existence gate: before binding ANY prop, confirm the target field is actually in the Data Picker.** The picker lists exactly the fields the linked schema (or iteration-item scope) exposes. If the field you intend to bind is **not in the list, STOP**: do not force a bind, do not invent a path, do not accept a stale binding that shows a field name the picker no longer offers. A bind that references a non-existent field resolves to `undefined` at runtime, and the component silently falls back to its registration `defaultValue`, which reads on the canvas as "real data that's actually placeholder." When the field is missing, the linked schema is wrong (see the collection-source gate below) or the CT needs a schema change first via [`migrate-ct-schema`](migrate-ct-schema.md). Report the mismatch and stop. Never paper over it with a bind that can't resolve.

   e. **Collection-source gate: a component prop that takes a whole array/object needs a matching multi-valued SOURCE on the linked schema.** If a registered component exposes ONE prop shaped as an array or object (a `Card Grid` / `Article Grid` / list wrapper that `.map()`s internally, the native array-prop pattern, see [`build-repeating-section`](build-repeating-section.md)), the linked schema **must** have a multi-valued field to feed it: a **multi-Reference**, **Modular Block list**, **Group with `multiple:true`**, or a **Pinned Query** (Freeform). Verify that field is in the Data Picker **before** binding. If the linked schema has **no such field** (e.g. an `Article List` CT with only `Title`/`URL`/`Description`/`SEO` and no `articles` reference), then there is nothing to bind the collection prop to, and the component renders its default array forever. **STOP and pick a fix, do not bind:**
      - Add the missing multi-valued field to the CT ([`migrate-ct-schema`](migrate-ct-schema.md)), the usual fix when the list lives in a separate CT (articles, products) that the page CT should reference, **or**
      - Source it dynamically via a Pinned Query on a Freeform template ([`pin-query-to-freeform`](pin-query-to-freeform.md)), **or**
      - **Decompose to atomic** instead of one whole-array component. Use a Repeater over the multi-valued field + a child Section bound to the iterated item's CT, with atomic components (Heading / Image / Text) each bound per-item. This surfaces per-field binding in Studio rather than hiding it inside the component. See [`build-repeating-section`](build-repeating-section.md) and [`use-repeater`](use-repeater.md).

   f. **Verify the bind resolved to REAL data, not the component's default.** After binding, toggle **Preview Mode** (select the node or Repeater, then Configuration, then Preview Mode) and confirm the canvas shows values from the **preview entry**, not the registration `defaultValue`. Tell them apart: default data is the generic placeholder baked into `registerComponent` (`"ARTICLE ONE"`, `"A short teaser…"`, a grey image icon). Real data is the seeded entry's actual field values. If Preview Mode still shows the defaults, the bind did **not** resolve. Re-run gates (d) and (e). Design Mode showing defaults is expected. **Preview Mode** showing defaults means the binding is broken.

6. **Optional smart containers.**
   - For a section whose linked schema IS the multiple variant, you usually drop a Repeater bound to `template.items[]` (or whatever the array path is) and place sub-components inside it.
   - Carve a **Section Slot** (see `use-section-slot`) if you want template authors to drop arbitrary components into a named region.
   - **Expose Section Props** (see `expose-section-props`) for value-level overrides, toggling a flag or swapping a label per template instance.

7. **Save.** Studio surfaces the **Expose Props** modal on Save. Toggle which component props template authors should be able to override per page. If you skip this step the section is locked: template authors can drop it but cannot change any value.

## Inputs needed from the user

In this order. Stop and ask if any is missing. DO NOT guess a `linkedSchemaUid` or invent component types.

1. `sectionName`: display name (reject empty or generic "Section 1", ask again).
2. `linkedSchemaKind`: one of `content-type / global-field / group / modular-block / block / reference`. If the user says "field name X", redirect: ask for the enclosing structural shape.
3. `linkedSchemaUid`: UID of the structural shape. Allow skip with an explicit static-only warning.
4. `isMultiple`: y/n. Affects whether the section is intended to live inside a Repeater on the template.
5. `initialComponents`: comma-separated list of registered component types. Reject any type not currently registered in the project.

## Acceptance

This skill succeeds only when ALL of the following are true. If any fails, do not claim success. Surface the failure and stop.

- [ ] The new Section appears in the Studio Sections tab with the supplied `sectionName`.
- [ ] **The Section is published to the environment the Studio project targets**, and re-published after every later edit to its tree. An edit creates an unpublished version on a published composition, so delivery keeps serving the old shape while the CMA and the canvas both look correct. Row 7 of [`complete-the-build`](complete-the-build.md).
- [ ] **The section's atoms are inline-editable in the DOM**: the component root carries `data-cslp` (`studioAttributes` spread, with `wrap: false` in its register entry) and each bound text/image element carries its own `$`-twin tag. Verified by inspecting the rendered DOM, not assumed. Without it the section renders correctly and is invisible to Visual Editor. See [`complete-the-build`](complete-the-build.md).
- [ ] **The Sections accordion shows a thumbnail for it, not a blank tile. Mandatory, not cosmetic.** A section with an empty `ui_preview` is an unfinished section. Do not report it as created. If the thumbnail can't be set yet, say "created, thumbnail pending" and then finish it. Studio screenshots the canvas and uploads it to the composition's `ui_preview` field **on save**, so pressing Save in the editor is what produces the thumbnail. A blank tile means the section was created by API (that chain is editor-only) or the save's fire-and-forget upload failed. Fix: re-open the section and Save, or set `ui_preview` explicitly ([`author-composition-via-api` § Section thumbnails](author-composition-via-api.md#section-thumbnails-ui-preview)).
- [ ] If `linkedSchemaUid` was supplied, the section's Schema panel shows that UID under the correct structural kind (and **not** under any individual field).
- [ ] If the user asked to link to a scalar field, the request was redirected to the enclosing shape (or to Expose Section Prop). Single-field linking was NOT attempted.
- [ ] When `isMultiple=y`, the section's intent is documented for template authors: "drop inside a Repeater".
- [ ] Every component listed in `initialComponents` exists on the section canvas and was dropped from the **Registered Components** palette category (not the Studio defaults).
- [ ] Each bound prop on those components resolves under the right Data Picker root: the Section's linked-schema root for props outside any Repeater, and the **Repeater Data** root (iteration item) for props inside a Repeater. A Condition Block wraps any Reference or Modular Block iteration.
- [ ] **Every bound field exists in the Data Picker** (Step 5d). No prop is bound to a field the picker doesn't offer. No stale binding to a removed field was left in place.
- [ ] **Every collection-shaped prop (array/object) is backed by a real multi-valued source** on the linked schema: a multi-Reference, Modular Block list, `multiple:true` Group, or Pinned Query (Step 5e). If no such source exists, the Section was NOT saved with a dangling collection bind. The schema was fixed, a query pinned, or the component decomposed to atomic + Repeater.
- [ ] **Preview Mode shows real entry data, not registration defaults** (Step 5f). Placeholder text baked into `registerComponent` (`"ARTICLE ONE"`, generic teaser copy, grey image icons) is NOT being mistaken for a working bind.
- [ ] On Save, the **Expose Props** modal was acknowledged: either props were exposed or the locked state was a deliberate choice.
- [ ] Dropping the saved section onto a template that has a field of the linked schema's shape auto-binds with no manual picker steps.
- [ ] **Migration builds only**: if this Section is replacing an existing production Section on a live route, run `verify-visual-parity` against the production URL at all target viewports before declaring success. Structural checkpoints (component present, prop bound) are necessary but not sufficient. Pixel drift ships silently otherwise. Skip this line for greenfield Sections that have no production counterpart to compare.

## Common pitfalls

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| Trying to link the section to a scalar field (`title`, `description`, `image`) | Studio's picker doesn't offer scalar fields: a section composes UI against a shape, not a value | Pick the parent Group / Global Field / CT / Block. Expose individual props later via Expose Section Prop |
| Linking to a multi-variant schema without dropping a Repeater | Section composes against the whole list as one shape. Renders only the first item or fails to bind | When `isMultiple=y`, drop a Repeater bound to the array path and place components inside it |
| Picking Modular Block instead of a specific Block type | Bindings are typed against the union of block shapes: most fields don't resolve | If the section is for one block type, pick `block` and select that specific block. If the section handles many, use Repeater + Condition Block per block type |
| Skipping Connect A Schema | Section is static-only. Won't auto-bind on templates. Authors wire every value by hand | Pick a structural schema. Only skip when you know the section is purely presentational |
| **Binding a prop to a field that isn't in the Data Picker** (forcing a path, keeping a stale binding to a removed field) | The bind resolves to `undefined` at runtime, so the component falls back to its registration `defaultValue`. The canvas shows plausible-looking placeholder content, so the break is invisible until production renders empty. | Field-existence gate (Step 5d): only bind fields the picker offers. When the field is missing, fix the linked schema or the CT (`migrate-ct-schema`). Never force the bind. |
| **A whole-array/object component prop with no multi-valued field on the CT** (e.g. `Article Grid` bound to `articles` on a CT that has no `articles` reference) | Nothing to bind the collection to, so the component renders its default array forever (`ARTICLE ONE / TWO / THREE`). Looks like it "works" in Design Mode. | Collection-source gate (Step 5e): add the multi-Reference / Modular Block / multiple Group, or pin a query, or decompose to Repeater + atomic child Section (`build-repeating-section`). |
| **Reading Design-Mode placeholder as real bound data** | Design Mode renders `registerComponent` defaults. A broken bind and a working bind look identical there. Ship it and production is empty. | Always verify in **Preview Mode** (Step 5f). If Preview still shows the generic defaults, the bind didn't resolve. Re-check field existence + source. |
| Dropping Studio default components instead of Registered Components | No brand consistency. Section ignores the project's component library | Switch palette category to **Registered Components** before dragging |
| Skipping the Expose Props step on Save | Template authors get a locked section, no value overrides possible | Toggle the props that should be overridable in the Expose Props modal |
| Assuming the Section is broken because the canvas shows defaults, not CMS values | Design Mode renders registration defaults. Preview Mode renders real bindings. See `use-repeater` for the two-mode model. | Toggle Preview Mode in Properties, then Configuration. |
| Binding inside a Repeater without a Condition Block on references / modular blocks | Iteration items are polymorphic. Bindings silently fail | Wrap with Condition Block (single-CT references included) |
| Picking from the Section's linked-schema root for a prop that sits inside a Repeater | Wrong scope: every iteration shows the same value (the parent's field), not the per-item value | Inside a Repeater, the Data Picker switches to the iteration item's fields automatically. Bind from that root |
| Naming the section "Section 1" / "New Section" | Authors cannot tell sections apart in the palette | Use an intent-revealing name like `Hero Strip`, `Card Grid`, `Testimonial Card` |
| Dropping a **Rows / Box wrapper** before the first real component | Leaves a visible "Drop Here" placeholder zone in the canvas (and in every screenshot) that authors must clean up later. Rows is an e2e-test scaffolding habit, NOT a Studio authoring pattern. | Drop the first component directly onto the canvas root slot. Wrap in a container ONLY when you need explicit layout (e.g. an `hstack` to put two cards side-by-side). |
| Adding a **Repeater for a single, non-list use case** | Repeater iterates a multi-valued field. A static page with one Hero + one Product Card needs zero iteration. Adding one introduces a phantom iteration scope and shifts the Data Picker so the parent Section's fields aren't reachable from inside. | Use Repeater ONLY when the linked field is genuinely a list (Modular Block list, multi-Group, multi-Reference, multi-entry pinned query). For a single hero or single card: drop the component directly. |
| Path A when the card visual may be reused elsewhere | Locks the card into one parent. Reuse contexts drift out of sync | Default to Path B (see § Path A vs Path B). |
| Slot inside Repeater without a sized layout container | Child stretches full canvas width | Wrap in grid/flex/`max-width` Box. See `use-section-slot` § Layout container. |
| Leaving empty "Drop Here" zones at the bottom of the canvas | Saved compositions render those zones as visible placeholders in screenshots and to authors browsing the section gallery. | Before Save, switch to Layers and delete any orphan empty Box / Slot rows. Acceptance: the Layers tree contains ONLY the components you intended. No orphan structural wrappers remain. |
| **Typing a Tailwind (or any scanned-utility) class into the Design panel and seeing no effect**: the class is on the element in DevTools with no rule behind it | Tailwind emits CSS only for classes it finds while scanning source files. A composition is JSON in Contentstack, not a file in the repo, so a class that exists only in the Design panel is never generated. Identical symptom to a typo'd class name. | Keep load-bearing utilities in source: put the layout on a registered component, or list the class in Tailwind's `safelist` so it is always emitted. Reach for the Design panel for values the design system already ships. |
| **Assigning a CSS class to a Basic `box` and expecting `display: flex/grid` to apply**: the box renders but the children stack vertically (no flex) or single-column (no grid). | The Basic `Box` component is just `<div {...rest} {...studioAttributes}>`. Studio renders box layout from the node's **`styles.default.responsiveStyles.default`** (set via the Design panel on the node) and surfaces it through the renderer's style pipeline. An external CSS class on the app side has no node-level styles to attach to and only applies whatever rules its stylesheet defines. It does NOT make Studio's renderer emit `display: flex`. | Author Basic-box layout via node `responsiveStyles` in the Design panel: select the Box, open the Design tab, then set `display`, `gap`, `alignItems`, `flexDirection`, etc. The renderer writes these into the DOM. Reach for a CSS class only for tokens/colors/typography already wired through your design system, never for the load-bearing layout shape. (Custom registered components are different: they can apply layout via their own React/CSS.) |



## LLM execution caveat: drag-drop works, but only with the right sequence

Studio's canvas is a React-DnD iframe. Palette tiles listen on `mousedown` / `mousemove` / `mouseup` (NOT HTML5 native drag), and the drop COMMITS only when mousemove fires intermediate events between mousedown and mouseup. The high-level `dragTo()` helper fires HTML5 `dragstart`/`drop` which Studio does not honor. You must use `page.mouse.down()` / `page.mouse.move({steps})` / `page.mouse.up()` directly.

**Stable selectors (verified by execution):**

- Palette tile: `[data-builder-component="true"][data-node-type="<type>"]` where `<type>` is e.g. `doc-hero`, `doc-card`, `repeater`, `header`, `box`. (Section tiles use the section's composition UID as the type.)
- Canvas iframe: `[data-testid="canvas-iframe"]`
- Drop slot inside the iframe: `[data-composable-studio-slot="true"]` (the `="true"` filter is required. Without it you can match elements that have the attribute but aren't active drop targets)
- Layers row title (to select a node for deletion or inspection): `[data-testid="layer-editable-title-container"]`
- Node IDs (to verify a drop committed): `[data-composable-studio-id]` inside the FrameLocator

**The drop sequence (proven working pattern):**

```ts
const item = page.locator('[data-builder-component="true"][data-node-type="doc-hero"]');
const frame = page.frameLocator('[data-testid="canvas-iframe"]');
const slot = frame.locator('[data-composable-studio-slot="true"]').first();

await item.hover();                                      // 1. position cursor over palette tile
await page.mouse.down();                                 // 2. mousedown → posts PARENT_DRAG_START to iframe
const sb = await slot.boundingBox();
await page.mouse.move(sb.x + sb.width / 2,               // 3. move cursor in STEPS — required for mousemove events to fire
                      sb.y + sb.height / 2,
                      { steps: 10 });
await slot.hover();                                      // 4. final settle on the slot (FrameLocator handles cross-frame)
await page.mouse.up();                                   // 5. mouseup → commits the drop
```

The `page.mouse.move({steps: 10})` between mousedown and mouseup is the critical detail. Without intermediate mousemove events, the iframe's drag-tracking code never registers the path and the drop is silently swallowed.

**Anti-phantom guardrail.** Always verify a NEW `data-composable-studio-id` appeared inside the FrameLocator after each drop:

```ts
const idsBefore = await frame.locator('[data-composable-studio-id]')
  .evaluateAll(els => els.map(e => e.getAttribute('data-composable-studio-id')));
// ... drop sequence ...
await page.waitForTimeout(800);
const idsAfter = await frame.locator('[data-composable-studio-id]')
  .evaluateAll(els => els.map(e => e.getAttribute('data-composable-studio-id')));
const newIds = idsAfter.filter(id => !idsBefore.includes(id));
if (newIds.length === 0) {
  throw new Error('Drop did not commit; do not continue.');
}
```

If `newIds.length === 0`: stop and surface the failure. Do not fabricate completion.

**Sibling drops after the root slot is consumed.** Once a component is dropped at the canvas root, `[data-composable-studio-slot="true"]` may return zero matches because the root slot is now occupied. To add siblings, hover the **edge** of an existing node. Studio reveals a drop indicator there. Alternatively wrap children in a container (`box`, `vstack`, `hstack`) and drop subsequent siblings into the container's slot.

**Execution-path matrix:**

| Path | Drag-drop status |
|---|---|
| Human in their own Studio browser | **Yes**. Native: this is how authors use Studio every day |
| Playwright with direct `page.mouse.down/move/up` access | **Yes**. Use the proven sequence above |
| Playwright `dragTo()` only | **No**. Fires HTML5 drag events Studio does not honor |
| Synthetic `DragEvent` dispatched from page-context JS | **No**. Same reason |

**What ALSO works programmatically (verified):**

- Click a Layers row and press `Delete`, which removes the node and persists
- Click the Save button, which persists the composition. The button greys out post-save
- Switch right-panel tabs (Settings / Design / Data) via direct DOM clicks
- Open Configuration / URL Pattern / Schema Picker modals via their action buttons
- Read iframe canvas state via `frameLocator` (read-only operations)
- Switch palette accordion sections (Basic / Media / Container / Smart Containers / Registered Components / HTML Elements) via direct DOM clicks

## See also

- `docs/32-sections/link-content-types-with-linked-schema.md`: how schema connection drives auto-binding
- `docs/20-bring-your-own-components/register-components.md`: getting components into the Registered Components palette
- `docs/34-smart-containers/create-repeatable-content-with-repeaters.md`: Repeater + multi-variant sections
- `docs/34-smart-containers/control-visibility-with-condition-blocks.md`: required wrapping for Reference / Modular Block iteration
- `use-section-slot`: carve a drop region into the section
- `expose-section-props`: value-level overrides on Save
- `build-connected-template`: drop the saved section onto a template with a matching field
- `build-repeating-section`: the dedicated guide for the "parent Section with Repeater + Slot, child Section fills the Slot per iteration" pattern (Path B from this skill, walked end to end)
