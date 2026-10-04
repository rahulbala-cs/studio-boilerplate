/**
 * Every page lives under a locale prefix: /en, /en/articles/…, /fr/…
 *
 * A URL without one is redirected to the visitor's last locale (remembered in a
 * cookie), else the default. That matters more than it looks: links stored in
 * content — the nav, CTA buttons — are written WITHOUT a prefix, because
 * compositions store their URLs without one. A French visitor clicking
 * "/articles/x" must land on /fr/articles/x, not be bounced back to English.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale } from '@/lib/locales';

const COOKIE = 'site-locale';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split('/')[1];

  if (isLocale(first)) {
    const res = NextResponse.next();
    if (req.cookies.get(COOKIE)?.value !== first) {
      res.cookies.set(COOKIE, first, { path: '/', sameSite: 'lax' });
    }
    return res;
  }

  const remembered = req.cookies.get(COOKIE)?.value;
  const locale = isLocale(remembered) ? remembered : DEFAULT_LOCALE;
  const target = req.nextUrl.clone();
  target.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  target.search = search; // keep Studio's query params (cs-composable-studio, hash…)
  return NextResponse.redirect(target);
}

export const config = {
  // Everything except Next internals and files with an extension.
  matcher: ['/((?!_next/|api/|.*\\.[\\w]+$).*)'],
};
