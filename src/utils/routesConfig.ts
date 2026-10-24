import { RetroView } from '../types';

export const DEFAULT_SITE_ORIGIN = 'https://monotranscoder.runs-on.dev';

export interface RouteDefinition {
  view: RetroView;
  canonicalPath: string;
  aliases: string[];
  sitemapPriority?: number;
  sitemapChangefreq?: 'daily' | 'weekly' | 'monthly';
  indexable: boolean;
  presetKB?: number;
}

export const ROUTE_DEFINITIONS: RouteDefinition[] = [
  {
    view: 'home',
    canonicalPath: '/',
    aliases: ['/home', '/index.html'],
    sitemapPriority: 1.0,
    sitemapChangefreq: 'daily',
    indexable: true,
  },
  {
    view: 'compress_img',
    canonicalPath: '/compress-image',
    aliases: [
      '/compress_img',
      '/image-compressor',
      '/compress-image-to-kb',
      '/reduce-image-size-in-kb',
      '/photo-compressor',
    ],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'compress_img',
    canonicalPath: '/compress-image-to-20kb',
    aliases: ['/compress-photo-to-20kb', '/20kb-image-compressor'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
    presetKB: 20,
  },
  {
    view: 'compress_img',
    canonicalPath: '/compress-image-to-50kb',
    aliases: ['/compress-photo-to-50kb', '/50kb-image-compressor'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
    presetKB: 50,
  },
  {
    view: 'compress_img',
    canonicalPath: '/compress-image-to-100kb',
    aliases: ['/compress-photo-to-100kb', '/100kb-image-compressor'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
    presetKB: 100,
  },
  {
    view: 'compress_img',
    canonicalPath: '/compress-image-to-200kb',
    aliases: ['/compress-photo-to-200kb', '/200kb-image-compressor'],
    sitemapPriority: 0.88,
    sitemapChangefreq: 'weekly',
    indexable: true,
    presetKB: 200,
  },
  {
    view: 'compress_pdf',
    canonicalPath: '/compress-pdf',
    aliases: ['/compress_pdf', '/reduce-pdf-size', '/pdf-compressor', '/shrink-pdf'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'convert_img',
    canonicalPath: '/convert-image',
    aliases: ['/convert_img', '/image-converter', '/png-to-jpg', '/webp-to-jpg'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'image_to_pdf',
    canonicalPath: '/image-to-pdf',
    aliases: ['/image_to_pdf', '/img_to_pdf', '/jpg-to-pdf', '/png-to-pdf', '/photos-to-pdf'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'merge_pdf',
    canonicalPath: '/merge-pdf',
    aliases: ['/merge_pdf', '/combine-pdf', '/pdf-merger'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'pdf_to_images',
    canonicalPath: '/pdf-to-images',
    aliases: ['/pdf_to_images', '/pdf_to_img', '/pdf-to-jpg', '/pdf-to-png'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'remove_pdf_pages',
    canonicalPath: '/remove-pdf-pages',
    aliases: ['/remove_pdf_pages', '/split-pdf', '/split_pdf', '/delete-pdf-pages'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'organize_pdf',
    canonicalPath: '/organize-pdf',
    aliases: ['/organize_pdf', '/reorder-pdf', '/reorder_pdf', '/rotate-pdf', '/rotate_pdf'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'watermark_pdf',
    canonicalPath: '/watermark-pdf',
    aliases: ['/watermark_pdf', '/add-watermark-to-pdf'],
    sitemapPriority: 0.85,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'word_to_pdf',
    canonicalPath: '/word-to-pdf',
    aliases: ['/word_to_pdf', '/docx-to-pdf', '/doc-to-pdf'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'word_to_jpg',
    canonicalPath: '/word-to-jpg',
    aliases: ['/word_to_jpg', '/word_to_img', '/docx-to-jpg', '/word-to-image'],
    sitemapPriority: 0.85,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'pdf_to_word',
    canonicalPath: '/pdf-to-word',
    aliases: ['/pdf_to_word', '/pdf-to-docx'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'excel_to_pdf',
    canonicalPath: '/excel-to-pdf',
    aliases: ['/excel_to_pdf', '/xlsx-to-pdf', '/spreadsheet-to-pdf'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'pdf_to_excel',
    canonicalPath: '/pdf-to-excel',
    aliases: ['/pdf_to_excel', '/pdf-to-xlsx', '/pdf-to-csv'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'ppt_to_pdf',
    canonicalPath: '/powerpoint-to-pdf',
    aliases: ['/ppt_to_pdf', '/ppt-to-pdf', '/pptx-to-pdf'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'pdf_to_ppt',
    canonicalPath: '/pdf-to-powerpoint',
    aliases: ['/pdf_to_ppt', '/pdf-to-pptx', '/pdf-to-slides'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'lock_pdf',
    canonicalPath: '/lock-pdf',
    aliases: ['/lock_pdf', '/protect-pdf', '/encrypt-pdf', '/password-protect-pdf'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'unlock_pdf',
    canonicalPath: '/unlock-pdf',
    aliases: ['/unlock_pdf', '/remove-pdf-password', '/decrypt-pdf'],
    sitemapPriority: 0.9,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'sign_pdf',
    canonicalPath: '/sign-pdf',
    aliases: ['/sign_pdf', '/electronic-signature-pdf', '/esign-pdf'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'passport_photo',
    canonicalPath: '/passport-photo',
    aliases: ['/passport_photo', '/passport-photo-maker', '/passport-size-photo', '/id-photo-maker'],
    sitemapPriority: 0.95,
    sitemapChangefreq: 'weekly',
    indexable: true,
  },
  {
    view: 'coffee',
    canonicalPath: '/support',
    aliases: ['/donate', '/coffee', '/buy-me-a-coffee'],
    sitemapPriority: 0.6,
    sitemapChangefreq: 'monthly',
    indexable: true,
  },
  {
    view: 'privacy',
    canonicalPath: '/privacy',
    aliases: ['/privacy-policy'],
    sitemapPriority: 0.5,
    sitemapChangefreq: 'monthly',
    indexable: true,
  },
  {
    view: 'terms',
    canonicalPath: '/terms',
    aliases: ['/terms-of-service', '/tos'],
    sitemapPriority: 0.5,
    sitemapChangefreq: 'monthly',
    indexable: true,
  },
];

export const VIEW_TO_PATH: Record<string, string> = {};
for (const route of ROUTE_DEFINITIONS) {
  if (!route.presetKB && !VIEW_TO_PATH[route.view]) {
    VIEW_TO_PATH[route.view] = route.canonicalPath;
  }
}

export const PATH_TO_VIEW: Record<string, RetroView> = {};
for (const route of ROUTE_DEFINITIONS) {
  PATH_TO_VIEW[route.canonicalPath] = route.view;
  for (const alias of route.aliases) {
    PATH_TO_VIEW[alias] = route.view;
  }
}

export function normalizePathname(pathname: string): string {
  const cleaned = pathname.toLowerCase().replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

export function getPresetKBFromPath(pathname: string): number | undefined {
  const clean = normalizePathname(pathname);
  for (const route of ROUTE_DEFINITIONS) {
    if (route.presetKB && (route.canonicalPath === clean || route.aliases.includes(clean))) {
      return route.presetKB;
    }
  }
  return undefined;
}

export function getCanonicalPathForLocation(pathname: string, view: string): string {
  const clean = normalizePathname(pathname);
  for (const route of ROUTE_DEFINITIONS) {
    if (route.canonicalPath === clean || route.aliases.includes(clean)) {
      return route.canonicalPath;
    }
  }
  if (view.endsWith('_download')) {
    const baseView = view.replace(/_download$/, '');
    return VIEW_TO_PATH[baseView] || '/download';
  }
  return VIEW_TO_PATH[view] || (view === 'not_found' ? '/404' : '/');
}

export function generateSitemapXml(baseUrl: string = DEFAULT_SITE_ORIGIN, lastmodDate?: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const today = lastmodDate || new Date().toISOString().split('T')[0];

  const urls = ROUTE_DEFINITIONS.filter((r) => r.indexable)
    .map((route) => {
      const loc = route.canonicalPath === '/' ? `${cleanBase}/` : `${cleanBase}${route.canonicalPath}`;
      const changefreq = route.sitemapChangefreq || 'weekly';
      const priority = (route.sitemapPriority ?? 0.8).toFixed(2).replace(/0$/, '');
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function generateRobotsTxt(baseUrl: string = DEFAULT_SITE_ORIGIN): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /download',
    'Disallow: /404',
    '',
    `Sitemap: ${cleanBase}/sitemap.xml`,
    '',
  ].join('\n');
}

export function generateRedirectsFile(): string {
  const lines: string[] = [
    '# Canonical host redirect',
    `https://mono-transcoder.netlify.app/* ${DEFAULT_SITE_ORIGIN}/:splat 301!`,
    '',
    '# 301 Redirects for legacy & alias URLs',
  ];

  for (const route of ROUTE_DEFINITIONS) {
    for (const alias of route.aliases) {
      if (alias !== '/index.html') {
        lines.push(`${alias} ${route.canonicalPath} 301`);
      }
    }
  }

  lines.push('');
  lines.push('# Explicit 404 fallback (prevents soft 404s; all valid routes are prerendered)');
  lines.push('/* /404.html 404');
  lines.push('');
  return lines.join('\n');
}
