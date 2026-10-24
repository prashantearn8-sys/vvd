import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import {
  DEFAULT_SITE_ORIGIN,
  ROUTE_DEFINITIONS,
  generateRedirectsFile,
  generateRobotsTxt,
  generateSitemapXml,
} from './src/utils/routesConfig';
import { ROUTE_METADATA, buildStructuredDataForRoute } from './src/components/Helmet';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildNoscriptForRoute(canonicalPath: string): string {
  if (canonicalPath === '/') {
    // Keep the comprehensive directory noscript on the home page
    return '';
  }
  const meta = ROUTE_METADATA[canonicalPath] || ROUTE_METADATA['/'];
  const heading = escapeHtml(meta.heading || meta.title.split(' | ')[0]);
  const intro = escapeHtml(meta.intro || meta.description);

  const stepsHtml =
    meta.steps && meta.steps.length > 0
      ? `<h2>How It Works</h2>\n        <ol>\n${meta.steps
          .map((s) => `          <li>${escapeHtml(s)}</li>`)
          .join('\n')}\n        </ol>`
      : '';

  const faqsHtml =
    meta.faqs && meta.faqs.length > 0
      ? `<h2>Frequently Asked Questions</h2>\n        <dl>\n${meta.faqs
          .map(
            (f) =>
              `          <dt><strong>${escapeHtml(f.q)}</strong></dt>\n          <dd>${escapeHtml(f.a)}</dd>`
          )
          .join('\n')}\n        </dl>`
      : '';

  return `<noscript>
      <main style="max-width: 960px; margin: 0 auto; padding: 2rem; font-family: monospace; line-height: 1.6;">
        <p><a href="/">← MONO-TRANSCODER (All 20 Local PDF &amp; Image Tools)</a></p>
        <h1>${heading}</h1>
        <p>${intro}</p>
        <p><strong>Privacy Guarantee:</strong> Your documents and photos never leave your device. All processing runs locally in your browser.</p>
        ${stepsHtml}
        ${faqsHtml}
        <hr />
        <p>
          <a href="/compress-image">Compress Image</a> |
          <a href="/compress-image-to-20kb">20KB</a> |
          <a href="/compress-image-to-50kb">50KB</a> |
          <a href="/compress-image-to-100kb">100KB</a> |
          <a href="/merge-pdf">Merge PDF</a> |
          <a href="/split-pdf">Split PDF</a> |
          <a href="/compress-pdf">Compress PDF</a> |
          <a href="/sign-pdf">Sign PDF</a> |
          <a href="/passport-photo-maker">Passport Photo</a> |
          <a href="/privacy">Privacy Policy</a>
        </p>
      </main>
    </noscript>`;
}

function seoAndPrerenderPlugin(): Plugin {
  const siteUrl = (process.env.VITE_SITE_URL || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');

  const writePublicSeoFiles = () => {
    const publicDir = path.resolve(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), generateSitemapXml(siteUrl), 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), generateRobotsTxt(siteUrl), 'utf-8');
    fs.writeFileSync(path.join(publicDir, '_redirects'), generateRedirectsFile(), 'utf-8');
  };

  return {
    name: 'mono-transcoder-seo-prerender',
    buildStart() {
      writePublicSeoFiles();
    },
    configureServer() {
      writePublicSeoFiles();
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const templatePath = path.join(distDir, 'index.html');
      if (!fs.existsSync(templatePath)) return;

      const baseHtml = fs.readFileSync(templatePath, 'utf-8');

      // Generate route-specific HTML for all indexable routes + /404
      const routesToGenerate = [
        ...ROUTE_DEFINITIONS.filter((r) => r.indexable).map((r) => ({
          canonicalPath: r.canonicalPath,
          isNotFound: false,
        })),
        { canonicalPath: '/404', isNotFound: true },
      ];

      for (const route of routesToGenerate) {
        const meta = ROUTE_METADATA[route.canonicalPath] || ROUTE_METADATA['/'];
        const fullUrl =
          route.canonicalPath === '/' ? `${siteUrl}/` : `${siteUrl}${route.canonicalPath}`;
        const safeTitle = escapeHtml(meta.title);
        const safeDesc = escapeHtml(meta.description);
        const safeKeywords = escapeHtml(meta.keywords);

        let routeHtml = baseHtml
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
          .replace(
            /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="title" content="${safeTitle}" />`
          )
          .replace(
            /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="description" content="${safeDesc}" />`
          )
          .replace(
            /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="keywords" content="${safeKeywords}" />`
          )
          .replace(
            /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
            `<link rel="canonical" href="${fullUrl}" />`
          )
          .replace(
            /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:url" content="${fullUrl}" />`
          )
          .replace(
            /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:title" content="${safeTitle}" />`
          )
          .replace(
            /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:description" content="${safeDesc}" />`
          )
          .replace(
            /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="twitter:url" content="${fullUrl}" />`
          )
          .replace(
            /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="twitter:title" content="${safeTitle}" />`
          )
          .replace(
            /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="twitter:description" content="${safeDesc}" />`
          );

        if (route.isNotFound) {
          routeHtml = routeHtml.replace(
            /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="robots" content="noindex, nofollow" />`
          );
        }

        // Replace #schema-structured-data with route-specific single JSON-LD block
        const structuredData = buildStructuredDataForRoute(route.canonicalPath, siteUrl);
        if (structuredData) {
          const jsonString = JSON.stringify(structuredData, null, 2);
          routeHtml = routeHtml.replace(
            /<script id="schema-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i,
            `<script id="schema-structured-data" type="application/ld+json">\n${jsonString}\n    </script>`
          );
        } else {
          routeHtml = routeHtml.replace(
            /<script id="schema-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i,
            ''
          );
        }

        // Replace <noscript> with route-specific semantic body copy
        const customNoscript = buildNoscriptForRoute(route.canonicalPath);
        if (customNoscript) {
          routeHtml = routeHtml.replace(/<noscript>[\s\S]*?<\/noscript>/i, customNoscript);
        }

        if (route.canonicalPath === '/') {
          fs.writeFileSync(templatePath, routeHtml, 'utf-8');
        } else if (route.isNotFound) {
          fs.writeFileSync(path.join(distDir, '404.html'), routeHtml, 'utf-8');
        } else {
          const cleanSegment = route.canonicalPath.replace(/^\/+/, '');
          const routeDir = path.join(distDir, cleanSegment);
          fs.mkdirSync(routeDir, { recursive: true });
          fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf-8');
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), seoAndPrerenderPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
