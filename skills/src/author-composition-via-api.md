---
name: author-composition-via-api
---

## When to use

Author Studio compositions by writing composition JSON via the CMA, the manual contract Studio's Data Picker hides. For headless / scripted / seed-pipeline projects, not interactive UI authors.

Use when authoring compositions programmatically via CMA: seed pipelines, scripted provisioning, migration scripts, debugging via diff. Phrases: "compositions from JSON", "API author composition", "seed compositions", "headless author", "bulk import". Do NOT use for UI authoring. The Data Picker handles every shape this skill describes. For UI use `build-section` / `build-connected-template`.

> **Mandatory auth preflight: settle the credential before the first API call.** Resolve it OAuth-first per [`authenticate-cma`](authenticate-cma.md): `CS_OAUTH_ACCESS_TOKEN`, else the Contentstack MCP's stored session. **Never ask the user for a session `authtoken`.** If nothing resolves, or a refresh fails with `400 invalid_refresh_token`, hand them `! CONTENTSTACK_REGION=<code> npx @contentstack/mcp --auth` (it needs a TTY and a browser, so it cannot be run for them) and wait. `403 error_code 316` is a valid credential aimed at another org: fix the org or the `api_key`, do **not** re-authenticate.

# Author a composition by API (the manual contract)

> **Approved plan required: this path has no other gate.** This skill writes composition JSON. It does not decide what to build. If there is no plan the user has explicitly approved (Sections with their linked schemas, Section Slots, per-Section components, bindings, and the template kind), **stop and run [`plan-studio-architecture`](plan-studio-architecture.md) first**. The canvas build skills carry this guard. Scripted CMA authoring is the fastest way to reach a finished project without ever passing one, and [`decompose-design`](decompose-design.md) names this skill its default handoff. A template composition whose root slot holds a single component node is a monolith (no Sections, no slots, no reuse) and it renders perfectly, so nothing downstream will catch it. Exception: the user is iterating on a piece already in an approved plan.

> **Mandatory structural check before reporting success.** Read the saved template back and count `section-composition` nodes in `ui` and entries in `linked_sections`. Both zero means a monolith. The runnable check is [`build-connected-template`](build-connected-template.md) § Post-build structural check. It applies identically here, and it is the only acceptance check a monolith fails. When the page body is one modular-blocks field, [`decompose-blocks-page`](decompose-blocks-page.md) is the recipe for splitting it.


## When to use this: and when NOT to

Studio's Data Picker writes every binding shape this skill describes **automatically**. UI authors never need to know about `data_sources.resolvedReferences`, the `repeaterUID` discriminator, or any of the binding types. Studio's runtime resolves them under the hood.

