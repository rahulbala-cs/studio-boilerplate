/**
 * Palette thumbnails.
 *
 * Studio renders the component palette inside its own iframe. An external URL
 * (a CDN, a Contentstack asset, anything under /public) fails there silently and
 * leaves a blank tile that looks identical to having no thumbnail at all.
 * So every thumbnail is an INLINE SVG data URI — zero network requests.
 *
 * A registration without one shows a text placeholder in the palette, and
 * nothing errors.
 */
const INK = '#14161A';
const ACCENT = '#3B5BDB';
const PAPER = '#FBFAF8';
const MUTED = '#C8CCD2';

/** Wrap a glyph in a consistent 160×100 tile and encode it as a data URI. */
export function thumb(glyph: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="160" height="100">
  <rect width="160" height="100" rx="6" fill="${PAPER}"/>
  <rect x="0.5" y="0.5" width="159" height="99" rx="6" fill="none" stroke="${MUTED}"/>
  ${glyph}
  <text x="80" y="92" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="${INK}" opacity="0.65">${label}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const GLYPHS = {
  sectionShell: `<rect x="16" y="14" width="128" height="56" rx="4" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="5 4"/>
     <rect x="28" y="26" width="104" height="8" rx="2" fill="${ACCENT}" opacity="0.35"/>
     <rect x="28" y="42" width="72" height="8" rx="2" fill="${INK}" opacity="0.18"/>`,

  stack: `<rect x="40" y="14" width="80" height="14" rx="3" fill="${ACCENT}" opacity="0.6"/>
     <rect x="40" y="34" width="80" height="14" rx="3" fill="${ACCENT}" opacity="0.4"/>
     <rect x="40" y="54" width="80" height="14" rx="3" fill="${ACCENT}" opacity="0.22"/>`,

  eyebrow: `<rect x="44" y="34" width="52" height="7" rx="3.5" fill="${ACCENT}"/>
     <rect x="44" y="49" width="72" height="5" rx="2.5" fill="${INK}" opacity="0.15"/>
     <rect x="44" y="59" width="60" height="5" rx="2.5" fill="${INK}" opacity="0.15"/>`,

  ctaButton: `<rect x="44" y="30" width="72" height="28" rx="14" fill="${ACCENT}"/>
     <rect x="58" y="41" width="44" height="6" rx="3" fill="${PAPER}"/>`,
} as const;
