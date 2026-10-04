/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Studio previews a template at <Base URL> + <template URL>. The Base URL ends
  // in the locale (/en) and the Home template's URL is "/", so Studio requests
  // /en/ — which Next would 308 to /en. Studio's preview iframe does not survive
  // a redirect ("Template Did Not Load"), so every address Studio composes must
  // answer 200 directly.
  skipTrailingSlashRedirect: true,
  // Studio iframes this app from *.contentstack.com: the canvas (/en/canvas),
  // template previews and the Live Preview pane (every other page). Next sends
  // no framing headers, so this works locally — but a host or CDN that adds
  // X-Frame-Options or its own CSP (many do, by default) blocks those frames and
  // Studio shows only "refused to connect". frame-ancestors overrides
  // X-Frame-Options in every current browser, and names exactly who may frame
  // the site: itself and Contentstack, nobody else.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.contentstack.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
