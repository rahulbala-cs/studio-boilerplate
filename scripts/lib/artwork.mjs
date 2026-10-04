/**
 * Brand mark + sample photography.
 *
 * The photographs are fetched from Unsplash at seed time and uploaded into the
 * stack, so the finished project is self-contained: nothing renders from a
 * third-party CDN at request time.
 *
 * Licensing: Unsplash photos are free to use commercially without attribution
 * (https://unsplash.com/license). The photographer and source are recorded in
 * each asset's description so provenance survives in the stack. Swap these for
 * your own photography when you adapt the boilerplate — only this file and the
 * `image` keys in sample-content.mjs need to change.
 */
export const PALETTE = {
  ink: '#14161A',
  paper: '#FBFAF8',
  accent: '#3B5BDB',
  warm: '#D97706',
};

/**
 * The brand mark: a globe's meridian — a circle crossed by the arc the brand is
 * named after.
 *
 * A MARK, not a wordmark, deliberately. The brand name is a separate
 * `brand_name` field rendered as text beside it, so an author can rename the
 * site without a designer. Baking the name into the logo would make it the one
 * thing on the header nobody can edit.
 */
export const logo =
  () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Meridian">
  <circle cx="32" cy="32" r="30" fill="${PALETTE.accent}"/>
  <ellipse cx="32" cy="32" rx="12.5" ry="30" fill="none" stroke="${PALETTE.paper}" stroke-width="3.5" opacity="0.92"/>
  <path d="M2 32h60" stroke="${PALETTE.paper}" stroke-width="3.5" opacity="0.92"/>
  <circle cx="32" cy="32" r="30" fill="none" stroke="${PALETTE.ink}" stroke-width="2" opacity="0.14"/>
</svg>`;

/**
 * Sample photography, keyed by the content it belongs to.
 * `credit` is written into the asset description in Contentstack.
 */
export const PHOTOS = {
  home_hero: {
    id: '1498050108023-c5249f4df085',
    alt: 'A laptop showing code on a bright desk beside a notebook and coffee',
    credit: 'Photo by Christopher Gower on Unsplash',
  },
  'Designing for the first five minutes': {
    id: '1522202176988-66273c2fd55f',
    alt: 'Three colleagues laughing together over laptops at a shared table',
    credit: 'Photo by Brooke Cagle on Unsplash',
  },
  'What we learned shipping a design system': {
    id: '1531403009284-440f080d1e12',
    alt: 'A hand pinning printed interface screens to a planning wall',
    credit: 'Photo by Alvaro Reyes on Unsplash',
  },
  'The case for smaller components': {
    id: '1517180102446-f3ece451e9d8',
    alt: 'A browser inspector showing a nested component tree',
    credit: 'Photo by Ilya Pavlov on Unsplash',
  },
  'Writing documentation people actually read': {
    id: '1455390582262-044cdead277a',
    alt: 'A fountain pen mid-sentence on lined paper',
    credit: 'Photo by Aaron Burden on Unsplash',
  },
};

/**
 * Menswear photography for the Shop Landing Page entries. Each photo is
 * uploaded once and reused across blocks, the way a real asset library works.
 * `ar: null` keeps the photo's own shape (several are portrait); the page
 * crops at render time. `credit` records the source page, for provenance.
 */
export const SHOP_PHOTOS = {
  suit_closeup: {
    id: '1575473970760-b50a70461e1a',
    alt: 'Close-up of a navy three-piece suit with a red tie and a white pocket square',
    credit: 'Unsplash, https://unsplash.com/photos/IWG2lp7tKBw',
    ar: '16:9',
  },
  tuxedo_full: {
    id: '1755537131223-7c1b667696fd',
    alt: 'A man in a patterned shawl-collar tuxedo and bow tie standing by pale curtains',
    credit: 'Unsplash, https://unsplash.com/photos/4roMemk1FoA',
    ar: null,
  },
  tuxedo_outdoor: {
    id: '1539025828301-b314ca222fa9',
    alt: 'A man in a black tuxedo adjusting his bow tie in a garden',
    credit: 'Unsplash, https://unsplash.com/photos/tmbl2wyg6SY',
    ar: null,
  },
  groom_boutonniere: {
    id: '1474583846830-43fa959fc6ee',
    alt: 'A groom in a black jacket and ivory tie with a rose boutonniere',
    credit: 'Unsplash, https://unsplash.com/photos/PAQ1NtZVcl0',
    ar: null,
  },
  brown_oxfords: {
    id: '1472591651607-70e2d88ae3c4',
    alt: 'Brown leather dress shoes worn with patterned socks, feet resting on a rug',
    credit: 'Unsplash, https://unsplash.com/photos/OuxPfti70I0',
    ar: null,
  },
  workwear_flatlay: {
    id: '1490114538077-0a7f8cb49891',
    alt: 'Grey trousers, a plaid scarf, a watch and brown brogues in their box',
    credit: 'Unsplash, https://unsplash.com/photos/NfZiOJzZgcg',
    ar: '16:9',
  },
  folded_tees: {
    id: '1562157873-818bc0726f68',
    alt: 'Six folded crew-neck tees in red, black, white, navy, maroon and yellow',
    credit: 'Unsplash, https://unsplash.com/photos/tWOz2_EK5EQ',
    ar: null,
  },
};

const UNSPLASH = (id, w, ar = '16:9') =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=80&fm=jpg` + (ar ? `&fit=crop&ar=${ar}` : '');

/** Download one photo as a JPEG buffer. Fails loudly: a silently missing image
 *  is exactly the placeholder look this file exists to remove. */
export async function fetchPhoto(id, { width = 1600, ar = '16:9' } = {}) {
  const res = await fetch(UNSPLASH(id, width, ar), { redirect: 'follow' });
  if (!res.ok) throw new Error(`photo ${id} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error(`photo ${id} did not come back as a JPEG (${buf.length} bytes)`);
  }
  return buf;
}
