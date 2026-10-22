import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {
  generateSitemapXml,
  generateRobotsTxt,
  DEFAULT_SITE_ORIGIN,
  APP_ROUTES,
} from './src/utils/routesConfig';
import {generateMetaTags} from './src/components/Helmet';

/**
 * Vite Plugin that:
 * 1. Dynamically generates public/sitemap.xml and public/robots.txt from src/utils/routesConfig.ts.
 * 2. Prerenders static HTML files for every route during `vite build` with route-specific meta tags and prerendered content.
 */
function seoAndPrerenderPlugin(): Plugin {
  const writeSeoFiles = () => {
    try {
      const origin = DEFAULT_SITE_ORIGIN;
      const publicDir = path.resolve(__dirname, 'public');
      if (fs.existsSync(publicDir)) {
        fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), generateSitemapXml(origin), 'utf-8');
        fs.writeFileSync(path.join(publicDir, 'robots.txt'), generateRobotsTxt(origin), 'utf-8');
      }
    } catch (err) {
      console.warn('Could not write static SEO files:', err);
    }
  };

  return {
    name: 'vite-plugin-seo-prerender',
    buildStart() {
      writeSeoFiles();
    },
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const indexHtmlPath = path.join(distDir, 'index.html');
        if (!fs.existsSync(indexHtmlPath)) return;

        const baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        const origin = DEFAULT_SITE_ORIGIN.replace(/\/+$/, '');

        for (const route of APP_ROUTES) {
          if (route.path === '/') continue;
          const meta = generateMetaTags(route.path, route.view);
          const canonicalUrl = `${origin}${meta.canonicalPath}`;
          const routeDir = path.join(distDir, route.path.replace(/^\/+/, ''));
          fs.mkdirSync(routeDir, {recursive: true});

          const routeHtml = baseHtml
            .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
            .replace(
              /<meta name="description" content=".*?" \/>/,
              `<meta name="description" content="${meta.description}" />`
            )
            .replace(
              /<meta name="keywords" content=".*?" \/>/,
              `<meta name="keywords" content="${meta.keywords}" />`
            )
            .replace(
              /<meta property="og:title" content=".*?" \/>/,
              `<meta property="og:title" content="${meta.ogTitle}" />`
            )
            .replace(
              /<meta property="og:description" content=".*?" \/>/,
              `<meta property="og:description" content="${meta.ogDescription}" />`
            )
            .replace(
              /<meta property="og:url" content=".*?" \/>/,
              `<meta property="og:url" content="${canonicalUrl}" />`
            )
            .replace(
              /<meta name="twitter:title" content=".*?" \/>/,
              `<meta name="twitter:title" content="${meta.twitterTitle}" />`
            )
            .replace(
              /<meta name="twitter:description" content=".*?" \/>/,
              `<meta name="twitter:description" content="${meta.twitterDescription}" />`
            )
            .replace(
              /<link rel="canonical" href=".*?" \/>/,
              `<link rel="canonical" href="${canonicalUrl}" />`
            );

          fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf-8');
        }
      } catch (err) {
        console.warn('Route prerendering warning:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), seoAndPrerenderPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-pdf': ['pdf-lib', 'pako'],
            'vendor-zip': ['jszip'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
