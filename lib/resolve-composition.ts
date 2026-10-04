/**
 * `sdk.fetchCompositionData` THROWS on a miss — it does not resolve with a
 * "not found" flag. So `if (!specOptions.hasSpec) notFound()` is dead code: the
 * await throws first and the visitor gets a 500 where a 404 belongs.
 *
 * Classify on the error's `.id` and rethrow everything else. A blanket
 * `catch { notFound() }` turns every CDA outage and expired token into a silent
 * 404: the site looks empty rather than broken, and monitoring sees nothing.
 */
import { sdk, stack } from '@/lib/studio.server';

type Sdk = typeof sdk;
type FetchArgs = Parameters<Sdk['fetchCompositionData']>;

const NOT_FOUND_IDS = new Set([
  'COMPOSITION_NOT_FOUND', // looked up by compositionUid — embeds, Freeform
  'COMPOSITION_NOT_FOUND_BY_URL', // looked up by url — no pattern matched
  'PREVIEW_ENTRY_NOT_FOUND', // a pattern matched, but no entry satisfies it
]);

/**
 * The server SDK is a process-wide singleton (studioSdk.init returns the same
 * instance every time), so its Delivery stack is shared by every request. When
 * Visual Editor loads a page, the SDK writes that session's preview hash onto
 * the stack, and nothing ever clears it: every LATER request through the same
 * process, a real visitor's included, would be served draft content.
 *
 * So a request that carries no hash clears it first. Only the hash is cleared;
 * the stack's Live Preview config stays, ready for the next preview request.
 *
 * Two requests in flight at the same moment can still share one hash, so a
 * public production deployment should not set a preview token at all (without
 * one, lib/stack.ts never turns Live Preview on). Preview from a separate
 * preview deployment.
 */
const PREVIEW_HASH_PARAMS = ['hash', 'live_preview'];

function clearStalePreviewHash(searchQuery: FetchArgs[0]['searchQuery']) {
  // The SDK accepts the query as a string, URLSearchParams or a plain object.
  const read = (key: string) =>
    typeof searchQuery === 'string' || searchQuery instanceof URLSearchParams
      ? new URLSearchParams(searchQuery).get(key)
      : searchQuery?.[key];
  if (PREVIEW_HASH_PARAMS.some((p) => read(p))) return;
  stack.livePreviewQuery({ live_preview: '' } as never);
}

export async function resolveComposition(args: FetchArgs[0], opts?: FetchArgs[1]) {
  clearStalePreviewHash(args.searchQuery);
  try {
    const specOptions = await sdk.fetchCompositionData(args, opts);
    return { specOptions, notFound: false as const };
  } catch (err) {
    if (NOT_FOUND_IDS.has((err as { id?: string })?.id ?? '')) {
      return { specOptions: null, notFound: true as const };
    }
    throw err; // a real failure — must stay a 500
  }
}
