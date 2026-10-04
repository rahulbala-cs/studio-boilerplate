/**
 * Authoring composition trees over the CMA.
 *
 * Studio's Data Picker writes these shapes for you when a human authors in the
 * UI. This file is the manual contract, used here so the whole boilerplate can be
 * rebuilt from scratch by running a script.
 *
 * Four rules that fail SILENTLY if you get them wrong, and that everything below
 * exists to enforce:
 *
 *  1. Every node carries all seven keys — uid, type, props, metadata, slots,
 *     attrs, styles — even when empty. A missing `metadata` or `slots` blanks
 *     the canvas or breaks Studio's panels.
 *  2. A container must ALSO point `props.children` at its own slot id. Children
 *     sitting in `slots` alone never render — a Repeater will happily iterate and
 *     clone zero children.
 *  3. A `choice` value is stored as a LIST (["h2"]). Every other type is scalar.
 *     A bare string renders correctly and then shows "Select…" in the panel, so
 *     an author re-picks a value that was already set.
 *  4. Every `static_value` binding is a KEY into the entry's static_value bucket
 *     for that prop's type — write the pair, or the prop silently falls back to
 *     its registration default and looks like an intentional placeholder.
 */
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { cma } from './cma.mjs';
import { STACK_API_KEY, COMPOSITIONS_CT, ENVIRONMENT, LOCALE } from './config.mjs';

/** Deterministic 15-char node ids, so re-running produces the same tree. */
export function nid(...parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('base64url');
  return h.slice(0, 15);
}

/** "a.b.0.c" -> { a: { b: { 0: { c: {} } } } } — the nested-leaf path shape. */
export function toPath(path) {
  if (!path) return {};
  return path
    .split('.')
    .reverse()
    .reduce((acc, seg) => ({ [seg]: acc }), {});
}

// ─── Bindings ────────────────────────────────────────────────────────────────
/** Reads a field on the page entry (or on the section's scoped slice of it). */
export const tmpl = (path) => ({ type: 'template', value: { path: toPath(path) } });
/** Reads a field on the CURRENT ITEM of the named Repeater. Never use a fixed
 *  `.0.` index here: it is not substituted, so every iteration renders item 0. */
export const rep = (repeaterUID, path) => ({
  type: 'repeater',
  value: { repeaterUID, path: toPath(path) },
});
/** Reads a field on ONE specific entry the composition pins in its own
 *  `data_sources` (Studio's Data tab → Additional Entry Data). The page has no
 *  say in it, which is the point for site-wide content like the header. */
export const pinned = (contentTypeUid, entryUid, path) => ({
  type: 'contentstack',
  value: { _content_type_uid: contentTypeUid, uid: entryUid, path: toPath(path) },
});
/** The `data_sources` value that pins entries to a composition. */
export const pinnedEntries = (contentTypeUid, entryUids) =>
  JSON.stringify([
    {
      uid: 'contentstack',
      data: entryUids.map((uid) => ({ uid, _content_type_uid: contentTypeUid })),
      resolvedReferences: Object.fromEntries(entryUids.map((uid) => [uid, []])),
    },
  ]);
/** A literal. The value itself lives in the entry's static_value bucket. */
export const stat = (key) => ({ type: 'static_value', value: key });

/** Collects static literals into the 13 typed buckets the entry needs. */
export class StaticValues {
  constructor() {
    this.buckets = {
      text: [],
      html_rte: [],
      array: [],
      object: [],
      number: [],
      href: [],
      textarea: [],
      any: [],
      json_rte: [],
      datestring: [],
      boolean: [],
      imageurl: [],
      choice: [],
    };
  }
  /** Returns the binding for a literal, registering the value under a key. */
  add(nodeUid, propName, type, value) {
    const bucket = BUCKET_FOR[type];
    if (!bucket) throw new Error(`No static_value bucket for prop type "${type}"`);
    const key = `${nodeUid}-${propName}`;
    // Only `choice` wraps in a list. Everything else stays scalar.
    const stored = type === 'choice' ? (Array.isArray(value) ? value : [value]) : value;
    this.buckets[bucket].push({ key, value: stored });
    return stat(key);
  }
  toEntryField() {
    return this.buckets;
  }
}

/** Widget type -> static_value bucket. Getting this wrong means the resolver
 *  looks in the wrong bucket, misses, and renders the registration default. */
