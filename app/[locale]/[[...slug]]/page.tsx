/**
 * ONE catch-all route serves every Studio page, in every locale.
 *
 * Studio resolves which composition answers a URL, so there is no per-template
 * route to add: `/en` renders the Home template, `/en/articles/anything` renders
 * the Article template, and a future template needs no route change at all.
 *
 * The locale prefix is stripped before the lookup: compositions store their URL
 * WITHOUT it (`/articles/{{entry.title}}`), and the locale travels separately.
 *
 * This file is a Server Component (no "use client"): the fetch runs on the server
 * so the composition lands in the initial HTML and SEO works.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveComposition } from '@/studio/resolve-composition';
import { metadataForUrl } from '@/lib/seo';
import { contentstackLocale, isLocale } from '@/lib/locales';
import { StudioRender } from '@/studio/StudioRender';

type Params = { locale: string; slug?: string[] };
type Search = Record<string, string | string[] | undefined>;

const pathFrom = (params: Params) => '/' + (params.slug?.join('/') ?? '');

/** Forward the raw query string; the SDK reads Studio's and Live Preview's params from it. */
const queryFrom = (searchParams: Search) =>
  new URLSearchParams(
    Object.entries(searchParams).flatMap(([k, v]) =>
      v === undefined
        ? []
        : Array.isArray(v)
          ? v.map((x) => [k, x] as [string, string])
          : [[k, v] as [string, string]],
    ),
  ).toString();

/**
 * True when Studio is loading this URL: the canvas / template-preview iframe
 * (`cs-composable-studio`, `builder=true`) or its preview pane (`hash`,
 * `live_preview`). These are the SDK's own stable signals — the same ones its
 * `isStudioEditorMode()` reads. That helper ships in `studio-react`, which must
 * not be imported on the server (see studio/server.ts), so the check is
 * repeated here.
 */
function inStudio(searchQuery: string) {
  const q = new URLSearchParams(searchQuery);
  return (
    q.has('cs-composable-studio') ||
    q.get('builder') === 'true' ||
    q.has('hash') ||
    q.has('live_preview')
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  if (!isLocale(params.locale)) notFound();
  const url = pathFrom(params);
  const searchQuery = queryFrom(searchParams);
  const locale = contentstackLocale(params.locale);

  const { specOptions, notFound: miss } = await resolveComposition(
    { url, searchQuery },
    { locale },
  );

  // resolveComposition rethrows real failures, so reaching here with miss=true
  // genuinely means "no composition at this URL". Do NOT also guard on
  // `hasTemplate` — that is false for every Freeform composition and would 404
  // them all.
  if (miss) {
    // Inside Studio, a miss is normal: the author is building a Template that
    // has not been saved yet, so nothing matches this URL. A 404 here puts your
    // not-found page inside Studio ("Template Did Not Load"). Render an empty
    // editor instead and let Studio supply the spec over postMessage.
    if (inStudio(searchQuery)) {
      return <StudioRender specOptions={null} editorFallback={{ url, locale, searchQuery }} />;
    }
    notFound();
  }

  return <StudioRender specOptions={specOptions} />;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const searchQuery = queryFrom(searchParams);
  const metadata = await metadataForUrl(
    pathFrom(params),
    searchQuery,
    contentstackLocale(params.locale),
  );
  // Studio and preview loads (drafts, empty editors) must never be indexed.
  return inStudio(searchQuery) ? { ...metadata, robots: { index: false } } : metadata;
}
