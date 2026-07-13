/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  outputFileTracingIncludes: {
    '/blog': ['./content/blog/**/*'],
    '/blog/[slug]': ['./content/blog/**/*'],
    '/sitemap.xml': ['./content/blog/**/*'],
    '/api/super-admin/blog': ['./content/blog/**/*'],
    '/api/super-admin/blog/file-source': ['./content/blog/**/*'],
    '/api/super-admin/blog/override': ['./content/blog/**/*'],
    '/api/super-admin/blog/[id]': ['./content/blog/**/*'],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