const BUCKET_FOR = {
  string: 'text',
  plaintext: 'text',
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  boolean: 'boolean',
  choice: 'choice',
  href: 'href',
  imageurl: 'imageurl',
  datestring: 'datestring',
  json_rte: 'json_rte',
  html_rte: 'html_rte',
  array: 'array',
  object: 'object',
  any: 'any',
};

// ─── Nodes ───────────────────────────────────────────────────────────────────
/**
 * Build one node with the full seven-key envelope.
 * `children` implies a slot: we mint the slot id, put the children under it, AND
 * wire props.children at it — rule 2 above, in one place so it cannot be missed.
 */
export function node(type, uid, { title, props = {}, metadata = {}, children, classes = [] } = {}) {
  const n = {
    uid,
    type,
    attrs: {},
    metadata: {
      // Studio reads `title` as the Layers-panel label. Without it the tree reads
      // as repeated type names and cannot be navigated.
      ...(title ? { title } : {}),
      visible: true,
      locked: false,
      ...metadata,
    },
    // Node-level classes reach the DOM through the component's merged
    // `className`. This is how a Section styles one instance without forking the
    // component it is styling.
    styles: {
      default: { classes: classes.length ? classes : [''], responsiveStyles: { default: {} } },
    },
    props: { ...props },
    slots: {},
  };
  if (children) {
    const slotId = `${uid}-s`;
    n.props.children = { type: 'slot', slot: slotId };
    n.slots[slotId] = children;
  }
  return n;
}

/** The root. Every composition's `ui` IS this node, not a wrapper around it. */
export function page(uid, children, { exposedProps = [] } = {}) {
  const n = node('page', uid, { children });
  n.metadata.sectionExposedProps = exposedProps;
  return n;
}

/**
 * A section-slot: a declared swap point inside a Section.
 *
 * It is the ONE node allowed an empty slot array, keyed by its OWN uid — that is
 * how the placeholder declares itself. The Template fills it by putting a real
 * section-composition node under the same key on its placement node.
 *
 * `defaultSectionUid` gives the slot a default fill, so the Section is never
 * empty on the canvas even before a template author chooses something.
 */
export function sectionSlot(uid, label, statics, defaultSectionUid) {
  const n = node('section-slot', uid, {
    title: label,
    props: { label: { type: 'string', binding: statics.add(uid, 'label', 'string', label) } },
    metadata: defaultSectionUid ? { defaultSection: { uid: defaultSectionUid } } : {},
  });
  n.slots[uid] = [];
  return n;
}

// ─── Validation: run BEFORE the write, not after the bug report ──────────────
const REQUIRED_KEYS = ['uid', 'type', 'props', 'metadata', 'slots', 'attrs', 'styles'];

export function validateTree(tree) {
  const problems = [];
  const seen = new Set();
  (function walk(n, path) {
    if (!n || typeof n !== 'object') return;
    for (const k of REQUIRED_KEYS) {
      if (n[k] === undefined || n[k] === null) problems.push(`${path}: missing "${k}"`);
    }
    if (seen.has(n.uid)) problems.push(`${path}: duplicate node uid "${n.uid}"`);
    seen.add(n.uid);

    const slots = n.slots ?? {};
    for (const [slotId, arr] of Object.entries(slots)) {
      if (!Array.isArray(arr)) {
        problems.push(`${path}: slot "${slotId}" is not an array`);
        continue;
      }
      // An empty slot array crashes the renderer — except on a section-slot,
      // where it is how the placeholder declares itself.
      if (arr.length === 0 && n.type !== 'section-slot') {
        problems.push(`${path}: empty slot "${slotId}" (would blank the composition)`);
      }
      const pointer = n.props?.children?.slot;
      // A section-composition's slots are slot FILLS keyed by the wrapper's
      // section-slot uid, not a children pointer — exempt them.
      if (
        arr.length &&
        n.type !== 'section-slot' &&
        n.type !== 'section-composition' &&
        pointer !== slotId
      ) {
        problems.push(
          `${path}: slots["${slotId}"] has children but props.children points at "${pointer}"`,
        );
      }
      arr.forEach((c, i) => walk(c, `${path} > ${c?.type ?? '?'}[${i}]`));
    }
    if (n.type === 'repeater' && n.metadata?.mode !== 'preview') {
      problems.push(`${path}: repeater missing metadata.mode "preview" (canvas shows 1 item)`);
    }
  })(tree, tree.type ?? 'root');
  return problems;
}