**Use this skill ONLY** when bypassing the Data Picker:
- A seed pipeline that creates compositions programmatically (a docs / demo project's bootstrap, an automated stack provisioner)
- Migrating compositions between stacks
- Bulk-authoring compositions from another source (an existing CMS, a generator)
- Debugging: capture a working UI-authored composition, decode it, diff against your broken one

For interactive authoring, use Studio's UI. The Data Picker is the **source of truth** for these shapes. If your manually-written shape disagrees with what the Data Picker emits, the picker is right. Your manual shape is wrong.

## Prerequisite: the project, the compositions CT, the credentials

This skill assumes:
- A Studio project exists, bound to a stack
- That stack has a compositions CT (the CT the project's `contentTypeUid` points at) with the required field schema (see `provision-studio-project`)
- You have a CMA auth token + the stack API key with permission to create entries on that CT
- For headless verification later: a Delivery Token + paired Preview Token (`enable-visual-experience` Step 4)

If any of these is missing, this skill is the wrong starting point.

> **Auth: OAuth first.** Snippets here write `-H "$CS_AUTH"`, resolved once per run. **Assume there is no session `authtoken`**. The user authenticates with OAuth (MCP `--auth` / `csdx auth:login --oauth`) and never pastes one. Resolution order, scope headers (`organization_uid` vs `api_key`), the expiry/refresh rule and the 401/422 signature table: [`authenticate-cma`](authenticate-cma.md).

> **MCP-authed path (optional: the OAuth credential is what matters, not the MCP).** If `CONTENTSTACK_MCP_READY` (from [`install-contentstack-mcp`](install-contentstack-mcp.md)), the entry write + publish run as MCP tool calls (`create_an_entry` / `update_an_entry` / `publish_an_entry`) with no pasted `authtoken`. The composition **shape** is unchanged: you still build the `ui` (`zlib:<base64>`), `data_sources`, `static_value`, and `composable_uid` (= entry uid) exactly as below. The MCP only replaces the raw CMA transport. **Shell-corruption caveat on the MCP path:** `create_an_entry` takes `entry_data` as an **inline JSON object: there is no file-path param**, so the temp-file / `curl -d @file` guard does NOT apply. Instead **build the entire `entry_data` object programmatically and hand it to the tool, never hand-transcribe the `ui` blob into the arguments**, and assert the `"children"` count in the tree before the call (see the shell-corruption pitfall). If hand-assembly is unavoidable, keep the raw `curl -d @file` path for the write. Without that flag, use raw curl.

## The composition entry: what you actually write to the CMA

A composition is a single entry on the compositions CT. The fields (see § Complete example below for a real published Freeform composition):

| Field | Type | Holds |
|---|---|---|
| `title` | string | Display name in the Compositions list |
| `url` | string | URL pattern (e.g. `/products/{{entry.slug}}` for Connected. A fixed path like `/campaigns/spring-2026` for Freeform). Populated for both kinds |
| `composable_uid` | string | Composable identity for the composition. Must be **unique across the compositions CT**. Studio's canvas links to compositions by entry uid but the runtime resolves by `composable_uid`. A human-readable slug (`"spring_2026_landing"`) or the entry uid both work. A mismatch produces "Composition Not Found" |
| `connected_content_type` | string | The CT this template binds to (Connected only). Empty string `""` for Freeform / sections |
| `place_composition_as` | string | `"page"` for a template composition (Connected or Freeform). `"section"` for a section composition. `"template"` also legal but not what Studio writes for the top-level template composition. The Compositions tab lists `"page"` entries under Templates |
| `schema_version` | string | Composition schema version stamped by Studio (`"1.0.0"`, `"1"`, `"2"`, …), a **string**, not a number |
| `ui` | string | The compressed composition tree, `zlib:<base64>` (see `troubleshoot-canvas` § Diagnostic tooling) |
| `data_sources` | JSON string | The stringified `resolvedReferences` map + pinned data-source list. Wire shape is `"[]"` when empty, not `[]` |
| `static_value` | group | Per-key literal store. Every `binding.type: "static_value"` on a node references a **key** here. The actual literal lives in `static_value.<subtype>[]` under that key. See § How `static_value` binding resolves below |
| `url_metadata` | group | **Required on every template composition** (`place_composition_as: "page"`): `url_source` + `url_queries`. Never write `url` without it. See § `url` + `url_metadata`: a matched pair below. Sections carry neither `url` nor `url_metadata` |
| `linked_schemas` | **group-multiple** | Sections only. Declares parent CT + `selectedField` the section scopes to. `[]` for templates / freeform |
| `linked_sections` | reference (multiple) | Template's references to section-composition entries placed in its `ui` tree. `[]` for freeform / sections |
| `ui_preview` | file (asset uid) | **Required on every section composition** (`place_composition_as: "section"`). The editor writes this for itself by screenshotting the canvas on save. **The CMA never populates it**, so an API-created Section stays blank in the Sections palette forever and nothing errors. Supply an asset uid. See § Section thumbnails Fix C for the two calls. Templates don't need it |

After write, publish the entry. Studio queries by `composable_uid` + published status. An unpublished entry won't appear in the project's Compositions list or load in the canvas.

**A section write is not finished until `ui_preview` is set.** It fails the way publish state does (silently, with a correct-looking `200` and a page that renders), so it is invisible until an author opens the palette and finds unlabelled grey tiles. Set it in the same pass as the create, per § Section thumbnails: screenshot or generate the image, `POST /v3/assets`, then `PUT { entry: { ui_preview: <assetUid> } }`. Batching it to "later" is how a whole project ends up with none. Measured: 254 API-authored Sections in one project, zero thumbnails, while the UI-authored Sections beside them all had one.

**Reading publish state back requires an explicit flag.** A plain `GET /v3/content_types/<ct>/entries/<uid>` returns **no `publish_details`**. The field is simply absent, which reads identically to "not published" and makes the verification step above unfalsifiable. Ask for it:

```bash
curl -s "https://<cma-host>/v3/content_types/<ct-uid>/entries/<entry-uid>?include_publish_details=true" \
  -H "api_key: <stack-api-key>" -H "$CS_AUTH" | jq '.entry.publish_details'
```

A published entry returns an array with one object per environment/locale. `[]` or `null` means not published to anything. Same flag applies when listing entries.

<a id="url-metadata-matched-pair"></a>

### `url` + `url_metadata`: a matched pair, never one without the other

**Rule: any entry you write with `place_composition_as: "page"` gets BOTH `url` and `url_metadata`. No exceptions, no "minimal envelope" shortcut.**

`url` is the pattern. `url_metadata.url_source` is how the pattern is derived. Write the pattern alone and Studio has no derivation to read, so the composition behaves as the `legacy_url` source (the pre-variable wildcard mode) regardless of what the pattern actually contains.

**Why this matters.** Omitting `url_metadata` doesn't fail the CMA write and often doesn't break delivery either: a Connected template with `url: "{{entry.url}}"` can return 200 on the live route off the pattern alone. That green page is exactly what makes the omission expensive. It's discovered later, in the editor, not at write time:

- **Studio's URL panel loses the derivation.** The editor can't show that the URL comes from the connected CT's `url_pattern`, so the Edit-URL modal renders it as an opaque hand-typed string. First author who touches it re-authors the pattern by hand and the CT link is gone for good.
- **Candidate-set risk.** The SDK's composition-candidate query filters on `url_metadata.$exists: true` (see [`troubleshoot-composition-resolution` § Symptom matrix](troubleshoot-composition-resolution.md)). A composition with no `url_metadata` at all is not guaranteed to enter the candidate set. One code path resolving it today is not the same as every path resolving it.
- **`legacy_url` semantics are stricter.** They match against a `url` field populated on every entry, with a leading slash. A pattern written for `content_type_url_pattern` semantics but resolved under `legacy_url` fails the moment the entry set grows past the one you tested.

#### Which `url_source` to write

| Composition | `url` | `url_source` | Notes |
|---|---|---|---|
| **Connected** template, CT is a page type (`is_page: true` + CT `url_pattern`) | `/<route>/{{entry.title}}` | `content_type_url_pattern` | **The default for the API path.** The CT pattern is the derivation, so Studio re-derives correctly on every editor load. Pair with CT `url_prefix: "/<route>/"`. See [`build-connected-template` § Single-entry vs multi-entry URL pattern rule](build-connected-template.md#single-entry-vs-multi-entry-url-pattern-rule) |
| **Connected** template, CT **has** a `url_pattern` (entries get a real `url`) | `/<route>/{{entry.title}}` | `content_type_url_pattern` | Resolution keys on **`entry.url` existence**. The composition `url` is NOT variable-substituted under this source (see below). Requires every entry to carry a populated `url` |
| **Connected** template, **singleton** CT with no `url_pattern` (homepage, pricing, a one-entry rewards page) | `/rewards` (literal) | `content_type_url_pattern`, **but only if you populate `url` on the entry by hand** | The source's real requirement is a non-empty `url` field on at least one entry, not a CT `url_pattern`. A singleton has no pattern to generate one, so set `url: "/rewards"` on the entry yourself. Skip that and the editor fails with `MISSING_CT_PATTERN_URL_FIELD`, shown as "No entry has a URL field populated yet", while SSR renders the page fine |
| **Connected** template whose URL derives from a field **other than** `url` (`{{entry.slug}}`, `{{entry.author.slug}}`) | `/blog/{{entry.slug}}` | `user_specified_pattern` | This is the only source that extracts and matches on pattern variables. `content_type_url_pattern` would ignore the pattern and look for `url` instead |
| **Freeform** template, identity URL | `/<compositions-CT-uid>/<composable_uid>` | `default_url_pattern` | The Studio-generated default. Use this unless the path was deliberately hand-chosen |
| **Freeform** template, hand-chosen path | `/campaigns/spring-2026` | `user_specified_pattern` | Semantically correct: there's no CT to derive from. Write `url_queries` explicitly. Nothing else generates it on the API path |
| **Connected** template, hand-typed **variable** pattern on a CT that does have a `url_pattern` | - | Avoid, prefer `content_type_url_pattern` | Here `user_specified_pattern` reverts: `url_queries` is generated by the UI's Edit-URL then Save flow and Studio re-derives from the CT pattern on load. Use `content_type_url_pattern`. See [`build-connected-template` § URL traps (c)](build-connected-template.md). **This is not a blanket ban on `user_specified_pattern` for Connected**. It's the correct source when the CT has no pattern to derive from (row above) |
| **Section** (`place_composition_as: "section"`) | (omit) | (omit) | Sections have no URL. Don't invent one |

`custom_preview_url` (in Stack, under Visual Experience) and `legacy_url` (match a `url` field on every entry) are the two remaining values. Neither is something you write by hand on the API path: `custom_preview_url` is stack config, `legacy_url` is the state you fall into by accident.

#### What each `url_source` actually does: and the editor error it produces

Verified in the Studio app (`iframe-url/resolvePreviewEntry.ts`, `useResolvedPreviewEntry.ts`). The editor picks a **preview entry** by querying the connected CT, and the query shape depends entirely on `url_source`:

| `url_source` | Editor's query | Variable substitution? | Error when nothing matches |
|---|---|---|---|
| `content_type_url_pattern` | Fixed: **`url` field existence** (`requiredVariables: ["url"]`), no field predicates | **No** | `MISSING_CT_PATTERN_URL_FIELD`, shown as "No entry has a URL field populated yet" |
| `legacy_url` | Same fixed `url`-existence query | **No** | `MISSING_LINKED_URL_FIELD` |
| `user_specified_pattern` | Extracts `{{entry.x}}` variables from the pattern and matches entries on those fields | **Yes** | `NO_ENTRY_WITH_ALL_VARIABLES` |

Two consequences that bite in practice:

1. **`content_type_url_pattern` does not substitute your pattern.** `{{entry.title}}` in the composition `url` is display/matching metadata. The editor resolves purely off the entry's **`url` field**. The requirement is therefore "at least one entry has a non-empty `url`", **not** "the CT has a `url_pattern`". Two ways to satisfy it: a CT `url_pattern` (the usual route for multi-entry CTs), or setting `url` by hand (the route for a singleton). Satisfy neither and the editor dead-ends on "No entry has a URL field populated yet" while SSR keeps rendering. The mismatch reads as a Studio bug and isn't one.
2. **`user_specified_pattern` is the substituting branch.** Pick it when the URL derives from fields other than `url` (`{{entry.slug}}`, a reference field) or for a freeform hand-chosen path. It's wrong for a multi-entry CT that already has a `url_pattern`. Studio re-derives and the hand-set metadata reverts.

<a id="editor-vs-ssr-url-derivation"></a>

#### Editor vs SSR: an API-authored template can render live and still refuse to open

`prepareResolution` bails with `no-fetch` / reason `no-composition` when the composition has **no `url_metadata` at all**. The editor then has nothing to derive a preview URL from, so the template won't open, while SSR resolves the same composition off the `url` pattern and the entry's `url` and serves the page perfectly.

Same asymmetry family as `linked_sections` (P27) and `ui_preview`: the editor depends on metadata the UI writes for itself and the API path silently omits. **A passing SSR render is not evidence the template opens in Studio.** Verify both: load the route AND open the template in the editor. Cross-reference [`troubleshoot-composition-resolution` § Editor vs SSR: URL derivation](troubleshoot-composition-resolution.md#editor-vs-ssr-url-derivation).

#### Two authoring hazards worth avoiding up front

- **Bare `{{entry.url}}` with no literal prefix** matches every path. Fine with one template. The moment a second exists it wins or ties on specificity and swallows the other's URLs (ties break by `composable_uid`, deterministic but arbitrary). Give every template a literal segment. See [`setup-template-preview-routes` § Bare `{{entry.url}}` catch-all](setup-template-preview-routes.md#bare-entry-url-hazard).
- **Don't put a locale in the composition `url`.** Locale is a context variable (`{{locale}}`), not part of the stored path. Studio composes `<env base URL> + <composition url>`. On a locale-prefixed app (`next-intl`, `localePrefix: "always"`) the unprefixed path 307-redirects and the preview iframe dies on the redirect. Carry locale via the env base URL or the SDK `locale` option instead.

#### The wire shape

`url_metadata` is a **group with two text sub-fields**. `url_queries` is a **JSON string, not an object**. Send an object and the CMA rejects with a 422 type mismatch:

```jsonc
// Connected template — CT is a page type
"url": "/blog/{{entry.title}}",
"url_metadata": {
  "url_source": "content_type_url_pattern",
  "url_queries": "{\"include\":[],\"only\":{},\"where\":{}}"
}
```

```jsonc
// Freeform template — identity URL
"url": "/compositions/spring_2026_landing",
"url_metadata": {
  "url_source": "default_url_pattern",
  "url_queries": "{\"include\":[],\"only\":{},\"where\":{}}"
}
```

Leave `include` as `[]`. Reference expansion for URL variables like `{{entry.author.slug}}` is driven by `data_sources[template].resolvedReferences`, not by `url_queries.include`. A bare `""` for `url_queries` is also accepted alongside `content_type_url_pattern` (that's the shape in the verified multi-entry recipe). Prefer the explicit `{include, only, where}` JSON string, which is what the UI writes.

**Precondition: the CT must model the field.** If the project's compositions CT has no `url_metadata` group with `url_source` + `url_queries` sub-fields, the CMA **silently drops** the object on write: the POST returns 201, the entry reads back with no `url_metadata`, and you're in the `legacy_url` case with no error anywhere. Verify the CT first. See [`provision-studio-project`](provision-studio-project.md). Read the field back after your first write.

### How `static_value` binding resolves: two-level lookup

**Not obvious from the binding shape**: the literal ISN'T on the node. The `binding.value` on a `static_value` binding is a lookup key into the composition entry's `static_value.<subtype>[]` bucket:

1. The node's prop binding stores a **key string** in `binding.value` (e.g. `"mHjnXsgKbBlj_PZ-headline"`), NOT the literal.
2. The literal lives in the composition entry's top-level `static_value.<subtype>[]` array under that key: `{ "key": "mHjnXsgKbBlj_PZ-headline", "value": "Welcome to Studio" }`.
3. The SDK resolves by keying into `entry.static_value` with that key at render time.

Consequences for API authoring:

- **You must write to TWO places** for every static-value prop: `props.<name>.binding.value = "<key>"` on the node AND `entry.static_value.<subtype>` (matching the prop's declared `type`: `text` / `textarea` / `href` / `imageurl` / `number` / `choice` / `boolean` / `json_rte` / `array` / `object` / `any` / `datestring` / `html_rte`) with an entry `{ key, value }` pair.
- **Key uniqueness matters**: the resolver looks up the key against the whole `static_value.<subtype>` bucket. Reuse the same key across multiple nodes to share a literal. Use unique keys to keep them independent.
- **Widget-to-subtype pairing.** The node's `props.<name>.type` (`"string"` / `"number"` / `"href"` / `"imageurl"` / `"choice"` / …) determines which sub-bucket the SDK looks in. If you write the key to the wrong subtype array, the resolver misses and the prop renders as the schema default.
- **`type` also decides whether the binder FLATTENS the value: never write `"any"` for structured data.** The binder runs a recursive single-key unwrap on every type except `object` and `array` (`retrieve-data.ts`: `if (type !== "object" && type !== "array" …) resolvedData = getFlattenedData(resolvedData)`), descending while an object has exactly one key (`$` and `_metadata` don't count). So a node prop typed `"any"` and bound to a single-field block (`image_grid → { image: [...] }`) receives the **inner array**, not the block: lookups return `undefined`, indices surface as `{0,1,2,3}`, and it renders blank with no error. Write `"object"` for a group / Global Field / block object and `"array"` for a list. Those two skip the unwrap. Full mechanism: [`register-component` § The `any` flatten trap](register-component.md).
- **Convention Studio uses:** keys are `<node-uid>-<propName>` (e.g. `mHjnXsgKbBlj_PZ-headline`). Not required but stable and readable.

## Skeleton first, bind later: authoring structure before the content model exists {#skeleton-first}

Translating a design set into Sections does not require the content model to be finished. **Author the structure with static values only, bind fields in a later pass.** This is the cheaper order when a Figma board defines 30 section shapes and the CT blocks for them do not exist yet.

A skeleton composition is an ordinary composition with one difference: **no `template` bindings**. It is not a composition with fewer props.

**Skeleton means unbound, NOT unset. Design props must still be authored to match the comp.**

| | Skeleton pass | Binding pass |
|---|---|---|
| **Content** props (`text`, `href`, `src`) | `static_value` carrying the comp's real copy | `template` binding to a CT field |
| **Design** props (`direction`, `variant`, `size`, `color`, `gap`, `align`) | **set explicitly, same as the final section** | unchanged |
| Needs a linked schema? | **no** | yes |
| Needs a preview entry / block instance? | **no** | yes |
| Renders on canvas? | **yes**: comp copy, final layout | yes, real content |

**Omitting a design prop does not leave it blank. It silently selects the library's `defaultValue`, which is rarely the comp.** Worked failure, from authoring a Figma hero against a production library: the comp showed two CTAs side by side, and the authored section rendered them stacked. Cause:

```js
// registration
direction: { type: 'choice', options: stackDirectionOptions, defaultValue: 'column' }
```

The `direction` prop was never written, so the stack defaulted to `column`. Nothing errored. The canvas simply disagreed with the design. The same pass omitted both buttons' `variant` and `text`, so a brand CTA and a secondary CTA both rendered as the identical default button. **Every visual difference between the comp and the canvas was a prop left unwritten.**

The rule that follows: **a design prop is skeleton-time work, because it is static in the final section too** (see [`design-component-library`](design-component-library.md): design props stay static, only content binds). Leaving it for the binding pass means it never gets written at all.

For content props, prefer the comp's own copy as the `static_value` over relying on a default. Two buttons that both read "Get started" hide the fact that they are different CTAs. `"Explore our platform"` and `"Try for free"` make the structure legible and make the later binding pass obvious.

**A Repeater is authored in the skeleton too: it does not wait for data.** A repeating region is one child inside a `repeater`, never N copies of the same subtree. Leave `items` unbound and the canvas renders a single placeholder iteration, which is exactly what the skeleton needs:

```jsonc
// repeater node
"props": {
  "children": { "type": "slot", "slot": "<slot-uid>" },   // ONE child: the repeated shape
  "items":    { "type": "array",
                "binding": { "type": "static_value", "value": "<uid>-items" } }
}
// entry.static_value.array — key present, NO value
[ { "key": "<uid>-items" } ]
```

The wrapper holding the repeater carries `metadata.repeaterWrapper: true`, and its `direction` / `gap` / `wrap` props produce the row or grid the iterations flow into. Verified against a production section authored this way with `linked_schemas: []` and no data sources at all.

**A list whose items have different shapes needs one Condition Block per shape, all of them, in the skeleton.** A carousel showing stat / image / quote cards is not three lists and not one card repeated. It is one Repeater with three branches. Build every branch. Stopping after the first leaves two thirds of the design unbuilt while the canvas looks plausible, and the omission is invisible once the sheet is written.

```jsonc
// repeater.slots.<contents> holds ONE condition-block per item type
{
  "type": "condition-block",
  "metadata": {
    "slotNames": { "<slot-uid>": "Contents" },
    "condition": {
      "type": "modular_block", "operator": "eq", "value": "<block_uid>",
      "conditionBinding": { "type": "repeater",
        "value": { "repeaterUID": "<repeater-uid>", "path": { "<block_uid>": {} } } },
      "dataBinding": { /* same shape */ }
    }
  },
  "props": { "children": { "type": "slot", "slot": "<slot-uid>" } }
}
```

The branches can be authored **before the Modular Block exists**. Name the block uids the schema uses (`stat_card`, `image_card`, `quote_card`) and the binding pass creates them. Verified on an unbound Repeater: all three branches render their placeholder side by side, so the skeleton shows the whole design rather than one card.

**Building N copies instead is the defect this prevents.** Five hand-placed cards look identical on the canvas, but the shape is fixed at five, editing one leaves four stale, and the binding pass has nothing to point at a collection. One card in a Repeater binds later by setting `items`. The subtree never changes.

Two consequences worth stating:

- **The canvas looking right proves structure, not data.** A skeleton and a correctly-bound section are visually similar. Both show plausible copy. `build-section` § Field-existence gate covers the inverse hazard: a **bound** prop falling back to `defaultValue` reads as real data when the binding is actually broken. Skeleton-first is safe precisely because nothing is claimed to be bound yet.
- **Bind by rewriting the same nodes.** The binding pass replaces `props.<name>.binding` from `static_value` to `template` on the existing tree. Node uids, slots and layout stay untouched. Keep the skeleton's `static_value` entries or drop them: an unreferenced key in `entry.static_value` is inert.

## Read the component source before authoring, not just the registration

The registration gives prop **names, types, options and defaults**. It does not say how the component **consumes** them, and that is where authored values silently stop working. Open the component file (`components/…/<Name>.tsx` in the host project) for every component you author, and look for four things.

**1. Props that override other props.** A component may ignore one prop when another is set:

```tsx
// AlphaRow.tsx — position overrides align/justify when set
position && position !== 'auto'
  ? ROW_POSITION_CLASS[position]
  : cn(ALIGN_CLASS[align], JUSTIFY_CLASS[justify])
```

**2. Equality comparisons: the trap that follows from list-wrapped `choice` values (§ point 0a).** A list works for an object-key lookup and fails a strict comparison:

```js
['auto'] !== 'auto'            // true  → takes the override branch
ROW_POSITION_CLASS[['auto']]   // ""    → align AND justify are dropped
JUSTIFY_CLASS[['end']]         // 'justify-end'  → key lookup still works
```

Worked failure: a pagination row authored with `justify: end` rendered **left**-aligned. Every value was correct and the panel showed them correctly. `position: ["auto"]` (written only because the rule says fill every registered prop) sent the component down the override branch and discarded `justify`. **Where a component compares a prop by equality, leave that prop unwritten** and let its own string default apply. This is a component-side bug (it should normalise the array), so record it for the library owner rather than working around it silently everywhere.

**3. Values the component derives from another prop.** A component often computes a child's value from its own colour scheme rather than taking it verbatim:

```tsx
// AlphaFeatureGrid.tsx
const bodyColor = isDark ? 'medium' : 'light';
const iconColor = isDark ? 'inverse' : 'strong';
```

Authoring the same tree atomically means supplying those values yourself, and the correct one depends on context. A dark feature grid authored with `color: light` on the body and `default` on the icon looked reasonable and was wrong on both. The shipped component uses `medium` and `inverse` for dark. **When you compose from atoms what a composite renders internally, its derivation logic is the specification for the values you write.**

**4. Which prop the component actually reads.** A registration often exposes several props for the same thing, and the component uses one of them. Worked failure: a media atom's registration offers `url` (string) **and** `media` (object). The component's first line is `if (!media?.url) return null`. A node authored with `url` rendered **nothing**: no error, no placeholder, just an absent image that read as a missing design element. The registration is a menu, not a contract. The component decides.

**5. Whether a layout prop needs a width or a height to act on.** `justify` distributes free space. A shrink-wrapped row has none. The same pagination row, with `justify: flex-end` correctly applied, still sat left until its parent stack moved from `align: start` (which shrink-wraps children) to `align: stretch`. **Alignment is a two-node problem**: the prop on the child, the width it is given by the parent. Verify by measuring the rendered box, not by reading the prop back.

## Before declaring a value inexpressible, look for a free-form primitive

A constrained prop is not the whole library. Most palettes ship an escape hatch: a shape / box / spacer primitive whose `color`, `width` and `height` are **raw CSS strings** rather than token choices. It renders exactly what the comp asks for.

**Check WHERE it renders, not just that it renders.** A shape/box primitive is often decorative background art, not an in-flow element:

```js
// outer wrapper of a typical shape primitive
{ position: 'absolute', inset: 0, pointerEvents: 'none' }
```

With that wrapper the node occupies **zero layout space** and pins to the nearest positioned ancestor, usually the section, not the card you nested it in. Worked failure: three accent rules and four slide indicators were authored as shapes. Every one measured at the exact width, height and colour asked for, and every one rendered at the **section origin**, stacked on top of each other over the heading. Size and colour were verified. Position was not. Read the component before using a shape as a rule, and confirm the rendered box sits inside its intended parent.

Worked failure: three accent rules were reported as impossible because `card-shell.border` is uniform and its width is a two-value choice. A card needing `border-top: 6px solid #899CFA` seemed unreachable. The same library had a `shape` primitive taking `color: "#899CFA"`, `width: "421px"`, `height: "6px"`, which reproduced all three rules exactly, including a `1px rgba(255,255,255,0.19)` hairline. **Grep the registry for a primitive with free-form size/colour props before writing a row in Deviations.**

The trade-off is real, so state it: a shape used as a rule is a positioned box, not a border. It does not follow the element on resize the way a real border does, and it adds a node. When a token-level fix exists (a per-side border prop on the container), the shape is the interim answer and the registration change is the durable one.

## Binding a Repeater: the shapes that actually work

Copy these from a working composition in the target project rather than inferring them. The path shape differs per field kind and a wrong one yields **zero iterations** with no error.

| Iterating | `items` binding path | `metadata.repeaterBindingFieldType` |
|---|---|---|
| A modular-block field | `{"page_sections": {}}`, plain | `"modular_block"` |
| A multi-reference field | `{"edge_card": {"": {}}}`, note the `{"": {}}` leaf | `"reference"` |

Also required on the Repeater: `metadata.mode: "preview"`, or the canvas shows one placeholder while production renders N.

**Worked failure.** A carousel repeater bound with the reference shape (`{"case_study_cards": {"": {}}}`) over a modular-block field rendered **0** cards. The same tree with the plain path and `repeaterBindingFieldType: "modular_block"` rendered all **6**, with each Condition Block routing to its branch. Nothing in the entry data or the panel indicated which shape was wrong. The Layers panel read "Iterates Case Study Cards" in both cases.

**Scope the section at the content type root when the repeated field is top-level.** A `linked_schemas` entry of `{content_type_uid}` alone makes root fields addressable. Adding `selected_field` narrows the scope to that field, after which a path naming the same field no longer resolves.

**Verify a `resolvedReferences` path against the API before assuming it is wrong.** The paths feed `include[]`, so they are directly testable:

```bash
curl ".../entries/<uid>?include[]=<mb_field>.<block_uid>.<ref_field>"
```

A resolved object back means the path is right and the gap is elsewhere. Measured on one project: `case_study_cards.case_study_card_with_image_statistics.card` resolved fully, while `case_study_cards.card` and `card` returned null, confirming the `<mb_field>.<block_uid>.<ref_field>` form. **A reference nested inside a repeated modular block resolved through the API but did not resolve in the canvas**, so every prop behind it fell back to its registration default. When a block's only field is a reference, that blocks all of its content, worth checking early, because no amount of path fixing helps.

## Verify the write: a `200` does not mean the composition resolves

Nothing validates that a `static_value` key on a node exists in the entry's bucket. Write half the pair and the CMA still returns `200`. The canvas then renders every affected prop as its registration `defaultValue`, which looks like a working section made of placeholder copy.

**Worked failure.** A hero was authored with all seven props stripped to `static_value`. The write returned `200`. The canvas showed "Your headline here" and two buttons both reading "Get started", indistinguishable from a deliberate skeleton. The entry actually held:

```jsonc
"static_value": {
  "boolean": [ { "value": false, "_metadata": { … } } ],   // ⛔ no "key"
  "href":    [ { "value": "#",   "_metadata": { … } } ],   // ⛔ no "key"
  "choice":  [], "imageurl": [], "number": [], "object": []
}                                                          // ⛔ no "text" bucket at all
```

Every item was missing its `key`, and the bucket holding the headline and button labels was never written. **Zero of the bindings could resolve, and nothing anywhere reported it.**

Run this check after every write. It is three lines and catches the entire class:

1. Re-fetch the entry and decompress `ui`.
2. Walk the tree collecting every `(props.<name>.type, binding.value)` pair where `binding.type === "static_value"`.
3. Assert each one has a matching `{key}` in `static_value[<bucket-for-that-type>]`. Any miss is a prop that will silently render its default.

Do the same before writing, against the payload you are about to send. On the corrected hero the counts read `refs=26 statics=26 missing=[]`. The original would have reported 7 missing keys and 1 absent bucket.

The same discipline applies to `template` bindings: [`decompose-design`](decompose-design.md) § Step 8b is this check at plan time, and `build-section` § Field-existence gate is it at bind time. A prop that silently falls back to `defaultValue` is the single failure mode all three exist to catch.

### Preflight: assert the envelope on every node before you write

The rule above is stated. Nothing enforces it. A sweep of one live stack found **54 nodes across 10 compositions** missing `slots` (the whole pricing family plus two carousels), every one authored by tooling that skipped it on leaves. They rendered fine for months and only surfaced as a white screen when someone opened the Data tab.

So check the payload you are about to send, and the entry after you write it:

```
for every node in the ui tree:
  assert all of ("uid","type","props","metadata","slots","attrs","styles") are present and non-null
```

Three lines, catches the entire class. Run it in the same pass as the `static_value` key check, same idea, different envelope. On a correct composition it reports zero. On the pricing sections above it would have reported 4, 8, 11.

**Repairing existing data** is additive: insert `"slots": {}` where the key is absent, leave everything else untouched. Note it creates an unpublished version on a published composition, so republish afterwards or the live entry keeps the old shape.

## Binding types: the full set

The SDK defines **7 binding `type` values**. Each type is available in a specific composition context. Picking one that doesn't fit the context is the most common trap.

| `type` | Available in | Configured in Studio via | Shape |
|---|---|---|---|
| `static_value` | Connected + Freeform + Sections (always) | Right panel: in Settings, type the literal into the prop input | `{ type: "static_value", value: "<key>" }`, where `<key>` looks up `entry.static_value.<subtype>[]`. See § How `static_value` binding resolves |
| `template` | Connected templates + Sections placed on Connected templates | Right panel: in the Data Picker, pick a field on the connected entry | `{ type: "template", value: { path: {…} } }` |
| `repeater` | Anywhere inside a Repeater | Right panel: Data Picker under the Repeater's scope, auto-picked | `{ type: "repeater", value: { repeaterUID: "<uid>", path: {…} } }` |
| `contentstack` | **Freeform only**: Data tab, under **Additional Entry Data** (Pinned Entries) | In the Data tab, pin an entry, then the Data Picker binds to its fields | `{ type: "contentstack", value: { uid, _content_type_uid, path: {…} } }` |
| `contentstack_queries` | **Freeform only**: Data tab, under **Queries** (Pinned Queries) | In the Data tab, save a query, then Repeater `items` picks it | `{ type: "contentstack_queries", value: { queryUID: "<uid>", path: {…} } }` |
| `component_props` | Anywhere: component's registered `defaultValue` OR the Data tab's **External Data** | Registration path (`registerComponent`) or Data tab External Data | `{ type: "component_props", value: "<propName>" }` |
| `symbol_props` | Symbols only (advanced) | Symbol authoring | `{ type: "symbol_props", value: "<propName>" }` |

`path` is a nested-object leaf structure: `{ products: { 0: { url: {} } } }` reads `products.0.url`. The path is flattened at resolution. `{ products: {} }` and `{ products: { "": {} } }` are equivalent.

### Authoring UX: the same for every binding kind

**No inline click-to-edit exists on the canvas for any binding kind.** Every value edit happens in the right panel:

- **Static bindings**: edited in the **Settings** tab. Type into the prop input. The literal writes to `binding.value`.
- **Template bindings**: edited via the **Data Picker** in Settings (pick a different field on the connected entry). The rendered value itself is read-only: to change the underlying content, edit the connected entry in the CMS.
- **Pinned bindings** (`contentstack`, `contentstack_queries`): the pin itself is set up in the **Data** tab (Freeform only). Once pinned, bindings reference it through the Data Picker in Settings. Rendered values are read-only from Studio's perspective. Edit the source entry in the CMS to change them.

### Context mismatches: the real trap

Picking a binding type that doesn't fit the composition's context is silent. The shape is valid, but resolution returns `undefined` at render:

| Mismatch | Symptom | Fix |
|---|---|---|
| `template` binding in a **Freeform** template | Binding never resolves. Freeform has no page-level entry to source from | Use `contentstack` (pinned entry) or `contentstack_queries` (pinned query) via the Data tab, or `static_value` for a literal |
| `contentstack` / `contentstack_queries` binding in a **Connected** template | The binding works, but it bypasses the connected entry. You've hard-pinned data that should come from the page. Usually a mistake | Use `template` with a path into the connected entry's schema |
| `repeater` binding used on a node NOT inside a Repeater | `repeaterUID` refers to a scope that doesn't exist above the node, resolves to `undefined` | Place the node inside the referenced Repeater's `slots`, or switch to a `template`/`contentstack` binding matching the current scope |

## Node anatomy: where bindings and children actually live in the `ui` tree

Node shape (canonical Repeater example, binding wrapper included):

```jsonc
{
  "type": "<node-type>",          // "repeater" / "condition-block" / a registered component type
  "uid": "<unique-id>",
  "metadata": {                   // node-level metadata
    "mode": "preview"             //   - Repeater: "preview" vs implicit Design Mode
    // "condition": { ... }       //   - Condition Block: discriminator (see below)
  },
  "props": {                      // bindings live HERE — one per prop
    "<propName>": {
      "binding": { "type": "<one of the 7 binding types>", "value": { /*…*/ } },
      "value": "<static fallback if any>"
    },
    // CONTAINER nodes ONLY — wire the child slot to the built-in's slot-typed
    // `children` prop, or children never render (see point 4):
    "children": { "type": "slot", "slot": "<slot-uid>" }
  },
  "slots": {                      // children go HERE, grouped by slot uid (NOT a flat `children` array)
    "<slot-uid>": [               // …this uid MUST equal props.children.slot above
      { /* child node */ }
    ]
  }
}
```

Eight things to internalize:

0. **Every node carries the full envelope (`uid`, `type`, `props`, `metadata`, `slots`, `attrs`, `styles`) even when empty.** `metadata` is not only for Repeater `mode` and Condition `condition`: the renderer reads `metadata.visible` on **every** node, so a leaf authored without the key throws `Cannot read properties of undefined (reading 'visible')` and the whole canvas renders `Component Loading Error`, no partial paint, no indication of which node. **A missing `slots` fails differently and worse, because the canvas still looks fine.** `Node.isNode` requires a truthy `slots`, so a slots-less node is not recognised as a node at all: tree walkers skip it silently (its props never appear in the Data tab), and any walker handed it as its ROOT crashes on `Object.entries(undefined)`. Measured: `Pricing Systems Cards` carried 4 slots-less atoms. Clicking one white-screened Studio's Data tab through `collectComponentProps`, with no error boundary to catch it. The section rendered perfectly on canvas and on the site the whole time. Leaves need `"metadata": {}` and `"slots": {}` exactly as containers do. The minimum leaf, copied from a production section:

```jsonc
{
  "uid": "1v7tfQQBhdETYAN",
  "type": "alpha-atom-heading",
  "attrs": {},
  "metadata": {},                 // ⛔ required even when empty
  "slots": {},                    // ⛔ required even when empty
  "props": { /* … */ },
  "styles": { "default": { "classes": [""], "responsiveStyles": { "default": {} } } }
}
```

0a. **A `choice` value is stored as a LIST, every other type as a scalar.** `"value": ["h1"]`, not `"value": "h1"`. Measured across production `static_value` buckets: `choice` is a list in **938** entries against 18 stray strings, while `boolean` is a bare bool (180), `text` a bare string (582) and `number` a bare int (39).

**This fails in the worst possible way: it renders correctly and configures wrongly.** The renderer accepts the bare string, so the canvas shows the right 72px heading and every visual check passes. Studio's Settings panel matches the stored value against the registered `options`, finds no match for a string, and displays **`Select…`**, so the author sees Tag, Size Variant and Color as unset on a node that looks finished, and re-picks them by hand. Neither a screenshot nor a computed-style assertion catches it. Only reading the entry back does.

```jsonc
"choice":  [ { "key": "<uid>-tag", "value": ["h1"] } ],   // ✅ list
"boolean": [ { "key": "<uid>-wrap", "value": true } ],    // ✅ scalar
"text":    [ { "key": "<uid>-text", "value": "80%" } ]    // ✅ scalar
```

0b. **Write EVERY registered prop, not only the ones the design dictates.** An unwritten prop still renders (it falls back to the registration default) but Studio's Settings panel shows it **blank**, so the author sees a half-configured node and fills the dropdowns by hand. That is the API author's omission surfacing as manual work downstream. For each registered prop: use the comp's value if the design determines one, otherwise write the registration's own `defaultValue` explicitly. Only a prop the registration declares with **no** `defaultValue` may stay unset. Measured on one section, this took the node count from 64 written props to 135. The other 71 were defaults the panel had been showing as empty.

0c. **Name the layer and mark it visible.** Studio reads `metadata.title` as the layer name in the Layers tree. With no title the tree reads as repeated type names (`Stack / Box`, `Stack / Box`, `Stack / Box`) and is unnavigable. Give each node a purpose-name: `Stack — Card content`, `CTA — Read the full story`. Production nodes also carry `visible: true` and `locked: false`, and the root `page` node carries `metadata.sectionExposedProps: []`.

```jsonc
"metadata": {
  "title": "Card Shell — Stat card",   // layer name in the Layers panel
  "visible": true,
  "locked": false
}
```

**`attrs` is where the panel's Attributes section keeps the ID and custom attributes** (`"attrs": { "id": "car-stat-card" }`). Across 650 production nodes it is empty on every one, and the components verified here do not spread it to the DOM, so set it when you want the ID field pre-filled in the panel, and don't rely on it reaching the rendered markup.

1. **Bindings are at `props.<propName>.binding`.** Not directly on the node, not in a flat `bindings` map.
2. **Children are in `slots.<slot-uid>: [...]`.** Not a `children` array. Each slot has a uid. Child nodes live inside the array under that uid.
3. **Discriminators live in `metadata`.** Condition Block's `condition` and Repeater's `mode` are both `metadata.<key>`, not top-level node fields.
4. **Container nodes must ALSO wire `props.children` to their slot: putting children in `slots` alone is not enough.** Every built-in container exposes a **slot-typed prop** in its definition: `page`, `section`, `box`, `columns`, `rows`, `repeater`, and `condition-block` all declare `children: { type: "slot" }`. The SDK fills that prop only when the node points at the slot: `props.children = { "type": "slot", "slot": "<uid>" }`, with `<uid>` matching a key in `slots`. Omit the pointer and the prop resolves to `undefined`: the container renders empty even though the child nodes sit in `slots`. A Repeater is the sharpest trap: it still iterates (N `<div data-composable-studio-wrapper="repeater">` wrappers appear in the DOM), but clones **zero** children into each, so it renders blank with no error. (The `page` node in every working composition carries `props.children`. Mirror it on every container you author.) A registered component with a `slot`-typed prop is wired the same way, under whatever name the registration gave the slot prop.

### Built-in node `type` values

These are the built-in `type` strings the SDK ships with. Anything else must be a component you registered via `registerComponent`.

| Group | `type` values (the palette label and its `type` string) |
|---|---|
| System | `page` |
| Basic: text | `header` · `plain-text` · `collapsible-text` · `rich-text` · `text` · `number` · `json-rte` |
| Basic: button/link | `button` · `link` · `link-container` |
| Media | `image` · `video` · `embed` |
| Container / layout | `section` · `box` · **`hstack`** (palette: Columns) · **`vstack`** (palette: Rows) · `fragment` |
| Composition primitives | `symbol` · `condition-block` · `section-slot` |
| Iteration | `repeater` |
| HTML | `html-element` · `style-sheet` |

Palette labels are author-facing. `type` strings are what appear in the `ui` tree. **Non-obvious pairings:** palette Columns becomes `hstack`, palette Rows becomes `vstack`. Inspect a UI-authored composition (decode `ui`, see [`troubleshoot-canvas`](troubleshoot-canvas.md) § Diagnostic tooling) to confirm the exact `type` string before hand-authoring a node of that kind.

None of these support inline click-to-edit on the canvas. All value edits go through the right panel (both built-ins and BYOC, see [`build-section`](build-section.md) § Basic field components vs custom registered components).

## Recipe: Repeat a card over a multi-reference field

The canonical pattern. Requires FIVE shapes in concert. Missing any one yields a silently-empty repeater or (worse) an all-items-identical render (the `template`-at-`.0.` trap below).

Scenario: a `category` template (Connected to the `category` CT). Each category entry has a `products` multi-reference field. We want to render one card per referenced product.

### 1. Composition-level: `data_sources.resolvedReferences`

The reference-resolution map. Tells the SDK "when bindings resolve through this reference path, materialize each stub into a real entry":

```jsonc
"data_sources": [
  {
    "uid": "template",
    "data": null,
    "resolvedReferences": {
      "template": ["products"]
    }
  }
]
```

Example: a section (Card Grid) that iterates `related_posts`:

```json
"data_sources": "[{\"uid\":\"template\",\"data\":null,\"resolvedReferences\":{\"template\":[\"related_posts\"]}}]"
```

**Wire format quirk:** on the CMA `data_sources` is stored as a **JSON-encoded string** (`"[]"`, `"[{…}]"`), not the parsed array. Serialize before write. Parse after read.

**Key semantics: depends on the data source, and getting it wrong fails silently:**

| Data source | Key | How the SDK reads it |
|---|---|---|
| `template` (the page entry) | Opaque label, Studio writes `"template"` | Flattens `Object.values(resolvedReferences)`, key content is ignored |
| `contentstack` (pinned entries) | **Must be the entry uid** | Direct lookup `resolvedReferences[entry.uid]`, a key that doesn't match the entry falls through to `[]` |

Values are the field paths on the parent entry in both cases.

So the "key doesn't matter" rule is **template-scope only**. For pinned entries the key is a lookup, not a label: mis-key it and the SDK finds no paths, adds no includes, and the references stay stubs, with no error, exactly as if you had never set `resolvedReferences` at all.

Without this, reference fields are just `[{uid, _content_type_uid}, …]` stubs at runtime. The iteration sees no items.

#### Where a reference path must terminate: the four shapes {#reference-path-termination}

**One rule, four instances.** A `resolvedReferences` value becomes a CDA `include[]` entry, so it must name a **real, fetchable field chain** ending at the reference (or at the nested field you need resolved). Include every intermediate level, and no segment that isn't a field.

| Source shape | Path to write | Not |
|---|---|---|
| Multi- or single reference on the parent | `products` | - |
| Reference inside a **Modular Block** | `blocks.<block_uid>.<ref_field>` | `blocks.<ref_field>`, block uid omitted |
| Reference inside a **reference** | `carousel.cards` | `carousel.products_carousel.cards`, CT uid leaked |
| **Nested asset** inside a reference | both `hero` **and** `hero.image_options.image` | `hero` alone, scalars resolve, the asset doesn't |
| Reference inside a **group-multiple** | `footer_columns.related_entries` | - (groups add no extra level) |

**Why this matters: every violation fails the same silent way.** A path that doesn't name a fetchable chain would 422 the CDA query, so Studio filters it out before the query is sent rather than letting it error. Nothing warns you. The reference stays a stub, the binding resolves against that stub, and the component renders empty. **A correct-looking binding with missing data is the signature of a bad path, not of a bad binding.**

Two segment types are not fields and must not appear:

- **Array indexes** (`0`, `2`) and the `entries` array-wrapper: the SDK strips both.
- **Reference-target CT uids.** A reference-inside-a-reference produces the inner reference's target CT uid directly after the reference field (`carousel`, then `products_carousel`, then `cards`). Studio drops it positionally: a segment is a discriminator **iff** it is a known CT uid **and** the preceding segment is a reference field whose `reference_to` includes it. That precision is deliberate: the same uid is often also a modular-block uid elsewhere in the path, and a block (having no preceding reference) is correctly preserved.

Numeric prefixes on block segments (`2_feature_block`) are stripped by both Studio and the SDK, so write the plain uid.

### 2. Repeater node's `items` binding: at `props.items.binding`, type `template`

The Repeater consumes its iteration source through its `items` prop:

```jsonc
{
  "type": "repeater",
  "uid": "R1",
  "props": {
    "items": {
      "binding": {
        "type": "template",
        "value": { "path": { "products": {} } }
      }
    },
    "children": { "type": "slot", "slot": "R1-slot" }
  },
  "metadata": { "mode": "preview" },
  "slots": { "R1-slot": [ /* see step 4 */ ] }
}
```

`props.children` is **required**: it wires the `R1-slot` slot to the Repeater's built-in `children` prop. Without it the Repeater iterates but renders nothing (§ Node anatomy point 4). The `slots` key MUST match `props.children.slot`.

For a section whose `selectedField` is the reference itself (`build-section`'s scope-aware sections / P22-P24), the path collapses to scope-root `{ "path": {} }`, the section's `dataSources.template` is already the resolved array.

### 3. Repeater node's `metadata.mode: "preview"`

On the same Repeater node, in `metadata` (parallel to `props`). Per `use-repeater`'s two-mode model: Design Mode (default) renders one placeholder. Preview Mode renders N real iterations. UI authors toggle this in Properties, under Configuration. API authors set the metadata directly. See the Repeater node shape in step 2 above for placement.

### 4. Condition Block as the immediate child of the Repeater (under `slots`)

Required by Studio's composition schema for reference iteration (single-CT AND multi-CT, `use-condition-block`). Narrows the iteration item to a specific content type before child bindings resolve.

The Condition Block lives under a slot of the Repeater. Its discriminator is in `metadata.condition`:

```jsonc
{
  "type": "repeater",
  "uid": "R1",
  // …items binding / metadata.mode as in step 2…
  "props": {
    "items": { "binding": { /* …as step 2… */ } },
    "children": { "type": "slot", "slot": "<repeater-slot-uid>" }   // ← wire the Repeater's slot
  },
  "slots": {
    "<repeater-slot-uid>": [
      {
        "type": "condition-block",
        "uid": "CB1",
        "metadata": {
          "condition": { "type": "reference", "value": "product" }
        },
        "props": {
          "children": { "type": "slot", "slot": "<cb-slot-uid>" }   // ← Condition Block needs it too
        },
        "slots": {
          "<cb-slot-uid>": [
            /* card subtree here — step 5 */
          ]
        }
      }
    ]
  }
}
```

For modular-block iteration: `metadata.condition.type: "modular_block"`, `value: "<block-uid>"`.

Both container nodes carry `props.children` pointing at their own slot (§ Node anatomy point 4). The Condition Block also exposes a `children` slot prop. Skip its pointer and the card subtree never renders even though the Repeater iterates correctly.

### 5. Card prop bindings: type `repeater`, with `repeaterUID`

**The "all cards identical" trap:** Do NOT use `template` bindings indexed at `.0.<field>` (e.g. `products.0.title`). A fixed `.0.` index does NOT get substituted by the iteration: every iteration renders item 0. This is what bit P19.

Use repeater-scope bindings: `type: "repeater"`, with `repeaterUID` naming the parent Repeater node, and a path relative to the iteration item (NO index). The card node lives inside the Condition Block's slot:

```jsonc
{
  "type": "site-product-card",     // the registered component's type
  "uid": "CARD1",
  "props": {
    "title": {
      "binding": {
        "type": "repeater",
        "value": {
          "repeaterUID": "R1",
          "path": { "title": {} }
        }
      }
    },
    "image": {
      "binding": {
        "type": "repeater",
        "value": {
          "repeaterUID": "R1",
          "path": { "images": { "0": { "url": {} } } }
        }
      }
    },
    "price": {
      "binding": {
        "type": "repeater",
        "value": { "repeaterUID": "R1", "path": { "price": {} } }
      }
    }
  }
}
```

The `repeaterUID` ("R1" here) tells the SDK at render time which Repeater's current item this binding reads from. The path is on the iteration item itself.

### Assembled

```
Composition entry
├── composable_uid: "<15-char>" (= CMA entry uid)
├── data_sources: [{ uid:"template",
│                    resolvedReferences:{ "template":["products"] } }]
└── ui (zlib-inflated tree)
    └── Section "ProductGrid"
        └── Box  (grid layout — register-component § Layout contract)
            └── { type:"repeater", uid:"R1",
                  metadata:{ mode:"preview" },
                  props:{ items:{ binding:{ type:"template",
                                            value:{ path:{ products:{} } } } } },
                  slots:{ "<R1-slot>":[
                    { type:"condition-block", uid:"CB1",
                      metadata:{ condition:{ type:"reference", value:"product" } },
                      slots:{ "<CB1-slot>":[
                        { type:"site-product-card", uid:"CARD1",
                          props:{
                            title:{ binding:{ type:"repeater",
                                              value:{ repeaterUID:"R1", path:{ title:{} } } } },
                            image:{ binding:{ type:"repeater",
                                              value:{ repeaterUID:"R1", path:{ images:{ 0:{ url:{} } } } } } },
                            price:{ binding:{ type:"repeater",
                                              value:{ repeaterUID:"R1", path:{ price:{} } } } }
                          } }
                      ] } }
                  ] } }
```

Five shapes: composition `resolvedReferences` + Repeater `props.items.binding` + Repeater `metadata.mode` + Condition Block in slot with `metadata.condition` + repeater-scope card bindings. Any one missing produces an empty render or an all-identical render.

## Recipe: Repeat a card over a GROUP-MULTIPLE field

Sibling to the multi-reference recipe above, but **simpler**: group-multiple values are inline on the parent entry, so no reference resolution is needed.

Scenario: a `category` entry has a `features` field of type `group` + `multiple: true` (a list of inline objects, each with sub-fields like `headline`, `body`, `icon`). Render one card per feature.

### What's different vs the multi-reference case

| Shape | Multi-reference | **Group-multiple** |
|---|---|---|
| Composition `data_sources.resolvedReferences` | **Required**: reference stubs need resolving | **NOT needed**: values are inline on the parent entry |
| Condition Block as Repeater's immediate child | **Required**: references are polymorphic (any allowed CT). The block narrows | **NOT needed**: group-multiple has one shape, not polymorphic |
| Repeater `props.items.binding` | `type: "template"`, path at the multi-ref field | (same) `type: "template"`, path at the group-multiple field |
| Repeater `metadata.mode: "preview"` | Required for canvas iteration | (same) Required |
| Card prop bindings | `type: "repeater"`, `repeaterUID`, no index | (same) `type: "repeater"`, `repeaterUID`, no index |

So group-multiple drops to **THREE shapes** (Repeater items binding + Repeater metadata.mode + repeater-scope card bindings). No composition-level resolved-references map. No Condition Block.

### Group-multiple Repeater + card, assembled

```
Composition entry
├── composable_uid: "<15-char>" (= CMA entry uid)
├── data_sources: [/* no resolvedReferences entry needed */]
└── ui (zlib-inflated tree)
    └── Section "FeatureList"
        └── Box  (flex / grid layout — register-component § Layout contract)
            └── { type:"repeater", uid:"R2",
                  metadata:{ mode:"preview" },
                  props:{ items:{ binding:{ type:"template",
                                            value:{ path:{ features:{} } } } } },
                  slots:{ "<R2-slot>":[
                    /* card goes here directly — no Condition Block wrapper */
                    { type:"site-feature-card", uid:"FC1",
                      props:{
                        headline:{ binding:{ type:"repeater",
                                              value:{ repeaterUID:"R2", path:{ headline:{} } } } },
                        body:{     binding:{ type:"repeater",
                                              value:{ repeaterUID:"R2", path:{ body:{} } } } },
                        icon:{     binding:{ type:"repeater",
                                              value:{ repeaterUID:"R2", path:{ icon:{ url:{} } } } } }
                      } }
                  ] } }
```

The card sits **directly inside the Repeater's slot**, no Condition Block in between, because the iteration item has one shape (the group's sub-fields). Each card prop reads from the iteration item via `repeaterUID:"R2"` + the field path on the item.

### Decision rule: which recipe to use

Look at the field's `data_type` on the source CT:

| Field shape | Recipe to use |
|---|---|
| `data_type: "reference"`, `field_metadata.ref_multiple: true` (multi-reference) | Multi-reference recipe, needs `resolvedReferences` + Condition Block |
| `data_type: "reference"`, `field_metadata.ref_multiple: false` (single reference) | Multi-reference recipe minus the Repeater (a single Section drop, not iteration). The reference still needs `resolvedReferences`. |
| `data_type: "group"`, `multiple: true` (group-multiple) | Group-multiple recipe, no `resolvedReferences`, no Condition Block |
| `data_type: "blocks"` (Modular Block) | Multi-reference recipe shape, but Condition Block discriminator is `metadata.condition.type: "modular_block"`, value is the block UID. The MB field itself is inline: it needs **no** `resolvedReferences`. A reference **inside** a block does, and its path must carry the block uid: `blocks.<block_uid>.<ref_field>`. See § Modular Block to reference: the block-uid segment |
| `data_type: "file"`, `multiple: true` (multi-file) | Multi-reference recipe minus `resolvedReferences` (files don't need resolution). Minus Condition Block (one shape). Like group-multiple. Path uses `.0.url` etc. inside each iteration. |
| `data_type: "<any scalar list>"` (array of strings, numbers, etc.) | Group-multiple recipe shape. Each iteration is one scalar. The card might be a single component reading the scalar via repeater scope |

The OPEN doc's P19 captures exactly the group-multiple vs reference split: same iteration shape, different prerequisites (`resolvedReferences` + Condition Block) depending on the source.

## Recipe: Nested Repeaters (a list inside each iterated item)

A Repeater inside another Repeater's iteration, e.g. a footer with multiple **columns**, each column having its own **links** list. The outer Repeater iterates columns. The inner Repeater iterates each column's links. The trick is the inner Repeater's `items` binding: it must reach into the **outer iteration's current item** to find that column's `links` array, which means `type: "repeater"` (with the outer's `repeaterUID`), not `type: "template"`.

### The two binding shifts

| Node | `items` binding `type` | `value` | What it resolves to at runtime |
|---|---|---|---|
| **Outer Repeater** (`R-outer`) | `template` | `{ path: { footer_columns: {} } }` | `dataSources.template.footer_columns` (the array on the parent entry) |
| **Inner Repeater** (`R-inner`) | **`repeater`** | `{ repeaterUID: "R-outer", path: { links: {} } }` | `dataSources.repeater.R-outer.context.links` (each outer iteration's `links` field) |
| **Inner card props** | `repeater` | `{ repeaterUID: "R-inner", path: { label: {} } }` | `dataSources.repeater.R-inner.context.label` (each link's `label`) |

Repeater-scoped bindings resolve as `dataSources.repeater.<repeaterUID>.context.<path>`. So the inner Repeater's items binding correctly reads the outer iteration's current `links`, and the inner card's bindings read each link inside that.

### Assembled

```jsonc
{ "type": "repeater", "uid": "R-outer",
  "metadata": { "mode": "preview" },
  "props": { "items": { "binding": {
    "type": "template",
    "value": { "path": { "footer_columns": {} } }
  } } },
  "slots": { "<R-outer-slot>": [
    /* outer iteration body — one column */
    { "type": "site-column-header", "uid": "CH1",
      "props": { "title": { "binding": {
        "type": "repeater",
        "value": { "repeaterUID": "R-outer", "path": { "heading": {} } }
      } } } },
    { "type": "repeater", "uid": "R-inner",
      "metadata": { "mode": "preview" },
      "props": { "items": { "binding": {
        "type": "repeater",                                      // ← NOT template
        "value": { "repeaterUID": "R-outer",                     // ← outer's UID
                   "path": { "links": {} } }                     // ← path on outer's iteration item
      } } },
      "slots": { "<R-inner-slot>": [
        { "type": "site-footer-link", "uid": "L1",
          "props": {
            "label": { "binding": { "type": "repeater",
                       "value": { "repeaterUID": "R-inner", "path": { "label": {} } } } },
            "href":  { "binding": { "type": "repeater",
                       "value": { "repeaterUID": "R-inner", "path": { "href": {} } } } }
          } }
      ] } }
  ] } }
```

### Source-type combos

| Source-type combo | Extra prerequisites |
|---|---|
| group-multiple (e.g. `footer_columns`) containing group-multiple (`column.links`) | (nothing extra), inline values both ways |
| group-multiple containing multi-reference (e.g. column.related_entries) | Add `data_sources.resolvedReferences` for the nested reference path (e.g. `"root.footer_columns.0.related_entries": ["footer_columns.related_entries"]`). Add Condition Block as immediate child of `R-inner`. |
| multi-reference containing group-multiple (e.g. category.products[].images) | `resolvedReferences` for the outer reference (`root.products`). Condition Block as child of `R-outer`. Inner iteration is over the (inline) `images` group-multiple, no extra prerequisites for `R-inner`. |
| multi-reference containing multi-reference | `resolvedReferences` entries for BOTH the outer reference AND each inner reference path, inner path is `<outer_ref>.<inner_ref>`, with **no** content-type uid between them (§ [Where a reference path must terminate](#reference-path-termination)). Condition Block in both Repeaters. |
| **Modular Block with a reference inside a block** (e.g. `blocks[].feature_block.related_products`) | `resolvedReferences` path must include the **block uid** segment, `"blocks.feature_block.related_products"`, NOT `"blocks.related_products"`. Condition Block per block uid on the Repeater. See § Modular Block to reference: the block-uid segment below. |

The decision tree from the single-level recipes (group-multiple vs reference) applies per Repeater independently: outer's source determines what `R-outer` needs. Inner's source determines what `R-inner` needs.

### Modular Block to reference: the block-uid segment

**The trap:** a Modular Block field whose blocks each contain a reference (`MB → Ref` in every block). A Section linked to the MB renders its blocks, bindings look correct in the picker, and the referenced content inside each block renders nothing.

A modular-block item is shaped `{ <block_uid>: { …fields } }`. That block-uid level does **not** exist for a group-multiple, so the group shape (`footer_columns.related_entries`, one row up) generalizes wrong here: write `blocks.feature_block.related_products`, never `blocks.related_products`.

Omitting the block uid fails silently, for the reason given in § [Where a reference path must terminate](#reference-path-termination). Read that first if this is new to you. It is also where the numeric-prefix and CT-uid rules live.

**Where it goes:** on the **parent template** composition, keyed `"template"`, never on the Section composition, even though the reference is nested inside the Section's linked field. Same placement rule as every other reference iteration (§ Authoring a Section composition: scoping rules).

```jsonc
// Template composition — MB field `blocks`, block uid `feature_block`,
// reference field `related_products` inside that block.
"data_sources": "[{\"uid\":\"template\",\"data\":null,\"resolvedReferences\":{\"template\":[\"blocks.feature_block.related_products\"]}}]"
```

One entry **per block uid** that contains a reference. Blocks are independent shapes, so a second block with its own reference needs its own path.

### The key pitfall

Setting the inner Repeater's `items` binding to `type: "template"` with path `{ footer_columns: { 0: { links: {} } } }` is the **nested-`.0.` trap**, same family as the "all cards identical" trap from #14/P19, but one level up. A fixed index doesn't substitute. Inner repeater would always read column-0's links, so every outer iteration's links list is identical. Use `type: "repeater"` with the outer UID instead.

## Authoring a Section composition: scoping rules (P22-P25)

So far the recipes have been about page-level compositions (Templates). Authoring **Section** compositions via API has its own contract: sections have **no data of their own**, so how they get the right scope at runtime is non-obvious.

### How a Section gets data when placed on a Template: (P22)

A Section composition is data-less when authored standalone (its own canvas has nothing to bind against). It only gets data when **placed inside a Template**. The Template hands it a scoped slice of the page entry.

The SDK's scoping pipeline:

```
Section's dataSources.template = <scoped slice of pageEntry at selectedField, with references resolved>
```

- **`selectedField` empty/absent** makes the section's `template` the **whole page entry** (with any reference following). Use this when a section reads multiple fields off the page.
- **`selectedField` = "products"** makes the section's `template` the **`products` field's value** (an array, with references resolved). Use this when a section iterates one field.
- **`selectedField` = "hero.cta"** (dotted path) traverses. Each segment can drill into nested groups or follow references.
- **`selectedField` does NOT traverse array indices.** The dotted path drills nested Groups and single references, but a **numeric** segment into a multi-value field (`modular_blocks.1.…`, `products.0.…`) resolves the section's `template` to `null` (verified: `section_scoped_data[uid].template` came back `null`, whole section blank). To iterate an array nested inside a Modular Block or at a fixed index, leave `selectedField` **empty** (whole-entry scope) and put the full indexed path on the Repeater's `items` binding instead: `value.path = { "modular_blocks": { "1": { "image_grid": { "image": {} } } } }`. The binding-path flattener keeps numeric keys even though the scoping walk does not. Reserve `selectedField` for top-level Group / reference fields.

This means the section's own canvas always shows **one empty placeholder** (no data exists standalone). That's not a bug. The section only fills out at template-rendering time. (See `build-section` for the UI-side framing.)

### Where `selectedField` is read from: three sources, in priority order (P23)

`collect-data-needs.ts` (runtime) and `sectionInstanceBindings.ts` (editor) BOTH read in this order:

1. **`node.metadata.sectionBindingOverride.selectedField`**: set on the template's `section-composition` node when API-placing the section
2. **`node.metadata.selectedField`**: legacy fallback on the same node
3. **The section's `linked_schemas` default**: declared on the section composition itself: `[{ content_type_uid: "<page-ct>", selected_field: "<field>" }]`

The Studio web UI sets all three correctly when you drag a section onto a template. API authors set them explicitly.

### The `linked_schemas`-as-reference trap (P23)

The compositions CT's `linked_schemas` MUST be a **group-multiple** field, NOT a reference field. If it's a reference field, the CMA **silently drops** any `{content_type_uid, selected_field}` object you `PUT` to it, every read comes back `linked_schemas: []`. The editor reads `linked_schemas` to derive the `UPDATE_SECTION_CONTEXTS` push that scopes each placed section instance. An empty `linked_schemas` means an empty scope push, meaning the editor canvas shows blank repeaters even though `fetchCompositionData` (runtime) renders correctly via the override.

Two outcomes from this:

- **Proper fix:** model `linked_schemas` as a group-multiple on the compositions CT. See `provision-studio-project` for the CT field schema. This makes every UI-driven path work without manual overrides.
- **Runtime escape hatch (if you can't change the CT shape right now):** set `metadata.sectionBindingOverride` on each template's `section-composition` node:
  ```jsonc
  {
    "type": "section-composition",
    "uid": "INST-1",
    "metadata": {
      "compositionUID": "<the-section-composition's-composable_uid>",
      "sectionBindingOverride": { "selectedField": "products" }
    }
  }
  ```
  This makes the runtime/SSR path correct (`collect-data-needs.ts` honors it). The editor canvas will still show blank repeaters until `linked_schemas` is also populated. So this escape hatch covers production rendering but doesn't unblock editor authoring: both must agree.

### The editor vs runtime asymmetry (P23, in detail)

| Path | What it reads | Source file |
|---|---|---|
| **Runtime / SSR** (`sdk.fetchCompositionData`) | `sectionBindingOverride.selectedField` first, then `metadata.selectedField`, then the `linked_schemas` default | `collect-data-needs.ts` |
| **Editor canvas** (live editing in Studio web app) | `UPDATE_SECTION_CONTEXTS` push from the Studio web app, derived from the section's `linked_schemas` field. `sectionBindingOverride` is also honored as an override on top. | `sectionInstanceBindings.ts` + Studio web app messaging |

So you can have a section that renders perfectly on the deployed site (runtime path uses the override) yet shows empty repeaters in the editor (editor path's `linked_schemas` is empty). Both metadata paths must point to the same `selectedField` for editor + runtime to agree.

### Recipe: section iterates one field on the page (P24)

When a section's `selectedField` is set to the iterated field (e.g. `selectedField: "products"` and the section's job is to render one card per product), the section's `dataSources.template` IS the products array. **A top-level Repeater inside the section must bind to scope-root, NOT to `{ path: { products: {} } }`**:

```jsonc
{
  "type": "repeater",
  "uid": "R-section-products",
  "metadata": { "mode": "preview" },
  "props": {
    "items": {
      "binding": {
        "type": "template",
        "value": { "path": {} }      // ← scope-root, NOT { products: {} }
      }
    }
  },
  "slots": {
    "<R-slot>": [
      // ConditionBlock + card here, per the multi-reference recipe;
      // card bindings still use type:"repeater" with repeaterUID
    ]
  }
}
```

`getBindingStringForCS` flattens `{path: {}}` to `""`, so the binding resolves to `dataSources.template` directly. With `selectedField: "products"`, that IS the products array. A path of `{products: {}}` would resolve to `dataSources.template.products`, undefined when the section's template IS the array, not an object containing one.

Reference iterations still need `data_sources.resolvedReferences` on the composition: key `"template"`, value is the array of field paths on the parent entry (e.g. `"template": ["products"]`). The runtime resolves these along the `selectedField` path. You set them on the parent (template) composition, not the section composition.

### Decision rule: single-field repeater section vs whole-entry section (P25)

| Section's job | `selectedField` | Repeater binding (if any) | When to use |
|---|---|---|---|
| One repeater over one field of the page (a card grid, a feature list) | Set to that field (`"products"`) | Scope-root `{ path: {} }` | Most reusable sections: Editions list, Features grid, Card grid |
| A custom component reading several fields off the page entry (header reading brand + nav_links + signin_label. Hero reading the `hero` group) | **Leave unset**: section's `template` is the whole page entry | Original `template.<field>` paths work verbatim | Single-purpose sections with no iteration: Header, Hero, static 3D block |

The choice is data-shape-driven: one field iterated calls for `selectedField` plus a scope-root. Many fields read calls for whole-entry scope and the original paths.

### Verifying a section's scope headlessly (P26 preview)

The section's own canvas can't confirm binding correctness (no data exists standalone). Use the SSR cold-load instead:

```js
const spec = await sdk.fetchCompositionData({ url: "/<some-page-using-the-section>" });
console.log(JSON.stringify(spec.data.section_scoped_data["<instance-uid>"], null, 2));
//   → { selectedField: "products", parentRepeaterUID: null,
//       template: [<resolved entry 1>, <resolved entry 2>, ...] }
```

`spec.data.section_scoped_data[<instance-uid>]` is the runtime resolution: `selectedField` + the actual scoped `template` array. If `template` shows the right array length and right entry sample, the section's scope is correct. If it's `undefined` or wrong-shaped, the bindings won't work.

<a id="section-thumbnails-ui-preview"></a>

## Section thumbnails: (the UI sets it for you. The API never does)

**Symptom:** every API-authored Section shows a blank/placeholder tile in Studio's **Sections** accordion, while UI-authored ones show a picture of the section. Nothing errors.

**Why.** Studio's Sections accordion renders `section.ui_preview.url` (`ComponentTab/SectionsAccordion`: `ui_preview` is a `file` field holding an asset). When an author saves a Section **in the Studio UI**, the app screenshots the canvas node (`GET_NODE_SCREENSHOT`), converts the base64 to a blob, uploads it as an asset, and PUTs `{ entry: { ui_preview: <assetUid> } }` on the composition entry, fire-and-forget, master locale, then invalidates the sections query so the tile appears without a reload. **That whole chain lives in the editor.** A composition entry created by CMA has `ui_preview` empty forever.

Same asymmetry family as `linked_sections` (P27): the UI populates a field behind the scenes, so API authoring must do it explicitly.

### Fix A: zero-script backfill (best when the sections already exist)

Open each Section in Studio and hit **Save**, no edits needed. The screenshot/upload/PUT chain runs on save and backfills `ui_preview` with a real render of the section. Cheapest correct fix, and the thumbnail is an actual screenshot rather than a placeholder. Only worth scripting instead when the section count makes clicking impractical.

### Fix B: pick an image in the Edit Section modal (no canvas render, no script)

Studio's **Edit Section** modal has a preview-image field: open it, **Choose** an existing asset or **Upload** one, Save. That writes `ui_preview` on the entry directly (`useEditSectionComposition`, then `handleImageSelect`, then `handleSubmit`), with no screenshot and no CMA scripting.

Use this when Fix A isn't practical: the section can't render standalone (needs page context), the canvas is slow to load, or you want a designed thumbnail rather than a screenshot of the live section. Trade-off: the image is whatever you pick, so it drifts from the section's real appearance as the section changes. Fix A stays the better default when the section renders cleanly.

### Fix C: set it from the API

Three calls per section. `ui_preview` takes an **asset uid string** on write. It reads back as an asset object with `.url`.

```bash
# 1. Upload the thumbnail asset
curl -X POST "https://<cma-host>/v3/assets" \
  -H "api_key: <stack-api-key>" -H "$CS_AUTH" \
  -F "asset[upload]=@hero-section.png" \
  -F "asset[title]=Hero Section Preview"
# → { "asset": { "uid": "blt<assetUid>", ... } }

# 2. Point the composition entry at it (master locale — compositions are master-only)
curl -X PUT "https://<cma-host>/v3/content_types/<compositions-CT>/entries/<section-entry-uid>" \
  -H "api_key: <stack-api-key>" -H "$CS_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"entry": {"ui_preview": "blt<assetUid>"}}'

# 3. Publish BOTH the asset and the entry to the environment the project targets
```

**Publish the asset too.** An unpublished asset gives the accordion a uid that resolves to nothing, a blank tile again, indistinguishable from never having set the field.

**Precondition:** the compositions CT must carry the `ui_preview` file field. If it's missing, the CMA silently drops the key on write: 201/200 returned, field reads back absent. See [`provision-studio-project`](provision-studio-project.md).

**What to use as the image.** A real screenshot of the rendered section is what the UI produces and what authors expect. A generated placeholder (labelled colour block) is acceptable as a stopgap and still beats a blank tile, but say so rather than presenting it as a preview.

### MANDATORY: a section without `ui_preview` is not finished

This is not a follow-up task or a nice-to-have. **Attaching the thumbnail is part of creating the section**, in the same run, before you report the section as built.

- Write the composition, **immediately** attach `ui_preview`, and only then report success.
- Creating five sections means five thumbnails. Batch the write and the thumbnail together per section, or run `--missing` at the end of the batch. Never move on to the next page while any section you created is blank.
- **Never report "section created" for a section whose `ui_preview` is unset.** Say "created, thumbnail pending" and then finish it.
- If the thumbnail step errors, that is a failure to **report and retry**, not to skip silently. Cosmetic means "does not corrupt data". It does not mean optional.

The symmetric rule for components is `thumbnailUrl` on every `registerComponent` call (see [`register-component`](register-component.md)). Both are rows in [`complete-the-build`](complete-the-build.md), the handover gate. Between the two, **nothing in the Components panel is ever a blank tile**: sections carry `ui_preview`, components carry `thumbnailUrl`.

**How this gets missed in practice** (observed, twice): a build script writes the compositions and the thumbnail is left to a separate command that then does not get run. The sections look finished in every check except the one an author actually sees. Put the thumbnail call inside the build script.

### Fix D: generate one from the composition's own `ui` (scripted, no canvas, no clicking)

```bash
tsx scripts/make-ui-preview.ts --entry <composition-entry-uid>
tsx scripts/make-ui-preview.ts --composable-uid <composable_uid>
tsx scripts/make-ui-preview.ts --missing            # backfill every section lacking one
tsx scripts/make-ui-preview.ts --entry <uid> --dry-run   # render the PNG, upload nothing
```

Decodes the entry's `ui` (`zlib:` + base64), renders a schematic (containers in their real direction and gap, the outermost repeater as three items, media as a framed block, static text as text), screenshots it at 1440×810, uploads it as `<Title> Preview`, and PUTs `ui_preview`. Use it when Fix A is impractical at scale: one live project had **50 of 79 sections** blank, backfilled in a single run.

It sits between Fix B and Fix C: no hand-picked image, no per-section curl, and the result tracks the section's real structure. It is still a schematic, not a render. For a true screenshot of a bound section, Fix A remains better.

**Why not script the canvas screenshot instead.** A section canvas has no preview entry selected (`PREVIEW ENTRY: No preview entry`), so every bound prop renders its registration default. Measured across 11 captures: **0 to 1.2% ink coverage**, content confined to the top 8% of the frame. Uploading those fills the accordion with near-identical "Your headline here" tiles, worse than a blank tile, because they stop reading as empty, and once `ui_preview` is set every capture-when-missing trigger skips that section forever.

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| Posting `ui` as `{ slots: … }` | The `ui` field IS the root node, not a wrapper around one. Without its own `uid` and `type: "page"` the create fails `422 The root node of a composition must have type "page", got "undefined"`, and the message reads like a child-node problem, so the fix gets applied one level too deep | Give `ui` a `uid` and `type: "page"`, put the tree under its `slots`, and point `props.children` at the slot id |
| Reading `static_value` as a map when generating the image | Buckets are arrays of `{key, value, _metadata}` rows, so `sv[type][key]` is always `undefined` and every label silently renders as a placeholder bar | Flatten rows to `key → value` first. `choice` values arrive as single-element arrays |
| Drawing every repeater as three items | A nested repeater iterates a field within one item (a logo, a tag). Three-by-three turns one slide into a nine-column grid | Only the outermost repeater repeats. Nested ones render one item |
| Auditing `ui_preview` coverage over the delivery API | The published list is short: one project read 86 compositions on the CDA vs **122** on the CMA, hiding 36 unpublished sections that were also blank | Audit over the CMA, never the CDA |
| Assuming an unpublished thumbnail always shows blank | Measured otherwise: the accordion loaded unpublished preview assets fine (1440×810, `naturalWidth > 0`), Studio's own save-path upload never publishes either | Publishing still matters for anything reading `ui_preview.url` through the **delivery** API. Verify in the accordion rather than assuming either way |

## Authoring a Template: populate `linked_sections` for every API-placed section (P27)

Sibling concern to P22-P25 (which were section-side). When a Template's `ui` tree contains `section-composition` nodes that were placed via API, the template's **`linked_sections` reference field** ALSO has to be populated, even though SSR walks the nodes directly. Same editor-vs-runtime asymmetry as P23 but at the template layer.

### The asymmetry

| Path | How it discovers placed sections |
|---|---|
| **Editor canvas** (template open in Studio web app) | Loads the template with `?include[]=linked_sections` (resolves the references inline), builds `spec.sectionCompositions` from the resolved `linked_sections` field. If empty, there are no section specs and you get **"Template Did Not Load"** |
| **SSR / runtime** (`sdk.fetchCompositionData`) | Walks the template's `ui` tree looking for `section-composition` nodes. Reads each node's `metadata.compositionUID`. Fetches each section composition separately |

So a template can render perfectly on the deployed site (SSR walks the nodes) yet refuse to open in the editor (`linked_sections` is empty, editor has no specs to resolve the nodes against). **"Template Did Not Load"** in the editor + a passing SSR render = empty `linked_sections`.

### Recipe: populate `linked_sections` when API-placing sections

When your composition-authoring script writes `section-composition` nodes into a template's `ui`, ALSO populate the template entry's `linked_sections` field with a reference per placed section's composition entry:

```jsonc
// Template composition entry (CMA write)
{
  "title": "Product Page",
  "url": "/products/{{entry.title}}",
  "url_metadata": {
    "url_source": "content_type_url_pattern",
    "url_queries": "{\"include\":[],\"only\":{},\"where\":{}}"
  },
  "composable_uid": "product_page_template",
  "connected_content_type": "product",
  "place_composition_as": "page",
  "ui": "zlib:<base64 of the ui tree containing section-composition nodes>",
  "linked_sections": [
    {
      "uid": "<section-A composition entry uid>",
      "_content_type_uid": "<compositions-CT-uid>"     // the project's compositions CT
    },
    {
      "uid": "<section-B composition entry uid>",
      "_content_type_uid": "<compositions-CT-uid>"
    }
    // …one reference per distinct placed section. Dedupe: a section placed
    // multiple times in the same template only needs one entry here.
  ]
}
```

The references can be bare `{uid, _content_type_uid}` stubs. The CMA stores them. The editor's `?include[]=` resolves them inline when loading. There's no UI-only metadata to mirror (unlike P23's `selectedField`).

Then **publish the template entry**. The editor reads from the published entry. An unpublished update won't show up.

### Pre-flight check for an API-authored template

Before you mark a template as ready, verify both paths agree:

```bash
# 1. Editor path — does linked_sections resolve to actual sections?
curl -s "https://<cdn-host>/v3/content_types/<compositions-CT-uid>/entries/<template-entry-uid>?include[]=linked_sections" \
  -H "api_key: <stack-api-key>" -H "access_token: <delivery-token>" \
  | jq '.entry.linked_sections | length, .entry.linked_sections[0].uid'

# 2. SSR path — does fetchCompositionData find the same sections?
#    (Use verify-setup Layer 7's script and dump section_scoped_data; the key count
#     should equal the count of distinct section-composition nodes in the template's ui.)
```

Both must agree:
- If the editor path returns 0 sections but the SSR path returns N, `linked_sections` is not populated. Populate per the recipe above.
- If the editor returns N sections but SSR returns 0, `linked_sections` is set but the `ui` tree has no `section-composition` nodes (probably a separate authoring bug).
- If both return matching N, both paths are wired correctly.

## `section-slot` node shape: the one legitimate empty-slots node

The built-in `section-slot` type declares a **placeholder** inside a section's `ui`. The template that embeds this section then fills the slot via a `section-composition` node (see next recipe: Pattern B). Non-obvious shape:

```jsonc
{
  "type": "section-slot",
  "uid": "SS1",
  "props": {},
  "slots": { "SS1": [] }        // ← key is the node's OWN uid; value is [] until filled
}
```

Two things that trip API authors:

1. **`slots.<own-uid>: []` is required**: the section-slot's own uid appears as the slot key, with an empty array. This is the ONE legitimate exception to the preflight rule "no empty slot arrays". Omitting the entry (no `slots` at all, or `slots: {}`) leaves the template unable to target the slot when composing.
2. **The slot is filled by the TEMPLATE, not the section.** In the section's authored tree the slot stays empty. The template's `section-composition` node carries a `sectionSlotCompositions` map (Pattern B recipe below) that pairs each section-slot uid with the composable_uid of the fill section.

Section slots typically sit inside a Repeater + Condition Block on the wrapper section (Pattern B for reference / MB iteration) or directly under the section root (Pattern B for a simpler single-slot section).

## Recipe: Pattern B (wrapper + `section-slot`, filled by a Simple Section)

Sibling to the multi-reference recipe. Same iteration outcome (one card per reference / MB item), but the leaf content lives in a **separate section composition** rather than in the wrapper's own `ui`. Verified end-to-end for references (Case 8) and modular blocks (Case 9) in `docs/api/sections.md`.

**When to prefer Pattern B over Pattern A (self-contained):**
- Leaf content is reused across multiple wrappers (e.g. an author card shown in blog lists AND author-page hero).
- Leaf content varies per CT and you want each CT's binding tree in its own composition entry.
- You want to swap the fill section per template instance without editing the wrapper.

**Shape overview:**

| Composition | Kind | Role |
|---|---|---|
| Wrapper section | **List Section**: Repeater at root + CB per CT/block, CB slot holds a `section-slot` node | Iterates the reference/MB, emits one slot per item |
| Fill section (one per branch) | **Simple Section**: no root Repeater, `linked_schemas.selected_field` scoped to the reference target CT (or block) | Binds leaf fields |
| Template | Has a `section-composition` node embedding the wrapper. Its `sectionSlotCompositions` pairs the wrapper's section-slot uid with each fill section's `composable_uid` | Wires the slot to the fill |

### Wrapper section: Repeater + CB + section-slot

```jsonc
// ui tree of the wrapper section
{
  "type": "repeater", "uid": "R1",
  "metadata": { "mode": "preview" },
  "props": { "items": { "binding": { "type": "template", "value": { "path": {} } } } },
  "slots": { "<R1-slot>": [
    { "type": "condition-block", "uid": "CB1",
      "metadata": { "condition": { "type": "reference", "value": "author" } },
      "slots": { "<CB1-slot>": [
        { "type": "section-slot", "uid": "SS1",
          "slots": { "SS1": [] } }
      ] } }
  ] } }
```

Wrapper section entry also declares `linked_schemas: [{ content_type_uid: "<parent-CT>", selected_field: "<ref-or-mb-field>" }]` (group-multiple field, see P23).

### Fill section: Simple Section per branch

One fill section per allowed CT (references) or block (MB). No root Repeater. Its top-level node is the leaf component. `linked_schemas.selected_field` names the reference target CT (or block schema path) so the SDK scopes each iteration's item into the section's `dataSources.template`.

```jsonc
// ui tree of the fill section (e.g. author-card)
{
  "type": "author-card", "uid": "AC1",
  "props": {
    "name":  { "binding": { "type": "template", "value": { "path": { "name": {} } } } },
    "photo": { "binding": { "type": "template", "value": { "path": { "photo": { "url": {} } } } } }
  }
}
```

Note the fill section's bindings use `type: "template"` (NOT `type: "repeater"`). The wrapper's SDK scoping already unwraps the iteration item into the fill section's `template` scope.

### Template: node + `sectionSlotCompositions`

The template's `section-composition` node embedding the wrapper carries a `sectionSlotCompositions` map keyed by section-slot uid, whose value is the fill section's `composable_uid`:

```jsonc
{
  "type": "section-composition",
  "uid": "INST-1",
  "metadata": {
    "compositionUID": "<wrapper-section's composable_uid>",
    "sectionSlotCompositions": {
      "SS1": { "compositionUID": "<author-fill-section's composable_uid>" }
      // add one entry per CB branch when references allow multiple CTs; each
      // branch's section-slot gets its own uid, each paired with its own fill
    }
  }
}
```

Also populate the template's `linked_sections` (P27) with references to BOTH the wrapper section entry AND every distinct fill section entry.

### Assembled: reference-iterating wrapper filled by an author fill

```
Wrapper section  linked_schemas: [{ ct: "blog_post", selected_field: "primary_author" }]
  ui: Repeater(items:{path:{}}, mode:"preview")
        └── ConditionBlock(condition:{type:"reference", value:"author"})
              └── section-slot uid:"SS1" slots:{"SS1":[]}

Author fill section  linked_schemas: [{ ct: "blog_post", selected_field: "primary_author" }]
  ui: author-card
        ├── name:  binding template path:{name:{}}
        └── photo: binding template path:{photo:{url:{}}}

Template (blog_post)
  data_sources: [{ uid:"template", resolvedReferences:{ "template":["primary_author"] } }]
  linked_sections: [wrapper-entry-ref, author-fill-entry-ref]
  ui: page → … → section-composition uid:"INST-1"
                    metadata.compositionUID: "<wrapper composable_uid>"
                    metadata.sectionSlotCompositions.SS1.compositionUID: "<author-fill composable_uid>"
```

MB variant (Case 9): swap the CB discriminator to `{ type: "modular_block", value: "<block-uid>" }`. Wrapper's `selected_field` names the MB field. Fill section's `selected_field` names the same MB path plus the block key. Leaf bindings inside the fill section still use `type: "template"`.

## Recipe: Exposed section props (per-instance override)

Some sections need to expose a prop the **template** can override per drop instance, a Card Grid whose column count is set by the page, or a Hero whose tone changes per template. Verified end-to-end (Case 14 in `docs/api/sections.md`).

**Two-sided shape**: section declares the exposure. Template supplies the per-instance value.

### Section side: at the ui ROOT

The exposed-props declaration lives on the section's `ui.metadata` (NOT on the individual node). Each entry names one prop on one node, gives it a stable exposure `uid`, and captures the binding at expose time as a fallback:

```jsonc
{
  "type": "page",
  "uid": "<page-uid>",
  "metadata": {
    "sectionExposedProps": [
      {
        "nodeUid": "CARD1",                    // the node inside the section that owns the prop
        "propKey": "tone",                     // the prop being exposed
        "uid": "exp-tone-1",                   // stable identifier — templates reference this
        "displayName": "Card tone",            // label shown on the template's right panel
        "propType": "choice",                  // the widget kind — matches props.<key>.type
        "bindingAtExposeTime": {               // fallback binding if the template doesn't override
          "type": "static_value",
          "value": "CARD1-tone"
        }
      }
    ]
  },
  "slots": { /* … normal section ui … */ }
}
```

`sectionExposedProps` is on the section's `ui` **ROOT node's `metadata`**, not on the composition entry, and not on the individual node the prop lives on. Getting the placement wrong (on the node, or on the entry) means the template's right panel doesn't render the field.

### Template side: per instance

The template's `section-composition` node carries a `props` map keyed by the exposure `uid`:

```jsonc
{
  "type": "section-composition",
  "uid": "INST-1",
  "metadata": {
    "compositionUID": "<section's composable_uid>",
    "sectionBindingOverride": { "selectedField": "…" }   // (P23 — separate concern)
  },
  "props": {
    "exp-tone-1": {                            // keyed by section's exposure uid
      "type": "choice",                        // must match section's propType
      "binding": {
        "type": "static_value",
        "value": "INST-1-tone-override"        // static_value key on the TEMPLATE entry
      }
    }
  }
}
```

Two things to internalize:

1. **Per-instance uid**: the same section dropped twice on one template = two `section-composition` nodes with **different `uid`s**. Each carries its own `props.<exposed-uid>` map, so each drop can have a different override value.
2. **Static-value keys live on the template entry**, not the section entry. When the override is a static_value, the `binding.value` key is looked up in the **template**'s `static_value.<subtype>[]` bucket (per the two-level lookup rule earlier).

### Fallback resolution

For each exposed prop the SDK resolves in this order at render time:

1. Template's `section-composition.props.<exposure-uid>.binding`: if present, use it.
2. Section's `ui.metadata.sectionExposedProps[…].bindingAtExposeTime`: fallback.
3. Node's own `props.<propKey>.binding` in the section's `ui`: final fallback.

So a section can drop with no override (fallback to expose-time binding) OR with a per-instance override (template controls it). Leaving all three unset means the prop renders as the component's `defaultValue`.

### Verifying an exposed prop

Same as sections generally: SSR cold-load and dump `spec.data.section_scoped_data[<instance-uid>]`. The resolved override appears as the concrete `props.<propKey>` value on the section instance. If it's the fallback, either the template didn't provide an override or the `exposure-uid` doesn't match.

## Never pass the compressed `ui` inline via a shell variable

Silent-corruption trap. The `zlib:<base64>` blob is binary-ish. Interpolating it into a `curl -d "..."` string via a shell variable mutates one byte and the SDK renders a blank canvas with **no error anywhere**: `hasSpec: true`, spec present, SSR looks fine, and every child slot silently resolves empty because the key `"children"` was corrupted to `"c1ildren"` (or similar) throughout the tree. Background colours still paint (from `responsiveStyles`), masking the bug until you inspect the raw HTML.

Always write the full payload to a temp file and POST with `-d @file`:

```bash
python3 -c "import json,zlib,base64; \
  raw = json.dumps(ui_tree); \
  assert '\"c1ildren\"' not in raw, 'corrupt key'; \
  assert raw.count('\"children\"') >= <expected slot count>, 'children count wrong'; \
  compressed = 'zlib:' + base64.b64encode(zlib.compress(raw.encode())).decode(); \
  open('/tmp/entry.json','w').write(json.dumps({'entry': {'ui': compressed, ...}}))"

curl -X POST "<cma-host>/v3/content_types/<uid>/entries" \
  -H "api_key: ..." -H "$CS_AUTH" \
  -H "Content-Type: application/json" \
  -d @/tmp/entry.json
```

The count-assert catches shell corruption **before** compression: once the tree is zlib+base64'd, the corruption is opaque.

**Non-prod hosts + Python.** Against `*.csnonprod.com` (e.g. dev11), Python's `urllib`/`requests` fail SSL verification (`SSLCertVerificationError: unable to get local issuer certificate`), the non-prod chain isn't in the default Python CA store, but `curl` reads the system keychain and succeeds. Rule: use `curl` for the CMA POST/PUT itself. Use Python only to build/assert the payload. If Python HTTP is unavoidable (dev tooling only, never app code), pass a permissive SSL context: `ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE; urllib.request.urlopen(req, context=ctx)`.

## Complete example: a real Freeform composition body

Every field below is what Studio actually stores for a real Freeform composition. Use this shape verbatim when hand-authoring one. The tree is a single `page` root holding a `doc-hero` component, which holds a `doc-product-card` in the hero's `"Actions"` slot, all bound with `static_value` keys.

### The `ui` tree (inflated, before `zlib+base64`)

```json
{
  "uid": "mZfkYLfEsk28cuV",
  "type": "page",
  "attrs": {},
  "metadata": {},
  "styles": {},
  "props": {
    "children": { "type": "slot", "slot": "lW5KA7MYsHQxdHC" }
  },
  "slots": {
    "lW5KA7MYsHQxdHC": [
      {
        "uid": "mHjnXsgKbBlj_PZ",
        "type": "doc-hero",
        "attrs": {},
        "metadata": { "slotNames": { "7Opc3nDCi1wwpyy": "Actions" } },
        "styles": { "default": { "classes": [""], "responsiveStyles": { "default": {} } } },
        "props": {
          "headline": { "type": "string",   "binding": { "type": "static_value", "value": "mHjnXsgKbBlj_PZ-headline" } },
          "subhead":  { "type": "string",   "binding": { "type": "static_value", "value": "mHjnXsgKbBlj_PZ-subhead"  } },
          "cover":    { "type": "imageurl", "binding": { "type": "static_value", "value": "mHjnXsgKbBlj_PZ-cover"    } },
          "ctaLabel": { "type": "string",   "binding": { "type": "static_value", "value": "mHjnXsgKbBlj_PZ-ctaLabel" } },
          "ctaHref":  { "type": "href",     "binding": { "type": "static_value", "value": "mHjnXsgKbBlj_PZ-ctaHref"  } },
          "children": { "type": "slot", "slot": "7Opc3nDCi1wwpyy" }
        },
        "slots": {
          "7Opc3nDCi1wwpyy": [
            {
              "uid": "Wo-7Ly0xHXWsOXQ",
              "type": "doc-product-card",
              "attrs": {},
              "metadata": {},
              "styles": { "default": { "classes": [""], "responsiveStyles": { "default": {} } } },
              "props": {
                "title":   { "type": "string",   "binding": { "type": "static_value", "value": "Wo-7Ly0xHXWsOXQ-title"   } },
                "image":   { "type": "imageurl", "binding": { "type": "static_value", "value": "Wo-7Ly0xHXWsOXQ-image"   } },
                "price":   { "type": "number",   "binding": { "type": "static_value", "value": "Wo-7Ly0xHXWsOXQ-price"   } },
                "badge":   { "type": "choice",   "binding": { "type": "static_value", "value": "Wo-7Ly0xHXWsOXQ-badge"   } },
                "ctaHref": { "type": "href",     "binding": { "type": "static_value", "value": "Wo-7Ly0xHXWsOXQ-ctaHref" } }
              },
              "slots": {}
            }
          ]
        }
      }
    ]
  }
}
```

Notes on the tree that aren't in the recipe examples above:
- Every node carries `attrs`, `metadata`, `styles`, `props`, `slots`, even when empty (`{}`). Studio writes them. You should too.
- The root's `type` is `"page"`, the built-in Page system component. Freeform / Connected templates wrap their content in this root.
- `props.children.type: "slot"` + `props.children.slot: "<slot-uid>"`: declares that this node's children live in the matching key inside `slots`. Same pattern on nested slot-owning components.
- `metadata.slotNames.<slot-uid>: "<author-visible name>"`: components with named slots (like `doc-hero`'s `"Actions"` slot) register the label here so the canvas shows it.
- Each `props.<name>.type` (`"string"`, `"imageurl"`, `"number"`, `"href"`, `"choice"`) is the widget kind. It **must match** the sub-bucket of `entry.static_value` the resolver looks in (see the two-level-lookup rule above).

### The full CMA POST body

The `ui` value on the wire is the tree above, JSON-stringified, `zlib.compress`ed, base64-encoded, and prefixed with `zlib:`. The rest of the entry:

```json
{
  "entry": {
    "title": "Spring 2026 Landing",
    "composable_uid": "spring_2026_landing",
    "connected_content_type": "",
    "url": "/campaigns/spring-2026",
    "url_metadata": {
      "url_source": "user_specified_pattern",
      "url_queries": "{\"include\":[],\"only\":{},\"where\":{}}"
    },
    "place_composition_as": "page",
    "schema_version": "1.0.0",
    "data_sources": "[]",
    "linked_schemas": [],
    "linked_sections": [],
    "static_value": {
      "text": [
        { "key": "mHjnXsgKbBlj_PZ-headline", "value": "Welcome to Studio" },
        { "key": "mHjnXsgKbBlj_PZ-ctaLabel", "value": "" },
        { "key": "Wo-7Ly0xHXWsOXQ-title",    "value": "Studio Pro" }
      ],
      "textarea": [
        { "key": "mHjnXsgKbBlj_PZ-subhead", "value": "Visual composition for content teams — using the React components your engineering already built." }
      ],
      "imageurl": [
        { "key": "mHjnXsgKbBlj_PZ-cover",  "value": "" },
        { "key": "Wo-7Ly0xHXWsOXQ-image", "value": "" }
      ],
      "href": [
        { "key": "mHjnXsgKbBlj_PZ-ctaHref", "value": "" },
        { "key": "Wo-7Ly0xHXWsOXQ-ctaHref", "value": "https://example.com" }
      ],
      "number": [
        { "key": "Wo-7Ly0xHXWsOXQ-price", "value": 49 }
      ],
      "choice": [
        { "key": "Wo-7Ly0xHXWsOXQ-badge", "value": [] }
      ],
      "array":     [],
      "boolean":   [],
      "any":       [],
      "datestring":[],
      "json_rte":  [],
      "html_rte":  [],
      "object":    [],
      "ui": "zlib:eNqtlFtvgjAUgP9L…"
    }
  }
}
```

Studio-generated `_metadata.uid` on each `static_value.*` entry is added by the CMA on write. Do not populate it yourself.

### Python builder: produces the exact body above

Paste into a `.py` file, fill the two `<…>` placeholders, run against a fresh entry uid:

```python
import base64, json, urllib.parse, zlib

UI_TREE = { ...the tree from § "The ui tree" above... }
COMPOSITION_ENTRY_UID = "<15-char CMA entry uid you'll POST to>"   # optional if using composable_uid slug

raw = json.dumps(UI_TREE, separators=(",", ":"))
assert raw.count('"children"') >= 2, "children key corrupted before compression"
compressed = "zlib:" + base64.b64encode(zlib.compress(raw.encode())).decode()

body = {
  "entry": {
    "title": "Spring 2026 Landing",
    "composable_uid": "spring_2026_landing",
    "connected_content_type": "",
    "url": "/campaigns/spring-2026",
    "url_metadata": {
      # Freeform + hand-chosen path → user_specified_pattern.
      # Connected template → "content_type_url_pattern". NEVER omit this block.
      "url_source": "user_specified_pattern",
      "url_queries": json.dumps({"include": [], "only": {}, "where": {}}),  # JSON STRING on the wire
    },
    "place_composition_as": "page",
    "schema_version": "1.0.0",
    "data_sources": "[]",
    "linked_schemas": [],
    "linked_sections": [],
    "static_value": {
      "text":     [{"key": "mHjnXsgKbBlj_PZ-headline", "value": "Welcome to Studio"}, ...],
      "textarea": [{"key": "mHjnXsgKbBlj_PZ-subhead",  "value": "…"}],
      "imageurl": [{"key": "mHjnXsgKbBlj_PZ-cover",    "value": ""}, ...],
      "href":     [{"key": "mHjnXsgKbBlj_PZ-ctaHref",  "value": ""}, ...],
      "number":   [{"key": "Wo-7Ly0xHXWsOXQ-price",    "value": 49}],
      "choice":   [{"key": "Wo-7Ly0xHXWsOXQ-badge",    "value": []}],
      "array": [], "boolean": [], "any": [], "datestring": [],
      "json_rte": [], "html_rte": [], "object": [],
    },
    "ui": compressed,
  }
}

open("/tmp/entry.json", "w").write(json.dumps(body))
```

Then POST with `curl -d @file` (never `-d "..."`, see § Never pass the compressed `ui` inline):

```bash
curl -X POST "https://<cma-host>/v3/content_types/documentation_compositions/entries" \
  -H "api_key: <stack-api-key>" -H "$CS_AUTH" \
  -H "Content-Type: application/json" \
  -d @/tmp/entry.json
```

Publish the entry after create. See § Sanity-check the output below.

## Preflight: validate the `ui` tree before publishing

The SDK's runtime renderer walks the composition node tree and throws on certain malformed shapes. An unpublishable error reaches the editor BEFORE you see it (`TypeError: Cannot read properties of undefined (reading 'slots')` + `Cannot find a descendant at path [...] in node`), and the entire composition's render aborts: every section after the throw goes blank. The most common cause is an empty Section Slot. Skill's duty is to **never emit one** in the first place.

Before calling `POST /v3/.../entries` (or `PUT` on update), walk the inflated `ui` tree and assert:

- [ ] **Every `slots[<slot_uid>]` value is a non-empty array**, no `{ "<uid>": [] }` entries. Either populate the slot with at least one node, OR remove the slot from the parent's `slots` object entirely.
- [ ] **No node references a removed descendant**: every uid mentioned in a parent's `slots` array maps to an actual node in the tree. (Common when refactoring: removing a node but leaving its uid in a parent's slot array.)
- [ ] **Every Repeater has `metadata.mode: "preview"` AND a Condition Block child (for reference / modular block iteration).** Missing either silently renders zero iterations.
- [ ] **Every Section Slot inside the iteration has its child Section's node in place**. See `build-repeating-section` § Step 6.

Cross-check matches the renderer-side symptom row in [`troubleshoot-canvas`](troubleshoot-canvas.md) (the "Whole composition renders blank or partially blank" row). The runtime crash should never reach the user. That's a Studio bug, but emitting a clean tree avoids it deterministically.

If publishing through a script, gate the publish call behind these assertions and fail loudly. A composition with an empty slot is invalid. Do not emit one.

## Migrating compositions between stacks: uid, index, and schema remaps

Copying compositions from a source stack (a dev/staging stack, another project) to a destination is NOT a byte copy. The entry JSON carries three classes of stack-bound values that MUST be rewritten, or the composition writes cleanly, resolves in the SSR fetch, and still renders blank or errors in the canvas. All three are verified live (from dev11 to NA prod).

### 1. `composable_uid` must be RE-DERIVED to each destination entry's NEW uid: not carried over

Studio's invariant is `composable_uid == entry uid`. On the destination, `POST` gives each section a **new** entry uid, so its `composable_uid` must be updated to that new uid, and every reference to it rewritten. Preserve the source `composable_uid` and you hit a **split failure that looks like it works**:

- **SSR `fetchCompositionData` resolves fine**: it matches sections by `composable_uid`, which you preserved. `sectionCompositions` comes back fully populated. Everything looks correct server-side.
- **The canvas + client renderer break**: they key the section registry by **entry `uid`**, not `composable_uid`. The template's `section-composition` nodes reference sections by `metadata.compositionUID` (= the source uid), which matches no destination entry uid, so you get **`Component with type '<uid>' is not registered`**, once per section, in the canvas and the client render.

The fix (do all three, in order):
1. Create each section on the destination. Capture its new entry uid.
2. `PUT` each section's `composable_uid` = its own new entry uid.
3. In the template: rewrite every `ui` `section-composition` node's `metadata.compositionUID` from the source uid to the destination uid, and set `linked_sections` to the destination uids (`{uid, _content_type_uid}`, the compositions CT). Publish.

`linked_sections` is a **reference field storing entry uids**: those are always stack-specific and always need remapping (see § Authoring a Template: populate `linked_sections`). `metadata.compositionUID` inside the `ui` is what the client resolves by, so it must match the new uid too.

### 2. Block-index paths must be remapped when the destination CT's field ORDER differs

Bindings into an ordered multi-value field bake the index into the path: `{ modular_blocks: { "2": { image_grid: {} } } }`. If the destination entry orders those blocks differently (an extra block inserted, a different author order), every baked index points at the wrong block, which produces wrong data or a blank. Before writing, diff the source vs destination entry's block order and rewrite each index in the `ui` binding paths (the path flattener keeps numeric keys, so a global `old→new` index map over `modular_blocks.<N>` is enough).

### 3. Binding paths + `selected_field` must match the DESTINATION CT's schema, not the source's

The same logical field can sit at a different path across stacks (schema drift): a hero image at `image` in one stack, `image_options.image` in another. A migrated binding of `hero.0.image.url` silently resolves to nothing on a stack whose `hero_banner` nests the file under `image_options`. Symptom: text/scalar props render (their paths matched) but one field is blank. Verify each bound path against the destination CT schema (`GET /v3/content_types/<ct>`), and fix the drifted ones. Same for `linked_schemas.selected_field`.

### 4. Assets are stack-scoped

File/image fields reference asset uids that don't exist on the destination. Either re-upload the assets to the destination (raw multipart `POST /v3/assets`, then publish) and re-point the fields, or bind to existing destination assets. A migrated composition whose entry data still points at source-stack asset uids renders with broken/blank media.

### Pre-flight for a cross-stack migration

Verify BOTH paths, exactly as § Authoring a Template prescribes: SSR resolves (fetch returns the sections) **and** the canvas opens without `not registered` errors. The uid remap (#1) is the one that passes SSR and fails the canvas, so an SSR-only check is not enough.

## Acceptance

This skill succeeds only when ALL are true.

- [ ] The composition entry was created with `composable_uid` = the entry uid, published.
- [ ] For a cross-stack migration: `composable_uid` was re-derived to each destination entry's new uid, and the template's `ui` `compositionUID`s + `linked_sections` were remapped to the destination uids (not carried over from the source).
- [ ] **Every `place_composition_as: "page"` entry has BOTH `url` and `url_metadata`**, `url_source` matching how the pattern is derived (`content_type_url_pattern` for Connected, `default_url_pattern` / `user_specified_pattern` for Freeform), `url_queries` as a JSON string. **Read the entry back after the write** and confirm `url_metadata` is present: a compositions CT missing the group makes the CMA drop it silently, leaving the composition on `legacy_url`.
- [ ] `data_sources.resolvedReferences` is set per reference field the composition iterates.
- [ ] Every Repeater node has `metadata.mode: "preview"` (for canvas iteration).
- [ ] Every Repeater iterating a reference or modular block has a Condition Block as its immediate child.
- [ ] Card / iteration child bindings use `type: "repeater"` with `repeaterUID`, NOT `type: "template"` with `.0.<field>` fixed-index paths.
- [ ] **Every Section composition created in this run has `ui_preview` set, verified by re-reading each entry.** A section with a blank tile is an unfinished section. Do not report the work as done. Also true of sections created as a side effect (clones, rescopes, batch builds).
- [ ] **Every Section composition has `ui_preview` set**, an uploaded, **published** asset uid, verified by re-reading the entry (`.entry.ui_preview.url` resolves). Blank tiles in Studio's Sections accordion otherwise. Fastest fix is often opening each section in Studio and pressing Save. See § [Section thumbnails](#section-thumbnails-ui-preview)
- [ ] **Envelope complete**: every node in the written tree has all seven keys (`uid`, `type`, `props`, `metadata`, `slots`, `attrs`, `styles`), verified by re-reading the entry. A missing `slots` renders fine and white-screens the Data tab later.
- [ ] **Preflight passed**: every `slots[<uid>]` is a non-empty array (exception: `section-slot` nodes carry `slots: { "<own-uid>": [] }` by design). No orphan descendant references in the tree.
- [ ] **Pattern B (if used)**: wrapper section has `section-slot` node with `slots:{"<own-uid>":[]}`. Fill section's leaf bindings use `type:"template"` (NOT `repeater`). Template's `section-composition` node has `metadata.sectionSlotCompositions.<slot-uid>.compositionUID`. Template's `linked_sections` includes BOTH wrapper and fill entries.
- [ ] **Exposed section props (if used)**: `sectionExposedProps` array on section's `ui` ROOT `metadata`. Template's `section-composition.props` map keyed by each exposure's `uid`. Per-instance override values use distinct static_value keys.
- [ ] The composition resolves at runtime, verified by either curl against the CDA preview API (returns 200 + entries body, see `troubleshoot-canvas` § CORS error on the CDA preview host) OR a SSR cold-load `await sdk.fetchCompositionData({ url })` returning `spec.data.section_scoped_data[<instance>]` with the expected `template` array (P26-style verification).

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Rebuilding a template's root slot from a fresh node list | Sibling nodes that sat beside the main one (a closing CTA band, a comparison table, a content list) are dropped. The page still renders, so nothing flags it | Rebuild from the newest version whose root slot holds no `section-composition` node, and carry every sibling across as its own Section |
| Deriving a composition title by stripping a suffix from a scope name | Two scopes collapse to one title. Titles are unique per project, so the second create returns `409` and that Section is missing from the template | Keep the title 1:1 with the scope it is rooted at |
| Creating a Section and placing it in the same pass without publishing | The Section resolves to nothing at delivery and the page renders `Component with type '<uid>' is not registered` | Publish every Section before the Template that references it. See [`complete-the-build`](complete-the-build.md) |
| Missing `data_sources.resolvedReferences` | Repeater renders 0 items, reference stubs never materialise | Add the resolution map entry: `{ uid:"template", resolvedReferences: { "root.<refField>": ["<refField>"] } }` |
| Authoring from the registration without reading the component source | The registration lists prop names and options but not how they are consumed. A prop that overrides another, or is compared by equality, discards correct values with no error | Open the component file for every component you author. See § Read the component source before authoring |
| A list-wrapped `choice` hitting a strict equality check in component code | `['auto'] !== 'auto'` is true, so an override branch fires and the props it guards are dropped, `justify` silently stops working | Leave equality-compared props unwritten so the component's string default applies. Report the array-handling bug to the library owner |
| Composing atomically without reading how the composite derives its values | A composite computes child values from its own scheme: `isDark ? 'medium' : 'light'`. Hand-authoring the same tree with the atom defaults gets colours wrong in a way that looks plausible | Treat the composite's derivation logic as the specification. See § Read the component source before authoring point 3 |
| Authoring the prop the registration advertises rather than the one the component reads | A media atom exposing both `url` and `media` uses only `media?.url`. A `url`-only node renders nothing at all and reads as a missing design element | Read the component's first lines: early returns name the prop it actually requires |
| Writing an `object` or `array` value as a real structure | Those buckets store a **JSON string**. A real object fails the whole entry with `422 static_value.object.N.value is not text` | `json.dumps` the value before writing |
| Relying on `height: 100%` inside a composition | The SDK wraps every node in its own unstyled `<div>`. That wrapper collapses to content height, so `100%` resolves against the wrapper, not the card, measured 324px inside a 472px card | Use an **explicit px height** on the container that must distribute. It does not depend on the wrapper |
| Assuming a card primitive's own `justify-between` will distribute your nodes | The padded inner element of a card component is often `justify: normal`, and it is inside the component where no prop reaches it. Children pack at the top however they are nested | Put one stack inside with an explicit height (card height minus the component's own padding) and set `justify` on that |
| Setting `justify: between` on a container with no height | Distribution needs free space. A card whose height was removed to avoid clipping packs its children at the top, so CTAs sit at ragged heights instead of pinned to the bottom | Give the container the comp's height. Note that `height: 100%` may not chain through the SDK's per-node wrapper divs |
| Setting `justify` on a row that has no width | `justify` distributes free space. A shrink-wrapped row has none, so the value applies and nothing moves. A parent stack with `align: start` shrink-wraps its children | Give the row a width and the parent `align: stretch`. Measure the rendered box, not the stored prop |
| A numeric value written into the `number` bucket as a string | The bucket is strictly typed: the CMA rejects the whole entry with `422 static_value.number.N.value is not number`. Easy to hit when defaults are parsed out of source, where `1` arrives as `"1"` | Coerce to a real int/float before writing. Only `choice` wraps in a list. `number` stays a bare number |
| Using a decorative shape primitive as an in-flow rule or divider | Its wrapper is `position:absolute; inset:0`, so it takes no space and pins to the section, not the card. It measures correct and renders in the wrong place: four stacked indicators read as one stray white line over the heading | Read the component first. Verify the rendered box sits inside its intended parent, not just that its size and colour match |
| Reporting a value as impossible without checking for a free-form primitive | A `Deviations` row that says impossible stops anyone looking again, so an expressible value stays unbuilt indefinitely | Search the registry for shape/box primitives with raw CSS `color` / `width` / `height` first |
| `choice` value stored as a bare string instead of a list | **Renders correctly**: the canvas is right and every visual check passes, but the Settings panel matches it against the registered `options`, finds nothing, and shows `Select…`. The author re-picks a value that was already set | `"value": ["h1"]`. Only `choice` wraps. Boolean/text/number stay scalar. See § Node anatomy point 0a |
| Writing only the props the design dictates | Every other registered prop shows **blank** in Studio's Settings panel, so an author has to pick each dropdown by hand: the API author's omission becomes someone else's manual work | Write every registered prop: comp value, else the registration's own `defaultValue`. See § Node anatomy point 0b |
| Nodes with no `metadata.title` | The Layers tree shows repeated type names (`Stack / Box` ×6) and cannot be navigated | Give each node a purpose-name: `Stack — Card content`, `CTA — Read the full story` |
| Leaf node authored without `metadata` / `slots` | Whole canvas shows `Component Loading Error — Cannot read properties of undefined (reading 'visible')`. Nothing paints and the message names no node | Every node carries the full envelope, `"metadata": {}` and `"slots": {}` included. See § Node anatomy point 0 |
| `static_value` items written without their `key` (or the bucket omitted entirely) | CMA returns `200`. Every affected prop renders its registration `defaultValue`, so the section looks like an intentional placeholder skeleton | Write `{key, value}` pairs into the bucket matching each prop's declared `type`, then read back and resolve every key. See § Verify the write |
| Design props left unwritten on an API-authored section | Section renders with the library's defaults, not the comp: a stack defaults to `column`, so side-by-side CTAs stack. No error | Author design props explicitly, skeleton or not. See § Skeleton first, bind later |
| Card prop bindings use `template` type at `<refField>.0.<field>` (fixed `.0.` index) | EVERY iteration renders item 0, all cards identical (the worst kind: looks "correct" with a single-item list, fails as soon as the list grows) | Use `repeater` type with `repeaterUID`, path relative to the iteration item, no index |
| Repeater node missing `metadata.mode: "preview"` | Canvas shows 1 placeholder iteration. Production still renders N | Set `metadata.mode: "preview"` on the Repeater node |
| Missing Condition Block child of Repeater (reference / modular-block iteration) | Iteration silently fails to resolve child bindings | Insert a Condition Block per allowed type (CT for refs, block UID for modular blocks) |
| Writing `url` on a template composition but omitting `url_metadata` ("minimal envelope") | **Nothing fails.** The CMA returns 201, the live route returns 200, delivery resolves off the `url` pattern alone, so the omission survives review. But Studio has no derivation to read, treats the composition as `legacy_url`, and the editor's Edit-URL panel shows the pattern as an opaque hand-typed string instead of "derived from the connected CT". The CT link is lost the first time an author edits the URL, and `legacy_url` matching (entry `url` field, leading slash, every entry) is stricter than what the pattern was written for | Always write the pair. For Connected on a page-type CT, use `url_source: "content_type_url_pattern"`. For a Freeform identity URL, use `default_url_pattern`. For a Freeform hand-chosen path, use `user_specified_pattern`. `url_queries` is a JSON string. See § [`url` + `url_metadata`: a matched pair](#url-metadata-matched-pair) |
| Compositions CT has no `url_metadata` group (or is missing the `url_source` / `url_queries` sub-fields) | CMA **silently drops** the object: 201 returned, entry reads back with no `url_metadata`, same `legacy_url` outcome as omitting it, with no error to trace | Verify the CT models `url_metadata` as a group with both text sub-fields (see `provision-studio-project`). Read the entry back after the first write and assert `url_metadata.url_source` is what you sent |
| Setting `url_source: "user_specified_pattern"` on a **Connected** template via the API | Reverts: `url_queries` is only generated by the UI's Edit-URL then Save flow, and Studio re-derives from the CT pattern on editor load | Make the CT a page type (`is_page: true` + CT `url_pattern`), then use `content_type_url_pattern` with `{{entry.x}}` in the composition `url`. `user_specified_pattern` on the API path is for Freeform only |
| API-authored Section with no `ui_preview` | Blank/placeholder tile in Studio's Sections accordion for every section, while UI-authored sections show a picture. Silent: the editor screenshots + uploads + PUTs `ui_preview` on save, and that chain only exists in the UI | Re-save each section in Studio (backfills automatically), or upload an asset + `PUT {"entry":{"ui_preview":"<assetUid>"}}` + publish **both** asset and entry. See § [Section thumbnails](#section-thumbnails-ui-preview) |
| `ui_preview` set to an unpublished asset uid | Same blank tile: the accordion resolves `ui_preview.url` against the delivery environment and gets nothing. Looks identical to never setting the field | Publish the asset to the environment the Studio project targets, not just the entry |
| `composable_uid` not equal to the CMA entry uid | "Composition Not Found": canvas link uses entry uid, resolution uses `composable_uid` | Set `composable_uid` = the entry uid before publishing |
| Authored composition is unpublished | Not visible in compositions list. Can't load in canvas | Publish the entry. Studio queries by `composable_uid` AND published state |
| `linked_schemas` modeled as a reference field on the compositions CT instead of group-multiple | Section's `selectedField` derived from `linked_schemas` is always empty, so section scope is unset and repeaters render blank in the editor (P23). Runtime may still work via `sectionBindingOverride`. | Ensure compositions CT models `linked_schemas` as a group-multiple, see `provision-studio-project` |
| Treating this skill as a UI-authoring guide | Wastes time. Introduces shape inconsistencies | Use only for headless / scripted / seed / migration work. For interactive authoring, the Data Picker writes every shape correctly. |
| Cross-stack migration: carrying over the source `composable_uid` instead of re-deriving to the destination entry uid | SSR resolves (matches by `composable_uid`) but the canvas + client render fail (per section) because they key by entry `uid`. Looks like it works until you open the editor | Re-derive each section's `composable_uid` to its new destination uid. Rewrite the template's `ui` `compositionUID`s + `linked_sections` to the destination uids. See § Migrating compositions between stacks |
| Cross-stack migration: copying binding index paths / `selected_field` verbatim | Destination CT may order blocks differently or nest a field elsewhere (`image` vs `image_options.image`), which produces the wrong block or a blank field, with no error | Diff source vs destination CT schema + entry block order. Remap indices and field paths before writing |
| Binding into a **single reference** field's NESTED asset (e.g. `hero.0.image_options.image.url`) without listing the reference in `data_sources.resolvedReferences` | Scalars on the referenced entry may resolve (heading/body render) but the **nested file/asset** does not, so the binding returns `undefined` and the image is blank, with no error | Add the reference path to `resolvedReferences.template` (e.g. `"hero"`, and the nested `"hero.image_options.image"`) so the SDK deep-resolves it. Then bind `…image_options.image.url`. The file field resolves to an object with `.url`, matching the production component. One instance of the general rule: § [Where a reference path must terminate](#reference-path-termination) |
| Linking a **DAM / Assets-Manager** asset (`am…` uid, `parent_uid`) to a `file` field via **OAuth Bearer** CMA write | Rejected with `422 "is not a valid upload."`: the Bearer app-token grant can't link DAM assets, even though the asset exists + is published | Use a **session `authtoken`** for the write (it succeeds), or link via the DAM/asset picker in the UI. Note: DAM assets also emit a `/spaces/…` **preview** delivery URL that 404s in Live Preview while the published CDA emits `images.contentstack.io/…`, see `troubleshoot-canvas` |
| Placing bindings directly on the node instead of `props.<propName>.binding` | The SDK can't find the binding, so the prop renders with `defaultValue` or empty | Always wrap: `"props": { "<propName>": { "binding": { type:…, value:{…} } } }`. |
| Using `children: [...]` instead of `slots: { <slot-uid>: [...] }` for child nodes | Children invisible to the renderer. Canvas renders the parent as empty | Use `slots`. Each slot has a uid. See node anatomy above. |
| Placing Condition Block's discriminator on the node as `condition: {...}` instead of `metadata: { condition: {...} }` | Discriminator ignored. Iteration item's type can't be narrowed. Bindings inside fail to resolve | Put `condition` inside `metadata`. Same pattern as Repeater's `metadata.mode`. |
| Adding `resolvedReferences` for a group-multiple iteration | No harm (the SDK ignores it for non-references), but creates noise + makes the composition look more complex than it is | Skip `resolvedReferences` for group-multiple, multi-file, and scalar-list iteration. Only references need it. |
| Adding a Condition Block for group-multiple iteration | The block has no discriminator to apply. Runtime behavior may be inconsistent | Skip the Condition Block for group-multiple. Place the iteration child directly in the Repeater's slot. |
| Using `uid` instead of `queryUID` in a `contentstack_queries` binding value | Pinned-query result never resolves | Use `queryUID: "<pinned-query-uid>"`. |
| Inner Repeater's `items` binding uses `type: "template"` with a nested-`.0.` path (e.g. `{ footer_columns: { 0: { links: {} } } }`) | Every outer iteration's inner-repeater reads column-0's links, all inner lists identical. The nested-`.0.` family of the P19 trap, one level up. | Inner Repeater's `items` MUST use `type: "repeater"` with `repeaterUID: "<outer-uid>"` and path `{ <field-on-outer-iteration>: {} }`. Then inner card bindings use the inner Repeater's UID. |
| Compositions CT models `linked_schemas` as a reference field instead of group-multiple (P23) | CMA silently drops the `{content_type_uid, selected_field}` object on every `PUT` (`linked_schemas` reads back as `[]`), editor canvas shows blank repeaters on placed sections even though runtime works correctly | Model `linked_schemas` as a group-multiple on the compositions CT (see `provision-studio-project`). As a temporary runtime-only fix, set `sectionBindingOverride.selectedField` on each `section-composition` node, but the editor canvas won't render correctly until `linked_schemas` is also fixed. |
| A section iterates `selectedField` and its top-level Repeater binds `{ path: { <field>: {} } }` instead of scope-root `{ path: {} }` (P24) | Repeater renders nothing: `dataSources.template` IS the array (re-scoped via selectedField). `template.<field>` is undefined | Use scope-root `{ path: {} }` for the top-level Repeater inside a `selectedField`-scoped section. Leaf bindings inside still use `repeater` type with `repeaterUID`. |
| Setting `selectedField` on a section that reads multiple page fields (Header reading brand + nav_links + signin_label. Hero reading the `hero` group) | Section loses access to the fields outside the scoped one, they resolve to undefined | Leave `selectedField` unset for multi-field sections. `template` becomes the whole page entry. Original `template.<field>` paths work verbatim. |
| Authoring a section by API and expecting its own canvas to confirm scope | Section canvas has no data. One empty placeholder is normal | Verify via SSR cold-load: `await sdk.fetchCompositionData({ url })` then dump `spec.data.section_scoped_data[<instance-uid>]`. That's the runtime truth. |
| API-placing a section in a template's `ui` without populating the template's `linked_sections` field (P27) | **"Template Did Not Load"** in the Studio editor, BUT the deployed site renders the template correctly via SSR: the editor needs the `?include[]=linked_sections` resolution to build `spec.sectionCompositions`. SSR walks the section-composition nodes directly so it works either way | When writing `section-composition` nodes into a template's `ui`, also populate the template entry's `linked_sections` field with `[{ uid: "<section-comp-entry-uid>", _content_type_uid: "<compositions-CT-uid>" }, …]`, one entry per distinct placed section (dedupe: a section placed multiple times needs only one reference). Publish the template entry. |
| Passing the compressed `ui` inline via a shell variable in `curl -d "..."` | Blank canvas, no error, spec present, `hasSpec: true`, but every slot resolves empty because shell interpolation mutated `"children"` into `"c1ildren"` throughout the tree | Write payload to a temp file, POST with `-d @file`. Assert `raw.count('"children"') >= <expected>` before compressing. See § Never pass the compressed `ui` inline above. |
| Using Python `urllib`/`requests` for CMA calls against `*.csnonprod.com` (dev11 etc.) | `SSLCertVerificationError: unable to get local issuer certificate`, the non-prod chain isn't in Python's default CA store. `curl` reads the system keychain and works | Use `curl` for the HTTP call. Keep Python for payload build + assertions only. If Python HTTP is unavoidable (dev tooling), pass a permissive `ssl.create_default_context()` with `check_hostname=False` + `verify_mode=CERT_NONE`. Never do this in app code |
| `section-slot` node written without `slots: { "<own-uid>": [] }` (empty-array entry keyed by the node's own uid) | Template's `sectionSlotCompositions` has no target to fill: canvas renders the wrapper with no slot placeholder. SSR resolves the slot as absent | Every `section-slot` node needs `slots: { "<own-uid>": [] }`, the one legitimate empty-array exception to the preflight rule. See § `section-slot` node shape |
| Pattern B fill section's leaf bindings use `type: "repeater"` with the wrapper's `repeaterUID` | Bindings resolve to `undefined`: the wrapper's SDK scoping already unwraps the iteration item into the fill section's `template`. The wrapper's repeater scope isn't visible inside the fill section | Fill section's leaf bindings use `type: "template"` with paths relative to the reference target CT / block schema. Only the WRAPPER section uses repeater-scope bindings inside its own tree |
| Pattern B template drops the section-composition without a `sectionSlotCompositions` map | Wrapper renders its Repeater + CB but each iteration's section-slot has no fill, placeholder shows blank | Populate `metadata.sectionSlotCompositions.<section-slot-uid>.compositionUID` with each fill section's `composable_uid` on the template's `section-composition` node. Add the fill section entry to the template's `linked_sections` |
| Exposed-prop declaration placed on the individual node's `metadata.sectionExposedProps` or on the composition entry, instead of `ui.metadata.sectionExposedProps` at the ui ROOT | Template's right panel doesn't render the field. Overrides never get read | Place `sectionExposedProps` on the section's `ui` ROOT node's `metadata` (the top-level `page` node). It's an array of `{nodeUid, propKey, uid, displayName, propType, bindingAtExposeTime}`, one entry per exposure. See § Recipe: Exposed section props |
| Template's `section-composition.props.<uid>` key uses the section's node uid or prop key instead of the exposure `uid` | Override never matches: SDK looks up by exposure `uid`. When unmatched it falls back to `bindingAtExposeTime`, which looks like the section is ignoring the template | Key the template's `section-composition.props` map by the `uid` field from the section's `sectionExposedProps` entry (e.g. `"exp-tone-1"`), NOT by nodeUid or propKey |
| Same section dropped twice on a template shares one override value | Both instances render with the same override, user expected per-instance control | Each drop is a separate `section-composition` node with its own `uid`. Each carries its own `props.<exposure-uid>` map. Static-value keys should also differ per instance (e.g. `INST-1-tone`, `INST-2-tone`) so the template's `static_value.<subtype>` bucket stores each independently |
| API-authoring a `json_rte` embedded-entry `reference` node with `attrs` missing `locale` | CMA rejects with `"Reference must contain content-type-uid, entry-uid, locale and display-type."` at write time. SDK read path doesn't need `locale` (derived from context) so this only surfaces on POST/PUT | Every embed reference node needs `attrs: { type: "entry", "entry-uid": "…", "content-type-uid": "…", "display-type": "block"\|"inline"\|"link", "locale": "en-us" }`. Applies to both node-level `json_rte` prop values and `static_value.json_rte[*].value` embeds. See [`register-json-rte`](register-json-rte.md) pitfall row |

## Sanity-check the output

After authoring, verify by ONE of:

1. **CDA preview API curl**: confirm the composition is returned. See `troubleshoot-canvas` § CORS error on the CDA preview host for the curl shape. Status 200 + JSON entries body = the contract resolves.
2. **SSR cold-load**: `await sdk.fetchCompositionData({ url })` from a throwaway server route. It **rejects** if the URL resolves to nothing, so a thrown `COMPOSITION_NOT_FOUND_BY_URL` / `PREVIEW_ENTRY_NOT_FOUND` here is itself the verification result: the composition isn't resolving. In a throwaway script that's fine. In app code wrap it ([`configure-csr-vs-ssr`](configure-csr-vs-ssr.md#resolve-composition-helper)). Dump `spec.data.section_scoped_data[<instance>]` to verify each section's `selectedField` + scoped `template` arrives correctly. The most reliable check.
3. **Decode the stored `ui`**: the read-only `zlib`-inflate snippet in `troubleshoot-canvas` § Diagnostic tooling. Diff your composition's node tree against a known-working UI-authored one to spot any shape mismatch. Useful for debugging.

## See also

- `troubleshoot-canvas` § Diagnostic tooling (inspecting a stored composition's ui) the zlib decoder
- `troubleshoot-canvas` § CORS error on the CDA preview host: preview-token verification curl shape
- `use-repeater`: UI authoring side. The Preview Mode toggle the API directly sets via `metadata.mode`
- `use-condition-block`: the Condition Block schema requirement for reference / modular-block iteration
- `build-section`: section's `selectedField` scoping (the parent of most API-authored sections)
- `understand-auto-binding`: the UI mechanism that writes these shapes for UI authors
- `provision-studio-project` (planned): compositions CT field schema, including `linked_schemas` as group-multiple
- `troubleshoot-data-binding`: the "registered as lazy but not loaded yet" error class
