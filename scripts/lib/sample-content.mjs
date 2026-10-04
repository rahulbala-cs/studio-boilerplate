/**
 * Sample content for a fictional brand, "Meridian": a journal and a shop.
 *
 * Deliberately small: one site-settings entry, four articles, one home page and
 * three shop landing pages.
 * Enough to prove every binding in the model resolves against real data, and
 * few enough that a developer can hold the whole set in their head.
 */
import { doc, p, h, ul, bold, link } from './rte.mjs';
import { PHOTOS } from './artwork.mjs';

export const SITE_SETTINGS = {
  title: 'Site Settings',
  brand_name: 'Meridian',
  // Every nav item is a row in a repeating group, iterated by a Repeater in the
  // Header Section. Adding another item here makes it appear on every page with
  // no code change — which is the entire reason the header lives in Studio.
  nav_links: [
    { label: 'Home', href: '/' },
    { label: 'Shop', href: '/shop/suits' },
    { label: 'Field Notes', href: '/articles/designing-for-the-first-five-minutes' },
    { label: 'Subscribe', href: 'mailto:hello@meridian.example' },
  ],
  footer_note: '© 2026 Meridian. A Contentstack Studio reference implementation.',
};

export const ARTICLES = [
  {
    title: 'Designing for the first five minutes',
    summary:
      'Most products are judged before anyone reaches the feature you were proud of. Here is how we rebuilt onboarding around that fact.',
    author_name: 'Priya Raman',
    published_on: '2026-08-04T09:00:00.000Z',
    cover_image_alt: PHOTOS['Designing for the first five minutes'].alt,
    body: () =>
      doc(
        p(
          'The first five minutes decide whether anyone reaches minute six. We rebuilt our onboarding around that single constraint, and it changed what we were willing to put in front of a new account.',
        ),
        h(2, 'Cut the setup, not the capability'),
        p(
          'Our old flow asked for nine decisions before showing anything. The new one asks for ',
          bold('one'),
          ', and infers the rest from what the person does next. Nothing was removed — it simply stopped being a gate.',
        ),
        ul(
          'Defer every choice that has a sensible default',
          'Show real data, not an empty state, within thirty seconds',
          'Make the first undo obvious, so the first mistake is cheap',
        ),
        p(
          'The uncomfortable part was accepting that our carefully designed configuration screen was the problem, not the solution.',
        ),
      ),
  },
  {
    title: 'What we learned shipping a design system',
    summary:
      'Three years, two rewrites, and one uncomfortable conclusion about who a design system is actually for.',
    author_name: 'Tomas Lindqvist',
    published_on: '2026-07-18T09:00:00.000Z',
    cover_image_alt: PHOTOS['What we learned shipping a design system'].alt,
    body: () =>
      doc(
        p(
          'We shipped our first design system to designers. It failed. We shipped the second one to engineers, and it worked — not because engineers matter more, but because they were the ones who had to live inside it every day.',
        ),
        h(2, 'Adoption is a migration problem'),
        p(
          'A component library nobody migrates to is a second system, not a shared one. We spent more time writing codemods than components, and that ratio turned out to be correct.',
        ),
        p(
          'The measure we settled on was simple: how long does it take a new engineer to build a page without asking anyone a question? Everything else was a proxy for that.',
        ),
      ),
  },
  {
    title: 'The case for smaller components',
    summary:
      'A component that renders a heading, an image, a body and a button is four decisions someone else can no longer make.',
    author_name: 'Priya Raman',
    published_on: '2026-06-29T09:00:00.000Z',
    cover_image_alt: PHOTOS['The case for smaller components'].alt,
    body: () =>
      doc(
        p(
          'Every component draws a line between what is configurable and what is fixed. Draw it too high and you have a page that only its author can change.',
        ),
        h(2, 'One component, one piece of content'),
        p(
          'The rule we landed on is boring and has held up: a component renders ',
          bold('one'),
          ' piece of content. A heading. An image. A paragraph. Anything larger is a composition of those, assembled where the people who need to change it can reach it.',
        ),
        p(
          'The cost is more pieces. The benefit is that rearranging a page stops being an engineering task. We think that trade is obviously worth it, and we were wrong about it for two years.',
        ),
      ),
  },
  {
    title: 'Writing documentation people actually read',
    summary:
      'Nobody reads documentation. They search it, skim it, and leave. Writing for that behaviour instead of against it changed our completion rate.',
    author_name: 'Adeola Bakare',
    published_on: '2026-06-02T09:00:00.000Z',
    cover_image_alt: PHOTOS['Writing documentation people actually read'].alt,
    body: () =>
      doc(
        p(
          'We kept writing guides and kept watching people bounce off them. The analytics were unambiguous: almost nobody started at the top.',
        ),
        h(2, 'Write for the person who arrived in the middle'),
        p(
          'Once we accepted that every section is somebody’s entry point, the structure changed. Each one now states its own prerequisites and links back rather than assuming the reader travelled there in order.',
        ),
        p(
          'The single highest-return change was putting the runnable example first and the explanation second. See ',
          link('the component guidelines', '/articles/the-case-for-smaller-components'),
          ' for how the same principle shaped our API docs.',
        ),
      ),
  },
];

