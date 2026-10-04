/**
 * Section thumbnails (`ui_preview`), generated from the composition's own tree.
 *
 * Studio's editor screenshots the canvas and uploads a thumbnail when a human
 * presses Save. That chain lives ENTIRELY in the editor, so a Section written
 * over the CMA has an empty `ui_preview` forever — a blank grey tile in the
 * Sections palette, with nothing to tell you. Authors then cannot tell one
 * Section from another.
 *
 * Screenshotting a Section's own canvas is not the answer either: a Section
 * canvas has no preview entry, so every bound prop renders its placeholder and
 * you get near-identical "Your headline here" tiles. Worse than blank, because
 * they stop reading as empty.
 *
 * So we draw a wireframe from the tree instead. It is a schematic, not a render,
 * but it tracks the real structure: an author can tell the header from the hero
 * from the card grid at a glance.
 */
import { PALETTE } from './artwork.mjs';

const W = 480;
const H = 270;

const TONE_BG = {
  default: '#FFFFFF',
  muted: '#F2F0EC',
  accent: PALETTE.accent,
  dark: PALETTE.ink,
};

/** Read a static literal back out of the buckets (choice values are lists). */
function literal(buckets, key) {
  for (const rows of Object.values(buckets)) {
    const hit = rows.find((r) => r.key === key);
    if (hit) return Array.isArray(hit.value) ? hit.value[0] : hit.value;
  }
  return undefined;
}

const staticOf = (node, prop, buckets) => {
  const b = node.props?.[prop]?.binding;
  return b?.type === 'static_value' ? literal(buckets, b.value) : undefined;
};

const childrenOf = (node) => Object.values(node.slots ?? {}).flat();

/** Convert one ui node into a layout box. */
function toBox(node, buckets, depth = 0) {
  const type = node.type;
  const kids = childrenOf(node);

  if (type === 'page')
    return { kind: 'col', gap: 0, children: kids.map((k) => toBox(k, buckets, depth)) };

  if (type === 'meridian-section-shell') {
    return {
      kind: 'col',
      gap: 10,
      pad: 12,
      bg: TONE_BG[staticOf(node, 'tone', buckets) ?? 'default'],
      children: kids.map((k) => toBox(k, buckets, depth + 1)),
    };
  }

  if (type === 'meridian-stack') {
    const dir = staticOf(node, 'direction', buckets) ?? 'vertical';
    const gap = { none: 0, tight: 4, normal: 8, loose: 16 }[
      staticOf(node, 'gap', buckets) ?? 'normal'
    ];
    return {
      kind: dir === 'horizontal' ? 'row' : 'col',
      gap,
      children: kids.map((k) => toBox(k, buckets, depth + 1)),
    };
  }

  if (type === 'repeater') {
    // Only the OUTERMOST repeater repeats. Drawing nested ones three-wide turns
    // one card into a nine-column grid that looks nothing like the section.
    const one = kids.map((k) => toBox(k, buckets, depth + 1));
    const reps = depth <= 2 ? 3 : 1;
    return {
      kind: 'row',
      gap: 8,
      children: Array.from({ length: reps }, () => ({
        kind: 'col',
        gap: 4,
        grow: 1,
        children: one,
      })),
    };
  }

  if (type === 'condition-block')
    return { kind: 'col', gap: 4, children: kids.map((k) => toBox(k, buckets, depth)) };
  if (type === 'section-slot') return { kind: 'slot', h: 54 };
  if (type === 'image') return { kind: 'image', h: 46 };
  if (type === 'header') return { kind: 'bar', h: 13, w: 0.72, strong: true };
  if (type === 'plain-text' || type === 'text') return { kind: 'lines', n: 2 };
  if (type === 'rich-text') return { kind: 'lines', n: 3 };
  if (type === 'link') return { kind: 'bar', h: 6, w: 0.16 };
  if (type === 'meridian-eyebrow') return { kind: 'bar', h: 6, w: 0.22, accent: true };
  if (type === 'meridian-cta-button') return { kind: 'pill', h: 16, w: 0.28 };
  return { kind: 'col', gap: 4, children: kids.map((k) => toBox(k, buckets, depth + 1)) };
}

