/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  // Template text is drawn on the server with @napi-rs/canvas (native binary)
  serverExternalPackages: ['@napi-rs/canvas'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  outputFileTracingIncludes: {
    // ffmpeg binary for attract-screen encoder and backdrop uploads
    '/api/genie-attract/encode': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/api/genie-backdrops/process': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/api/genie-countdown/encode': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/api/genie-poses/process': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/blog': ['./content/blog/**/*'],
    '/blog/[slug]': ['./content/blog/**/*'],
    '/sitemap.xml': ['./content/blog/**/*'],
    '/api/super-admin/blog': ['./content/blog/**/*'],
    '/api/super-admin/blog/file-source': ['./content/blog/**/*'],
    '/api/super-admin/blog/override': ['./content/blog/**/*'],
    '/api/super-admin/blog/[id]': ['./content/blog/**/*'],
    '/api/super-admin/props/import': ['./content/genie-props/**/*'],
    '/api/super-admin/backdrops/import': ['./content/genie-backdrops/**/*'],
    '/api/super-admin/poses/import': ['./content/genie-poses/**/*'],
  },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
