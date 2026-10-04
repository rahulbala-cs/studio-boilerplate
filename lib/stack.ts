/**
 * The Delivery SDK stack, and the region host map both layers need.
 *
 * Deliberately free of any React import: this module is pulled into BOTH the
 * server and the client graphs, and dragging React components into the server
 * graph is what breaks App Router (see lib/studio.server.ts).
 */
import Contentstack from '@contentstack/delivery-sdk';

export const apiKey = process.env.NEXT_PUBLIC_CONTENTSTACK_API_KEY!;
export const deliveryToken = process.env.NEXT_PUBLIC_CONTENTSTACK_DELIVERY_TOKEN!;
export const environment = process.env.NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT!;
export const previewToken = process.env.NEXT_PUBLIC_CONTENTSTACK_PREVIEW_TOKEN;
export const compositionsCt =
  process.env.NEXT_PUBLIC_CONTENTSTACK_STUDIO_CONTENT_TYPE ?? 'compositions';

// The Delivery SDK takes a CDN host; Live Preview takes a DIFFERENT, region-specific
// preview host. The `us` defaults work only for North America — every other region
// 401s against them, so both are derived from one region code.
const CDN_HOSTS = {
  us: undefined,
  eu: 'eu-cdn.contentstack.com',
  'azure-na': 'azure-na-cdn.contentstack.com',
  'azure-eu': 'azure-eu-cdn.contentstack.com',
  'gcp-na': 'gcp-na-cdn.contentstack.com',
  'gcp-eu': 'gcp-eu-cdn.contentstack.com',
  au: 'au-cdn.contentstack.com',
} as const;

const PREVIEW_HOSTS = {
  us: 'rest-preview.contentstack.com',
  eu: 'eu-rest-preview.contentstack.com',
  'azure-na': 'azure-na-rest-preview.contentstack.com',
  'azure-eu': 'azure-eu-rest-preview.contentstack.com',
  'gcp-na': 'gcp-na-rest-preview.contentstack.com',
  'gcp-eu': 'gcp-eu-rest-preview.contentstack.com',
  au: 'au-rest-preview.contentstack.com',
} as const;

const region = (process.env.NEXT_PUBLIC_CONTENTSTACK_REGION ?? 'us') as keyof typeof PREVIEW_HOSTS;

/** The Delivery API host for this region (the SDK's own default for `us`). */
export const deliveryHost = CDN_HOSTS[region] ?? 'cdn.contentstack.io';

export function createStack() {
  const cdnHost = CDN_HOSTS[region];
  return Contentstack.stack({
    apiKey,
    deliveryToken,
    environment,
    region: region as never,
    ...(cdnHost ? { host: cdnHost } : {}),
    // Only when a preview token is actually present: an empty token fails the init.
    ...(previewToken
      ? { live_preview: { enable: true, preview_token: previewToken, host: PREVIEW_HOSTS[region] } }
      : {}),
  });
}