/** Rough intrinsic height so columns can distribute space sensibly. */
function measure(box) {
  switch (box.kind) {
    case 'slot':
      return box.h;
    case 'image':
      return box.h;
    case 'bar':
      return box.h;
    case 'pill':
      return box.h;
    case 'lines':
      return box.n * 8;
    case 'row':
      return Math.max(0, ...box.children.map(measure)) + (box.pad ?? 0) * 2;
    case 'col':
      return (
        box.children.reduce((a, c) => a + measure(c), 0) +
        box.gap * Math.max(0, box.children.length - 1) +
        (box.pad ?? 0) * 2
      );
    default:
      return 10;
  }
}

function draw(box, x, y, w, h, out) {
  const r = (a, b, c, d, fill, rx = 3, op = 1) =>
    out.push(
      `<rect x="${a.toFixed(1)}" y="${b.toFixed(1)}" width="${Math.max(0, c).toFixed(1)}" height="${Math.max(0, d).toFixed(1)}" rx="${rx}" fill="${fill}" opacity="${op}"/>`,
    );

  switch (box.kind) {
    case 'bar':
      r(
        x,
        y,
        w * box.w,
        box.h,
        box.accent ? PALETTE.accent : PALETTE.ink,
        2,
        box.strong ? 0.78 : 0.5,
      );
      return box.h;
    case 'pill':
      r(x, y, w * box.w, box.h, PALETTE.accent, 8);
      return box.h;
    case 'lines':
      for (let i = 0; i < box.n; i++)
        r(x, y + i * 8, w * (i === box.n - 1 ? 0.55 : 0.92), 4, PALETTE.ink, 2, 0.2);
      return box.n * 8;
    case 'image':
      r(x, y, w, box.h, PALETTE.ink, 4, 0.1);
      out.push(
        `<circle cx="${(x + w * 0.3).toFixed(1)}" cy="${(y + box.h * 0.45).toFixed(1)}" r="6" fill="${PALETTE.warm}" opacity="0.5"/>`,
      );
      return box.h;
    case 'slot':
      out.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${box.h}" rx="4" fill="none" stroke="${PALETTE.accent}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.75"/>`,
      );
      return box.h;
    case 'row': {
      const n = box.children.length || 1;
      const cw = (w - box.gap * (n - 1)) / n;
      let maxH = 0;
      box.children.forEach((c, i) => {
        maxH = Math.max(maxH, draw(c, x + i * (cw + box.gap), y, cw, h, out));
      });
      return maxH;
    }
    case 'col': {
      const pad = box.pad ?? 0;
      if (box.bg) r(x, y, w, h, box.bg, 0);
      let cy = y + pad;
      for (const c of box.children) {
        cy += draw(c, x + pad, cy, w - pad * 2, h, out) + box.gap;
      }
      return cy - y - box.gap + pad;
    }
    default:
      return 0;
  }
}

/** Render a wireframe SVG for one section composition. */
export function sectionPreview(tree, buckets) {
  const root = toBox(tree, buckets);
  const out = [`<rect width="${W}" height="${H}" fill="${PALETTE.paper}"/>`];
  // Scale so tall sections still fit the frame rather than overflowing it.
  const intrinsic = Math.max(measure(root), 1);
  const scale = Math.min(1, (H - 24) / intrinsic);
  out.push(`<g transform="translate(12,12) scale(${scale.toFixed(3)})">`);
  draw(root, 0, 0, (W - 24) / scale, (H - 24) / scale, out);
  out.push('</g>');
  out.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${PALETTE.ink}" opacity="0.12"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`;
}
