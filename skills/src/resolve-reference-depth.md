---
name: resolve-reference-depth
---

## When to use

Resolve a reference chain one hop at a time by declaring each hop's path, and stop at a human checkpoint the moment a path cannot be derived. Covers both mechanisms that must line up (the fetch's `include[]` and Studio's `data_sources.resolvedReferences`), why `include_all_depth` measured as inert, and what to ask for when the schema runs out of answers.

Use when a field behind a reference renders blank and the reference chain is more than one hop: a card that references an author who references an organisation, a block whose reference points at an entry that itself references an asset group. Phrases: "reference inside a reference is empty", "nested reference not resolving", "the logo is inside a group inside a reference", "reference inside a modular block inside a group", "the field is buried four groups deep", "how deep can references go", "how many levels of reference does Contentstack support", "include_all_depth", "error_code 141", "include reference paths processing limit", "the data is two references deep". Do NOT use for a single-hop reference (bind it per [`build-section`](build-section.md)), for a reference that resolves to `[]` (that is absent content, not depth, see § Step 0), or to diagnose why one declared path is wrong (that is [`troubleshoot-data-binding`](troubleshoot-data-binding.md) rows on mis-terminated paths).

# Resolve a reference chain hop by hop, then ask

## Context

Three things decide whether a reference arrives, and they are not the same knob:

| Mechanism | Wire parameter | Ceiling |
|---|---|---|
| `data_sources.resolvedReferences` | becomes **`include[]`** on the bound-entry fetch | no depth cap. Every hop's path must be declared and correctly terminated |
| Field projection | **`only[<ref>][]`** | dropped automatically when the request URL would exceed ~15 000 chars |
| `include_all_depth` | one number, resolves everything to that depth | **5** org-wide, and lower per entry in practice |
| `include_reference` | explicit paths on the fetch | **3 levels** for a multi-content-type reference field |

**Which one the runtime actually uses matters more than the ceilings.** The SDK fetches bound page content with `include[]` + `only[]` and **no depth parameter at all**. References arrive because their path was declared, not because a number was raised. `include_all_depth` appears only on the fetch for composition/section entries.

`include_all_depth` was therefore **not** used as this skill's ladder, and when measured it turned out not to work at all (see § The ladder). **The fix is a declared path**, never a bigger number: the number is not in the production request to raise, and on the stack measured it changed nothing anywhere.

A chain fails if either the fetch never retrieved the entry or the composition never declared the path. Both present as the same thing downstream: a blank field.

## Why this matters

Digging deeper is neither free nor always correct. Each declared path multiplies the payload and consumes the per-request reference-path budget, and no amount of depth fixes an entry that is genuinely empty in the environment being served. Left to itself an agent will keep raising a number until the API rejects it (or, worse, until it does not) and report "resolved" when the request merely got wider and the field is still blank.

So when the schema stops answering, the next move is a question, not a retry. **Ask for the path or the entry. Bind exactly what comes back.** The checkpoint is the point of this skill.

## The ladder

**`include_all_depth` cannot be trusted to do anything: measure it, never assume it.** On one stack measured, an entry on a five-hop chain returned byte-identical payloads at 1, 2, 3, 4, 5, 6 and 10: same bytes, same stubs, no error at any value, and no effect layered on top of declared paths. It may behave differently on the stack in front of you. **So probe it once (Step 2b) rather than either trusting it or writing it off.**

**What actually resolves a hop is a declared path, and every hop needs its own.** Same entry, same environment:

| Declared | Real stubs left | Bytes |
|---|---|---|
| nothing | 11 | 9,699 |
| hop 1 | 12 | 62,052 |
| hop 1 + hop 2 (`….author`) | 11 | 63,955 |
| hop 1 + hop 2 + `….category` | 10 | 64,405 |

One declared path buys exactly one hop. Nothing cascades.

So the ladder is not a depth counter. It is: **derive the path, declare it, and when the path cannot be derived, ask.**

| Pass | What you do | If data still missing |
|---|---|---|
| 1 | Declare every hop you can derive **from the schema**, then fetch once | **Continue automatically**: deriving costs one schema read |
| 2 | For each remaining stub, resolve its target CT and declare the next hop | **Continue** while each next hop is derivable, there is no depth number to stop at |
| 3 | A stub whose path you cannot derive: ambiguous multi-CT reference, a target you cannot see, or a chain that leaves this stack | **Ask the user.** Never guess, never re-root on your own |

