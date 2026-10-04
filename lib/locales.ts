/**
 * The site's locales: which URL prefix serves which Contentstack locale.
 *
 * One env var, read by the app AND the provisioning scripts:
 *
 *   NEXT_PUBLIC_CONTENTSTACK_LOCALES=en:en-us,fr:fr-fr
 *
 * `en` is what appears in the URL (/en/articles/…), `en-us` is the locale code
 * on the stack. The FIRST entry is the default: unprefixed URLs redirect to it,
 * and it must be the stack's master locale, because that is the one the
 * sample content is seeded and published in.
 *
 * Deliberately free of any React or Node import: middleware (Edge runtime), the
 * server graph and the client graph all read it.
 */
const RAW = process.env.NEXT_PUBLIC_CONTENTSTACK_LOCALES || 'en:en-us';

export const LOCALE_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  RAW.split(',')
    .map((pair) => pair.trim().split(':'))
    .filter(([prefix, code]) => prefix && code)
    .map(([prefix, code]) => [prefix.trim(), code.trim()]),
);

export const LOCALES = Object.keys(LOCALE_MAP);
export const DEFAULT_LOCALE = LOCALES[0];

export const isLocale = (segment: string | undefined): segment is string =>
  !!segment && Object.prototype.hasOwnProperty.call(LOCALE_MAP, segment);

/** URL prefix → the Contentstack locale code the Delivery API expects. */
export const contentstackLocale = (prefix: string) => LOCALE_MAP[prefix];

/** `en-us` → `en-US`, for <html lang>. */
export const htmlLang = (prefix: string) =>
  contentstackLocale(prefix).replace(
    /-([a-z]+)$/i,
    (_, region: string) => `-${region.toUpperCase()}`,
  );