export const HOME = {
  title: 'Home',
  url: '/',
  hero: {
    eyebrow: 'Meridian Field Notes',
    headline: 'Notes from building software that lasts',
    body: () =>
      doc(
        p(
          'Essays on product design, design systems and the unglamorous engineering that holds them together. Written by the team, published when we have something worth saying.',
        ),
      ),
    image_alt: PHOTOS.home_hero.alt,
    cta_label: 'Read the latest',
    cta_href: '/articles/designing-for-the-first-five-minutes',
  },
  seo: {
    meta_title: 'Meridian Field Notes — notes from building software that lasts',
    meta_description:
      'Essays on product design, design systems and the engineering that holds them together.',
  },
};

// ─── Shop Landing Pages ──────────────────────────────────────────────────────
//
// Three entries of ONE content type, each with a different selection and order
// of blocks. That difference is the point: the content type fixes which blocks
// exist, the editor decides which ones a page uses and in what order.
//
// `image` values are keys of SHOP_PHOTOS in artwork.mjs; the seed script swaps
// each one for the uploaded asset's uid. `body` is built at seed time, like the
// articles' bodies.
//
//   Suits & Tailoring     full-bleed hero · promo · tiles · products · editorial
//   Wedding & Formal      split hero (image right) · products · editorial · promo
//   Workwear Essentials   promo · split hero (image left) · tiles · products
export const SHOP_PAGES = [
  {
    title: 'Suits & Tailoring',
    url: '/shop/suits',
    summary: 'Suits, separates and the shoes to finish them, with free alterations in store.',
    blocks: [
      {
        hero_full_bleed: {
          eyebrow: 'Suits & Tailoring',
          headline: 'A suit that fits the first time',
          subheading:
            'Modern, slim and classic cuts in wool and performance fabrics. Every suit is hemmed and tailored in store at no extra cost.',
          image: 'suit_closeup',
          cta_label: 'Shop all suits',
          cta_href: '/shop/suits',
        },
      },
      {
        promo_banner: {
          message: 'Free alterations on every suit and pair of trousers.',
          cta_label: 'Book a fitting',
          cta_href: '/shop/suits',
          tone: 'muted',
        },
      },
      {
        category_tiles: {
          heading: 'Shop by category',
          tiles: [
            { label: 'Suits', image: 'suit_closeup', href: '/shop/suits' },
            { label: 'Tuxedos', image: 'tuxedo_outdoor', href: '/shop/wedding' },
            { label: 'Dress shoes', image: 'brown_oxfords', href: '/shop/workwear' },
            { label: 'Casual', image: 'folded_tees', href: '/shop/workwear' },
          ],
        },
      },
      {
        product_grid: {
          heading: 'Best sellers',
          intro: 'The suits and shoes customers come back for.',
          products: [
            {
              name: 'Navy Three-Piece Suit',
              price: '$499',
              badge: 'Best seller',
              image: 'suit_closeup',
              href: '/shop/suits',
            },
            {
              name: 'Black Tuxedo',
              price: '$599',
              badge: '',
              image: 'tuxedo_outdoor',
              href: '/shop/wedding',
            },
            {
              name: 'Brown Leather Oxfords',
              price: '$179',
              badge: 'New',
              image: 'brown_oxfords',
              href: '/shop/workwear',
            },
          ],
        },
      },
      {
        editorial: {
          eyebrow: 'Fit guide',
          heading: 'How a suit should fit',
          body: () =>
            doc(
              p(
                'The shoulders decide everything: they cannot be altered, so buy for the shoulder and tailor the rest.',
              ),
              ul(
                'The jacket collar sits flat against your shirt collar',
                'Sleeves show about half an inch of shirt cuff',
                'Trousers rest on the shoe with a slight break, or none',
              ),
            ),
          image: 'workwear_flatlay',
          cta_label: 'Book a fitting',
          cta_href: '/shop/suits',
        },
      },
    ],
    seo: {
      meta_title: 'Suits & Tailoring — free alterations in store',
      meta_description: 'Modern, slim and classic suits, tailored in store at no extra cost.',
    },
  },
  {
    title: 'Wedding & Formal',
    url: '/shop/wedding',
    summary: 'Tuxedos and formal wear for the groom and the whole wedding party.',
    blocks: [
      {
        hero_split: {
          eyebrow: 'Wedding & Formal',
          headline: 'Dressed for the day',
          subheading:
            'Tuxedos and suits for the groom and the whole party, to buy or to rent, fitted together so everyone matches.',
          image: 'tuxedo_full',
          cta_label: 'Plan your wedding look',
          cta_href: '/shop/wedding',
          image_position: 'right',
        },
      },
      {
        product_grid: {
          heading: 'Wedding essentials',
          intro: '',
          products: [
            {
              name: 'Shawl-Collar Tuxedo',
              price: '$649',
              badge: 'Rent or buy',
              image: 'tuxedo_full',
              href: '/shop/wedding',
            },
            {
              name: 'Classic Black Tuxedo',
              price: '$599',
              badge: '',
              image: 'tuxedo_outdoor',
              href: '/shop/wedding',
            },
            {
              name: 'Ivory Tie & Pocket Square Set',
              price: '$59',
              badge: 'New',
              image: 'groom_boutonniere',
              href: '/shop/wedding',
            },
          ],
        },
      },
      {
        editorial: {
          eyebrow: 'Planning',
          heading: 'Getting the wedding party fitted',
          body: () =>
            doc(
              p(
                'Start three months out. Groomsmen can be measured at any store and their fittings are matched to the groom’s order, so the colours and cuts line up on the day.',
              ),
            ),
          image: 'groom_boutonniere',
          cta_label: 'Start a group order',
          cta_href: '/shop/wedding',
        },
      },
      {
        promo_banner: {
          message: 'Book a group fitting for five or more and the groom’s fitting is free.',
          cta_label: 'Book now',
          cta_href: '/shop/wedding',
          tone: 'accent',
        },
      },
    ],
    seo: {
      meta_title: 'Wedding & Formal — tuxedos for the whole party',
      meta_description:
        'Tuxedos and formal wear to rent or buy, fitted together for the wedding party.',
    },
  },
  {
    title: 'Workwear Essentials',
    url: '/shop/workwear',
    summary: 'Trousers, shirts and shoes for the working week.',
    blocks: [
      {
        promo_banner: {
          message: 'Buy two pairs of trousers, get the third free.',
          cta_label: 'Shop trousers',
          cta_href: '/shop/workwear',
          tone: 'dark',
        },
      },
      {
        hero_split: {
          eyebrow: 'Workwear',
          headline: 'The working week, sorted',
          subheading:
            'Trousers, shirts and shoes that go together, so getting dressed on a Monday takes no thought at all.',
          image: 'workwear_flatlay',
          cta_label: 'Shop workwear',
          cta_href: '/shop/workwear',
          image_position: 'left',
        },
      },
      {
        category_tiles: {
          heading: 'Build the week',
          tiles: [
            { label: 'Dress shoes', image: 'brown_oxfords', href: '/shop/workwear' },
            { label: 'Everyday tees', image: 'folded_tees', href: '/shop/workwear' },
            { label: 'Suits', image: 'suit_closeup', href: '/shop/suits' },
          ],
        },
      },
      {
        product_grid: {
          heading: 'Workwear staples',
          intro: 'Machine-washable, wrinkle-resistant, and cut to be worn all day.',
          products: [
            {
              name: 'Brown Leather Oxfords',
              price: '$179',
              badge: '',
              image: 'brown_oxfords',
              href: '/shop/workwear',
            },
            {
              name: 'Everyday Crew Tee, 3-pack',
              price: '$45',
              badge: 'Value pack',
              image: 'folded_tees',
              href: '/shop/workwear',
            },
            {
              name: 'Grey Wool-Blend Trousers',
              price: '$89',
              badge: 'Buy 2, get 1 free',
              image: 'workwear_flatlay',
              href: '/shop/workwear',
            },
          ],
        },
      },
    ],
    seo: {
      meta_title: 'Workwear Essentials — trousers, shirts and shoes',
      meta_description: 'Workwear staples for the working week, cut to be worn all day.',
    },
  },
];
