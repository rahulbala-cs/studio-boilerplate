import type { Metadata } from 'next';
import { htmlLang, isLocale, DEFAULT_LOCALE } from '@/lib/locales';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'A Contentstack Studio reference implementation.',
};

/**
 * The root layout, under the locale prefix so it can set <html lang>.
 *
 * Keep Studio imports out of it. In `next dev` each route instantiates the
 * layout's imports separately, and two Studio renderers sharing one React
 * context make every page 500 ("multiple renderers"). The SDK boots in
 * studio/StudioRender.tsx and canvas/page.tsx instead.
 *
 * No header or footer here either: both are Studio Sections, so authors can
 * edit them.
 */
export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const lang = htmlLang(isLocale(params.locale) ? params.locale : DEFAULT_LOCALE);
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