**Ask only where the next step is unbounded or hard to undo.** Passes 1 and 2 are neither: the schema states the path, so deriving it is bounded work with one right answer, and stopping to ask spends the user's attention on something you can look up. Pass 3 is different. There is no schema answer left, so a guess is a guess. That is where the checkpoint belongs.

**Do not escalate depth as a substitute for asking.** Raising a number that the measurement above shows is inert, then reporting "resolved", is the exact failure this skill exists to prevent.

### Two signals that depth is finished

**A plateau.** When a pass returns exactly what the previous one did, the remaining stubs are not reachable by depth from this root. Measured: an entry held the same three unresolved paths at depths 2, 3 and 4 without moving.

A plateau has two causes and they need opposite responses: the chain continues past what the schema can derive (a Step 3 question), or the targets are not published in this environment (absent content, nothing to ask about). **Run the stub probe from Step 0 to tell them apart before prompting anyone.** In every measured case it was the second, and a prompt would have been the wrong move.

**`141`.** Same conclusion, reached by error rather than by plateau.

### Depth counts reference hops. Groups and blocks are free.

Nesting inside the same entry (groups, group-multiples, modular blocks, blocks within blocks) costs **no depth at all**. Only a hop into another entry does. This is the single most common reason a chain is diagnosed wrongly.

Measured on a real page entry. This path is nine segments and crosses two modular-block levels, two block uids and a group:

```
page_blocks . slider_block . cards . card_with_image . card . detail_blocks . info_card . partner_group . partner
    ↑MB          ↑block       ↑MB       ↑block        ↑REF      ↑MB           ↑block      ↑group       ↑REF
```

It contains exactly **two reference hops**, and it resolved completely at `include_all_depth: 2`, stub at 1, resolved at 2, unchanged at 3. Nine segments, depth two.

**So a value buried four groups deep inside an entry inside an entry is depth 2, not depth 6.** If it renders blank, no amount of extra depth will fix it, and raising the number only spends the path budget until it returns `141`.

