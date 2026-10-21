/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RetroView } from "../types";

export interface AppRouteConfig {
  path: string;
  aliases: string[];
  view: RetroView;
  downloadView?: RetroView;
  priority: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  indexable: boolean;
}

export const DEFAULT_SITE_ORIGIN = "https://monotranscoder.runs-on.dev";

/**
 * Single source of truth for all application routes and their SEO indexing properties
 */
export const APP_ROUTES: AppRouteConfig[] = [
  {
    path: "/",
    aliases: [],
    view: "home",
    priority: "1.0",
    changefreq: "weekly",
    indexable: true,
  },
  {
    path: "/compress-image",
    aliases: ["/compress_img", "/compressimage", "/compress-images"],
    view: "compress_img",
    downloadView: "compress_img_download",
    priority: "0.9",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/compress-pdf",
    aliases: ["/compress_pdf", "/compresspdf"],
    view: "compress_pdf",
    downloadView: "compress_pdf_download",
    priority: "0.9",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/convert-image",
    aliases: ["/convert_img", "/convertimage", "/convert-images"],
    view: "convert_img",
    downloadView: "convert_img_download",
    priority: "0.9",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/image-to-pdf",
    aliases: ["/image_to_pdf", "/imagetopdf", "/img-to-pdf"],
    view: "image_to_pdf",
    downloadView: "image_to_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/merge-pdf",
    aliases: ["/merge_pdf", "/mergepdf"],
    view: "merge_pdf",
    downloadView: "merge_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/pdf-to-images",
    aliases: ["/pdf_to_images", "/pdftoimages", "/pdf-to-image"],
    view: "pdf_to_images",
    downloadView: "pdf_to_images_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/remove-pdf-pages",
    aliases: ["/remove_pdf_pages", "/removepdfpages", "/delete-pdf-pages", "/remove-pages"],
    view: "remove_pdf_pages",
    downloadView: "remove_pdf_pages_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/organize-pdf",
    aliases: [
      "/organize_pdf",
      "/organizepdf",
      "/organise-pdf",
      "/organise_pdf",
      "/organisepdf",
      "/reorder-pdf",
    ],
    view: "organize_pdf",
    downloadView: "organize_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/word-to-pdf",
    aliases: ["/word_to_pdf", "/wordtopdf", "/docx-to-pdf", "/doc-to-pdf"],
    view: "word_to_pdf",
    downloadView: "word_to_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/word-to-jpg",
    aliases: ["/word_to_jpg", "/wordtojpg", "/docx-to-jpg", "/doc-to-jpg", "/word-to-image"],
    view: "word_to_jpg",
    downloadView: "word_to_jpg_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/pdf-to-word",
    aliases: ["/pdf_to_word", "/pdftoword", "/pdf-to-docx", "/pdf-to-doc"],
    view: "pdf_to_word",
    downloadView: "pdf_to_word_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/excel-to-pdf",
    aliases: ["/excel_to_pdf", "/exceltopdf", "/xlsx-to-pdf", "/csv-to-pdf"],
    view: "excel_to_pdf",
    downloadView: "excel_to_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/powerpoint-to-pdf",
    aliases: ["/ppt_to_pdf", "/ppt-to-pdf", "/pptx-to-pdf", "/powerpointtopdf"],
    view: "ppt_to_pdf",
    downloadView: "ppt_to_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/pdf-to-powerpoint",
    aliases: ["/pdf_to_ppt", "/pdf-to-ppt", "/pdf-to-pptx", "/pdftopowerpoint"],
    view: "pdf_to_ppt",
    downloadView: "pdf_to_ppt_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/pdf-to-excel",
    aliases: ["/pdf_to_excel", "/pdftoexcel", "/pdf-to-xlsx", "/pdf-to-csv"],
    view: "pdf_to_excel",
    downloadView: "pdf_to_excel_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/watermark-pdf",
    aliases: ["/watermark_pdf", "/watermarkpdf", "/add-watermark-pdf"],
    view: "watermark_pdf",
    downloadView: "watermark_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/lock-pdf",
    aliases: ["/lock_pdf", "/lockpdf", "/protect-pdf", "/encrypt-pdf"],
    view: "lock_pdf",
    downloadView: "lock_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/unlock-pdf",
    aliases: ["/unlock_pdf", "/unlockpdf", "/decrypt-pdf"],
    view: "unlock_pdf",
    downloadView: "unlock_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/sign-pdf",
    aliases: ["/sign_pdf", "/signpdf", "/esign-pdf", "/signature-pdf"],
    view: "sign_pdf",
    downloadView: "sign_pdf_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/passport-photo",
    aliases: ["/passport_photo", "/passportphoto", "/passport-photo-maker", "/passport-size-photo", "/id-photo"],
    view: "passport_photo",
    downloadView: "passport_photo_download",
    priority: "0.8",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/buy-me-a-coffee",
    aliases: ["/coffee", "/buymeacoffee", "/support"],
    view: "coffee",
    priority: "0.6",
    changefreq: "monthly",
    indexable: true,
  },
  {
    path: "/privacy",
    aliases: [],
    view: "privacy",
    priority: "0.4",
    changefreq: "yearly",
    indexable: true,
  },
  {
    path: "/terms",
    aliases: [],
    view: "terms",
    priority: "0.4",
    changefreq: "yearly",
    indexable: true,
  },
];

/**
 * Dynamically constructed Path -> RetroView map (including all route aliases)
 */
export const PATH_TO_VIEW_MAP: Record<string, RetroView> = APP_ROUTES.reduce(
  (acc, route) => {
    acc[route.path] = route.view;
    for (const alias of route.aliases) {
      acc[alias] = route.view;
    }
    return acc;
  },
  {} as Record<string, RetroView>
);

/**
 * Dynamically constructed RetroView -> Canonical Path map
 */
export const VIEW_TO_PATH_MAP: Record<RetroView, string> = APP_ROUTES.reduce(
  (acc, route) => {
    acc[route.view] = route.path;
    if (route.downloadView) {
      acc[route.downloadView] = route.path;
    }
    return acc;
  },
  { not_found: "/404" } as Record<RetroView, string>
);

/**
 * Escapes XML special characters to prevent malformed XML or injection
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Dynamically generates a standards-compliant sitemap.xml string
 * from the active APP_ROUTES configuration.
 */
export function generateSitemapXml(
  baseUrl: string = DEFAULT_SITE_ORIGIN,
  lastModDate: string = new Date().toISOString().split("T")[0]
): string {
  const cleanOrigin = baseUrl.replace(/\/+$/, "");
  const indexableRoutes = APP_ROUTES.filter((r) => r.indexable);

  const urlEntries = indexableRoutes
    .map((route) => {
      const loc = escapeXml(`${cleanOrigin}${route.path}`);
      const lastmod = escapeXml(lastModDate);
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntries,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * Dynamically generates robots.txt referencing the dynamic sitemap URL
 */
export function generateRobotsTxt(baseUrl: string = DEFAULT_SITE_ORIGIN): string {
  const cleanOrigin = baseUrl.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    "",
  ].join("\n");
}
