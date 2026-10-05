import 'server-only';

/**
 * Page metadata, read from the `seo` Global Field.
 *
 * Why this needs its own fetch: the composition spec carries only the fields the
 * Sections actually BIND. `seo` is rendered into <head>, never onto the canvas,
 * so no Section binds it and it never appears in `spec.data`. Reaching for it
 * there returns undefined — and silently, because a missing title just falls
 * back to the layout's.
 *
 * So the composition tells us WHICH entry answers this URL, and the Delivery SDK
 * fetches the two fields we need from it.
 */
import type { Metadata } from 'next';
import { createStack } from './stack';
import { resolveComposition } from '@/studio/resolve-composition';

type SeoEntry = {
  title?: string;
  summary?: string;
  seo?: { meta_title?: string; meta_description?: string };
};

export async function metadataForUrl(
  url: string,
  searchQuery: string,
  locale: string,
): Promise<Metadata> {
  // Metadata must never throw: a miss here should degrade to empty tags, not
  // take down a page that resolves fine one line later.
  try {
    const { specOptions } = await resolveComposition({ url, searchQuery }, { locale });
    const spec = specOptions?.spec as
      | {
          compositionEntry?: { connected_content_type?: string };
          data?: { dataSources?: { template?: { uid?: string } } };
        }
      | undefined;

    const contentTypeUid = spec?.compositionEntry?.connected_content_type;
    const entryUid = spec?.data?.dataSources?.template?.uid;
    if (!contentTypeUid || !entryUid) return {};

    const entry = (await createStack()
      .contentType(contentTypeUid)
      .entry(entryUid)
      .locale(locale)
      .fetch()) as SeoEntry;

    const title = entry?.seo?.meta_title || entry?.title;
    const description = entry?.seo?.meta_description || entry?.summary;

    return {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(title || description
        ? { openGraph: { ...(title ? { title } : {}), ...(description ? { description } : {}) } }
        : {}),
    };
  } catch (err) {
    // Never throw from metadata — but never swallow silently either, or a broken
    // token looks exactly like a page with no SEO fields filled in.
    console.warn('[studio] metadata lookup failed for', url, err);
    return {};
  }
}