The blank field in that situation is almost always the declared path instead: every group and block segment must appear in it, the block uid included, with reference-target CT uids dropped. Those four shapes and their exact terminations are canonical in [`author-composition-via-api`](author-composition-via-api.md#reference-path-termination): the path rules live there, the depth ladder lives here, and the two failures look identical from the outside.

**Count hops from the schema, not from the dots.** Walk the content type: each segment whose field is `data_type: "reference"` is one hop. Group, blocks and block-uid segments are zero. The hop count is the depth you need. The full segment list is the path you must declare.

### Stub count is not a progress bar

The number of unresolved references can **rise** while you are succeeding, because resolving one level exposes the stubs at the next. Measured on two entries: 39, then 34, then **45** across three passes, while resolved references went 72, then 111, then 140. And 11 rose to **12** on declaring a single hop that added 52KB of content.

So never report progress as "stubs went down", and never stop because they went up. Track the specific paths the binding actually needs, and report those by name.

## Task

### Step 0: Classify before digging. Only the first of these five states is a depth problem

Read the raw value at the deepest point that did resolve:

| What you see | What it means | Response |
|---|---|---|
| `{ "uid": "…" }` and nothing else | Either the fetch never went deep enough, its path was never declared, **or the target entry is not published in this environment**, all three look identical | Run the **stub probe** below before spending a pass |
| **Every** reference in the response is a stub, all at once | The request URL overflowed. `only[]` is dropped first (a `[studio-sdk] Skipping only[] projections` warning). If `include[]` alone still overflows, the fetch 414s and falls back to no includes, so nothing resolves | Not a depth problem. Reduce the request: fewer declared paths, re-root, or split the fetch |
| `{ "uid": "…" }`, and fetching that uid directly returns no entry | The reference points at an entry that is not published (or not accessible) in this environment | **Not** a depth problem. No depth and no re-root will fill it. Publish the target or switch environment |
| `[]` | The reference field is genuinely empty for this entry in this environment | **Not** a depth problem. No depth will fill it. Say so and stop. Check the entry, the environment, and whether the target is published |
| Field absent entirely | The path was never requested, a declaration gap, not a depth gap | Declare the path (see [`author-composition-via-api`](author-composition-via-api.md) § Where a reference path must terminate), then re-run pass 1 |

**The stub probe.** A stub carries `_content_type_uid` and `uid`, so it costs one cheap request to find out which kind it is:

```
GET /v3/content_types/<stub._content_type_uid>/entries
      ?environment=<env>&query={"uid":"<stub.uid>"}
```

If an entry comes back, the target exists and the stub is a depth or path problem. Continue the ladder. **If nothing comes back, the target is not published in this environment, and no amount of depth will ever resolve it.** Measured: an entry that plateaued at three unresolved paths across depths 2, 3 and 4 turned out to have all three pointing at unpublished targets, depth was never the fault, and each further pass would have cost payload for nothing.

Run the probe on one representative stub per distinct target content type, not per occurrence.

Never open a checkpoint for any row but the first. Offering to dig deeper for absent content sends the user to approve work that cannot succeed.

### Step 1: Derive every path you can, then fetch once

Walk the content type. Each segment whose field is `data_type: "reference"` is a hop. Group, blocks and block-uid segments are free. Declare **every** derivable hop in one request rather than one per pass, each costs a path, not a round trip.

Declare the same paths in the composition's `resolvedReferences`. A fetch that includes a path the composition never declared still renders blank, and the two failures are indistinguishable from outside.

**Use schema paths, not payload paths.** The payload carries array indices (`sections.1.resources.cards.0.reference_card.card_category.0.author.0`) and `include[]` takes the schema shape with the indices dropped: `sections.resources.cards.reference_card.card_category.author`. Copying the path out of the response is the most common way this silently declares nothing.

### Step 2: Walk the remaining stubs outward

For each stub still present, read its `_content_type_uid`, look that CT up, and declare the next hop. Repeat while the next hop is derivable. Stop when the stub set stops shrinking.

**There is no depth limit to stop at: the walk runs until the schema has nothing left to give.** It goes exactly as deep as the data does, which is why it needs no ceiling: measured across three entries it converged in a single round at 2, 2 and 3 hops, each time because nothing further was derivable rather than because a cap was hit. The only thing that can cut it short is the request budget, and that is answered by splitting (Step 2b.3), not by stopping.

**`_metadata` objects are not stubs.** They are uid-only and match every naive stub detector. Measured on one entry: 28 apparent stubs, of which **17 were `_metadata`**, a detector that counts them reports a chain as unresolved forever. Exclude them before deciding anything.

**Stub count is not a progress bar. It can rise while you are succeeding.** Declaring hop 1 above took the count from 11 to 12 while adding 52KB of resolved content, because resolving one hop exposes the stubs one hop further out.

### Step 2b: Exhaust the automated options before you ask

**Asking is the last resort, not the second one.** Three things are still free to try, and all three are bounded. Do them before Step 3.

**0. Declare the stub's own path before anything beyond it.** A stub at payload path `P` is resolved by declaring `P` itself, not by declaring the fields of the content type it points at. Declaring only the hops past a stub leaves the stub exactly as it was, and the pass looks like it accomplished nothing. Measured: on one entry this mistake held the count at 8 stubs and pushed 7 of them to the user as questions. Declaring each stub's own path first took the same entry to 1, and that survivor was unpublished: **0 questions**.

**1. Union over every candidate CT.** A reference field with several `reference_to` targets holds a different content type per entry, so the next hop differs per entry too. Walking only the CT this entry happens to hold under-declares for every other one. Declare the next hop for **every** candidate.

**2. Probe `include_all_depth` once, on this stack.** One A/B fetch, same paths, with and without it. Identical bytes and identical stub count means inert here. Spend nothing more on it. Anything different means it helps on this stack, so keep it. Measure. Never assume either way.

**3. Split the request when the budget bites.** Exhaustive expansion overruns the request long before it runs out of schema: measured, a full schema closure produced **153** candidate paths where the entry accepted **27**. So expand toward the paths that actually carry a stub, and when a set returns `141` or `414`, **split it across two fetches and merge** rather than giving up or asking.

**No entry is not zero stubs.** A fetch that returns `200` with an empty `entries` array reports zero stubs and zero bytes, identical to a fully resolved page. It means the content type has no entry in this environment, which is a Step 0 classification, not a success. Check an entry came back before reading any count.

**A failed request is not an empty result.** A `414` returns no body: zero stubs, zero bytes. Counting stubs alone reports it as total success. Check `r.ok` first. This is the single easiest way to conclude "nothing left to resolve" from a request that never ran.

Only when all three are exhausted, and stubs remain, continue to Step 3.

### Step 3: Re-probe, then ask. Do not guess, do not re-root unasked

When a stub's path cannot be derived, **ask the user**. This is the checkpoint, and it replaces the old "raise the depth / re-root" behaviour.

**Re-run the Step 0 stub probe on each survivor first.** A stub that outlived every derivable path is more often unpublished than unreachable, and the two are byte-identical in the response. Fetch the stub's uid directly on the **delivery** API for the target environment:

- **`422`** (or `entry not found`) means the target is **not published in this environment**. That is absent content, not a path. Report it as such. Asking for an include path cannot fix it, and spends the user's attention on a wrong question.
- **`200`** means genuinely reachable but undeclared. This one is worth asking about.

Measured on one real chain: Steps 1 to 2 took 8 stubs down to 1, and that survivor probed `422` with `publish_details: (NONE)`. Every stub that reached Step 3 in that run was absent content, asking about any of them would have been wrong.

Cross-check on the management API if you need certainty: it ignores publish state, so a `200` there plus a `422` on delivery is conclusive.

Only for the survivors that probe `200`, give the user what you know and ask for the smallest thing that unblocks you:

```
Can't resolve this binding.

  Field        : <the prop that is blank>
  Payload path : <blocks>.1.<block>.<list>.0.<ref_field>.0.<next_ref>.0
  Target CT    : <target_content_type>
  Entry        : <uid> (stub — uid only)
  Tried        : include[]=<blocks>.<block>.<list>.<ref_field>
                 (resolved hop 1; this hop is one level further)

Give me any ONE of:
  1. the include path to declare  — e.g. sections.resources.cards.reference_card.card_category.author
  2. the entry uid to bind to directly, and I will root a fetch at it
  3. the depth, if you know the chain is longer than the schema shows
```

Then **bind exactly what they give you.** A supplied path goes straight into `include[]` and `resolvedReferences`. A supplied entry uid becomes the root of its own fetch, stitched onto the chain. No further digging, no extra levels "while we're here".

Ask once per report, not once per stub. Gather every unresolved path on the page into a single prompt. A page with several deep chains otherwise interrupts the user repeatedly.

### Step 4: Non-interactive runs

With no human to ask (CI, a seed pipeline, a scripted provisioner) do not guess and do not dig. Silent digging in automation is how a job passes while the page is still blank.

- declare every **derivable** hop (Steps 1 to 2). That part needs no human
- perform **zero** guesses and **zero** re-roots
- stop at the first stub that would need Step 3, and report it in the Step 3 format so a human can answer it later

A caller may configure more. What automation must never do is treat "no human present" as permission to keep going.

## `error_code 141`: always the same cause, never "go deeper"

`141` means the request asked for more reference paths than it is allowed to carry.

**It is a request-size limit, not a path count. Do not plan around "100 paths".** Measured on one stack, the same entry accepted **27** declared paths and returned `141` at **28**, with the request URL at ~2.5KB. Paths on that entry ranged from 23 to 372 characters, so the count at which it breaks moves with how long your paths are: a few deeply-nested paths exhaust it as fast as many shallow ones. Past that, an even longer request stops returning `141` and starts returning **`414`**, a transport failure with an empty body, which is easy to misread as "resolved nothing".

**Always check `r.ok` before reading a response.** A `414` and a genuinely empty result look identical if you only count stubs.

The fix is the same in every case: **ask for fewer paths.**

- **Split**: run two or more fetches, each carrying part of the path set, and merge.
- **Narrow**: declare only the chains the binding actually needs, not the schema's full closure.
- **Re-root**: fetch the deepest resolved entry as a new root so the request carries only the sub-chain. Unbounded, so it needs the user (Step 3).

What is never the fix is raising a depth number. A `141` does not become a success one level deeper.

## Acceptance

- [ ] Every unresolved path was classified per Step 0 (including the stub probe) before anything deeper was proposed.
- [ ] Required hops were counted from the schema, not from path segments. Group and block nesting adds none.
- [ ] `include[]` used **schema** paths with array indices stripped, not paths copied out of the payload.
- [ ] `_metadata` objects were excluded before any stub was counted or reported.
- [ ] Every derivable hop was declared without prompting. The first prompt came only at a path that could not be derived.
- [ ] Each stub's own path was declared before any hop beyond it.
- [ ] An empty `entries` array was classified as "no entry in this environment", never counted as zero stubs.
- [ ] Every candidate CT of a multi-target reference was expanded, not only the one this entry held.
- [ ] `include_all_depth` was A/B probed once on this stack rather than assumed inert or assumed working.
- [ ] A `141`/`414` was answered by splitting or narrowing the path set, never by asking the user or by raising a depth.
- [ ] `r.ok` was checked before any response was counted. A `414` was never read as "nothing left to resolve".
- [ ] Each surviving stub was re-probed on the delivery API before any prompt, `422` reported as unpublished/absent, only `200` escalated to the user.
- [ ] That prompt named the field, the payload path, the target CT, the stub uid and what was already tried, and offered path / entry / depth as the three ways to answer.
- [ ] What the user supplied was bound exactly as given: no extra levels, no unrequested re-root.
- [ ] One report covering every unresolved path, not one per section or per stub.
- [ ] A non-interactive run declared derivable hops, then stopped at the first path needing a human, zero guesses, zero re-roots.
- [ ] The fix landed as a declared `resolvedReferences` path (`include[]`), never as a raised depth number.
- [ ] `include_all_depth` was not credited with a fix unless re-measured on that stack. It measured inert on the one tested.
- [ ] The final report names each path as resolved, absent (`[]`), or still unresolved, never "resolved" for a path that merely stopped erroring.

## Common pitfalls

| Pitfall | Why it bites | Fix |
|---|---|---|
| Treating `[]` as "not deep enough" | No depth fills genuinely empty content. The user approves passes that cannot succeed | Classify per Step 0 first. Report absent content as absent |
| Tuning `include_all_depth` to fix a page | The bound-entry fetch carries `include[]` and `only[]` and no depth parameter, the number being raised is not in that request | Use depth to diagnose. Fix by declaring the path, which becomes `include[]` |
| Trusting `include_all_depth` to resolve anything | Measured inert on a real stack: identical bytes at 1 to 6 and 10, no error, and no effect on top of declared paths | Declare a path per hop. Re-measure before relying on the parameter |
| Answering a `141` by raising the depth | `141` means too many reference paths. One more level asks for strictly more | Narrow the declared set, or ask which paths actually matter |
| Reading a falling stub count as progress | Resolving one level exposes the stubs one hop further out, and `_metadata` objects inflate the count, measured 17 of 28 | Exclude `_metadata`. Track the paths the binding needs, by name |
| Deepening the fetch but not declaring the path | The entry is fetched and the field still renders blank, so the fix looks like it failed | Advance both mechanisms in the same pass |
| Prompting per stub, or per section | Spends the user's attention on decisions the schema already answers | Declare every derivable hop, then ask once, for everything still stuck |
| Raising depth because the value is deeply nested in groups or blocks | Same-entry nesting costs no depth. The number climbs until `141` while the real fault is an undeclared or mis-terminated path | Count reference hops from the schema. Fix the path, not the depth |
| Reading an unpublished target as "not deep enough" | An unresolvable stub and a too-shallow stub are byte-identical. Digging and re-rooting both fail forever | Probe the stub's uid directly. No entry returned means publish state, not depth |
| Declaring hops past a stub instead of the stub's own path | The stub is resolved by its own path. Declaring the target CT's fields leaves it untouched and the pass looks like a no-op | Declare `P` first, then anything beyond `P` |
| Reading an empty `entries` array as a resolved page | Zero stubs and zero bytes look identical to full success | Confirm an entry came back before counting anything |
| Reading a `414` as "nothing to resolve" | The response has no body, so stub and byte counts are both zero, indistinguishable from success unless `r.ok` is checked | Check `r.ok` first. On `414` split the path set and retry |
| Declaring the schema's full closure | Expansion overruns the request long before the schema runs out, measured 153 candidate paths against a 27-path ceiling | Expand toward paths that carry a real stub. Split when the budget bites |
| Expanding only the CT this entry happens to hold | A multi-target reference holds a different CT per entry, so the next hop is under-declared for every other entry | Union the next hop over every `reference_to` candidate |
| Asking the user about a stub that is merely unpublished | The survivor of every derivable path looks like a missing path, but probes `422` with `publish_details: (NONE)`. Measured, the only stub reaching Step 3 was this | Re-run the stub probe before prompting. Report `422` as absent content |
| Guessing a path, or re-rooting, instead of asking | A guessed path silently declares nothing, and a re-root has no natural end, both look like progress and produce a blank field | At an underivable path, stop and ask for path / entry / depth (Step 3) |
| Digging silently in automation | The job passes, the page is blank, and nothing recorded which path was missing | Declare derivable hops, then stop and report in the Step 3 format |

## See also

- [`troubleshoot-data-binding`](troubleshoot-data-binding.md): why one declared path resolves empty (mis-terminated paths, block-uid segments)
- [`author-composition-via-api`](author-composition-via-api.md) § Where a reference path must terminate: the four path shapes and where each one ends
- [`build-section`](build-section.md): binding a single-hop reference
- [`understand-linked-schemas`](understand-linked-schemas.md): how a Section's scope decides which references are addressable at all