/** Every static_value binding must resolve to a key that exists in its bucket. */
export function validateStatics(tree, buckets) {
  const keys = new Set(Object.values(buckets).flatMap((rows) => rows.map((r) => r.key)));
  const problems = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    for (const [propName, p] of Object.entries(n.props ?? {})) {
      if (p?.binding?.type === 'static_value' && !keys.has(p.binding.value)) {
        problems.push(
          `${n.type}.${propName}: static_value key "${p.binding.value}" not in any bucket`,
        );
      }
    }
    Object.values(n.slots ?? {}).forEach((arr) => (arr ?? []).forEach(walk));
  })(tree);
  return problems;
}

// ─── Wire format ─────────────────────────────────────────────────────────────
export function encodeUi(tree) {
  const raw = JSON.stringify(tree);
  // Assert before compressing: once zlib+base64'd, corruption is opaque.
  const slotCount = (raw.match(/"slot":/g) ?? []).length;
  const childrenCount = (raw.match(/"children":/g) ?? []).length;
  if (childrenCount < slotCount) {
    throw new Error(`ui tree: ${slotCount} slot pointers but only ${childrenCount} children props`);
  }
  return `zlib:${zlib.deflateSync(Buffer.from(raw)).toString('base64')}`;
}

export function decodeUi(value) {
  if (!value?.startsWith('zlib:')) return typeof value === 'string' ? JSON.parse(value) : value;
  return JSON.parse(zlib.inflateSync(Buffer.from(value.slice(5), 'base64')).toString());
}

// ─── CMA ─────────────────────────────────────────────────────────────────────
export async function findCompositionByTitle(title) {
  const q = encodeURIComponent(JSON.stringify({ title }));
  const { entries = [] } = await cma(
    STACK_API_KEY,
    `/content_types/${COMPOSITIONS_CT}/entries?query=${q}`,
  );
  return entries[0];
}

export async function publishComposition(uid) {
  await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}/publish`, {
    method: 'POST',
    body: { entry: { environments: [ENVIRONMENT], locales: [LOCALE] } },
  });
}

/**
 * Create or update a composition, set `composable_uid` to its own entry uid, and
 * publish it.
 *
 * Why composable_uid MUST equal the entry uid: the runtime resolves compositions
 * by `composable_uid`, but the canvas and the client renderer key the section
 * registry by entry `uid`. Use a readable slug instead and you get a split
 * failure that looks like it works — SSR renders the page perfectly while the
 * canvas reports "Component with type '<uid>' is not registered" for every
 * section. Keeping them identical removes the whole failure class.
 *
 * Publishing is part of writing, not a later step: editing a tree creates an
 * UNPUBLISHED version on a published composition, so Delivery keeps serving the
 * old shape while the CMA and the canvas both look correct.
 */
export async function upsertComposition(entry) {
  const problems = [
    ...validateTree(entry.__tree),
    ...validateStatics(entry.__tree, entry.static_value),
  ];
  if (problems.length) {
    throw new Error(`Composition "${entry.title}" is invalid:\n  - ${problems.join('\n  - ')}`);
  }

  const body = { ...entry, ui: encodeUi(entry.__tree) };
  delete body.__tree;

  const existing = await findCompositionByTitle(entry.title);
  let uid;
  if (existing) {
    uid = existing.uid;
  } else {
    // composable_uid is mandatory + unique, so seed it with something unique and
    // rewrite it to the entry uid once the CMA has minted one.
    const res = await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries`, {
      method: 'POST',
      body: { entry: { ...body, composable_uid: `pending_${nid(entry.title)}` } },
    });
    uid = res.entry.uid;
  }

  await cma(STACK_API_KEY, `/content_types/${COMPOSITIONS_CT}/entries/${uid}`, {
    method: 'PUT',
    body: { entry: { ...body, composable_uid: uid } },
  });
  await publishComposition(uid);
  return { uid, created: !existing };
}

/** Section placements in a tree: the count `05` and `06` check every Template by. */
export function countSectionNodes(tree) {
  let n = 0;
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'section-composition' || x.metadata?.compositionUID) n++;
    Object.values(x.slots ?? {}).forEach((arr) => (arr ?? []).forEach(walk));
  })(tree);
  return n;
}
