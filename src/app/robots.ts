import type { MetadataRoute } from 'next'

/** Public pages may be indexed; private workspaces and APIs may not. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/', '/login'], disallow: ['/workspace', '/api', '/forbidden'] }] }
}
