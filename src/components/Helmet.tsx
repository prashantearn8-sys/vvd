import React, { useEffect, useState } from "react";
import { RetroView } from "../types";

export interface PageMetaTags {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  canonicalPath: string;
  category: string;
}

export interface HelmetProps {
  currentView?: RetroView;
  path?: string;
  customTitle?: string;
  customDescription?: string;
}

/**
 * Normalizes any route path or alias to a clean, canonical path
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  let clean = pathname.toLowerCase().trim();
  // Remove trailing slashes (except root)
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.replace(/\/+$/, "");
  }
  // Remove hash or query params if accidentally included
  clean = clean.split("?")[0].split("#")[0];

  // Map route aliases to canonical paths
  switch (clean) {
    case "/compress_img":
    case "/compressimage":
    case "/compress-images":
      return "/compress-image";
    case "/compress_pdf":
    case "/compresspdf":
      return "/compress-pdf";
    case "/convert_img":
    case "/convertimage":
    case "/convert-images":
      return "/convert-image";
    case "/image_to_pdf":
    case "/imagetopdf":
    case "/img-to-pdf":
      return "/image-to-pdf";
    case "/merge_pdf":
    case "/mergepdf":
      return "/merge-pdf";
    case "/pdf_to_images":
    case "/pdftoimages":
    case "/pdf-to-image":
      return "/pdf-to-images";
    case "/remove_pdf_pages":
    case "/removepdfpages":
    case "/delete-pdf-pages":
    case "/remove-pages":
      return "/remove-pdf-pages";
    case "/organize_pdf":
    case "/organizepdf":
    case "/organise-pdf":
    case "/organise_pdf":
    case "/organisepdf":
    case "/reorder-pdf":
      return "/organize-pdf";
    case "/word_to_pdf":
    case "/wordtopdf":
    case "/docx-to-pdf":
    case "/doc-to-pdf":
      return "/word-to-pdf";
    case "/word_to_jpg":
    case "/wordtojpg":
    case "/docx-to-jpg":
    case "/doc-to-jpg":
    case "/word-to-image":
      return "/word-to-jpg";
    case "/pdf_to_word":
    case "/pdftoword":
    case "/pdf-to-docx":
    case "/pdf-to-doc":
      return "/pdf-to-word";
    case "/excel_to_pdf":
    case "/exceltopdf":
    case "/xlsx-to-pdf":
    case "/csv-to-pdf":
      return "/excel-to-pdf";
    case "/ppt_to_pdf":
    case "/ppt-to-pdf":
    case "/pptx-to-pdf":
    case "/powerpointtopdf":
      return "/powerpoint-to-pdf";
    case "/pdf_to_ppt":
    case "/pdf-to-ppt":
    case "/pdf-to-pptx":
    case "/pdftopowerpoint":
      return "/pdf-to-powerpoint";
    case "/pdf_to_excel":
    case "/pdftoexcel":
    case "/pdf-to-xlsx":
    case "/pdf-to-csv":
      return "/pdf-to-excel";
    case "/watermark_pdf":
    case "/watermarkpdf":
    case "/add-watermark-pdf":
      return "/watermark-pdf";
    case "/lock_pdf":
    case "/lockpdf":
    case "/protect-pdf":
    case "/encrypt-pdf":
      return "/lock-pdf";
    case "/unlock_pdf":
    case "/unlockpdf":
    case "/decrypt-pdf":
      return "/unlock-pdf";
    case "/sign_pdf":
    case "/signpdf":
    case "/esign-pdf":
    case "/signature-pdf":
      return "/sign-pdf";
    case "/passport_photo":
    case "/passportphoto":
    case "/passport-photo-maker":
    case "/passport-size-photo":
    case "/id-photo":
      return "/passport-photo";
    case "/coffee":
    case "/buymeacoffee":
    case "/support":
      return "/buy-me-a-coffee";
    default:
      return clean;
  }
}

/**
 * Maps a RetroView to its canonical URL path
 */
export function getPathFromView(view?: RetroView): string {
  if (!view) return "/";
  switch (view) {
    case "compress_img":
    case "compress_img_download":
      return "/compress-image";
    case "compress_pdf":
    case "compress_pdf_download":
      return "/compress-pdf";
    case "convert_img":
    case "convert_img_download":
      return "/convert-image";
    case "image_to_pdf":
    case "image_to_pdf_download":
      return "/image-to-pdf";
    case "merge_pdf":
    case "merge_pdf_download":
      return "/merge-pdf";
    case "pdf_to_images":
    case "pdf_to_images_download":
      return "/pdf-to-images";
    case "remove_pdf_pages":
    case "remove_pdf_pages_download":
      return "/remove-pdf-pages";
    case "organize_pdf":
    case "organize_pdf_download":
      return "/organize-pdf";
    case "word_to_pdf":
    case "word_to_pdf_download":
      return "/word-to-pdf";
    case "word_to_jpg":
    case "word_to_jpg_download":
      return "/word-to-jpg";
    case "pdf_to_word":
    case "pdf_to_word_download":
      return "/pdf-to-word";
    case "excel_to_pdf":
    case "excel_to_pdf_download":
      return "/excel-to-pdf";
    case "ppt_to_pdf":
    case "ppt_to_pdf_download":
      return "/powerpoint-to-pdf";
    case "pdf_to_ppt":
    case "pdf_to_ppt_download":
      return "/pdf-to-powerpoint";
    case "pdf_to_excel":
    case "pdf_to_excel_download":
      return "/pdf-to-excel";
    case "watermark_pdf":
    case "watermark_pdf_download":
      return "/watermark-pdf";
    case "lock_pdf":
    case "lock_pdf_download":
      return "/lock-pdf";
    case "unlock_pdf":
    case "unlock_pdf_download":
      return "/unlock-pdf";
    case "sign_pdf":
    case "sign_pdf_download":
      return "/sign-pdf";
    case "passport_photo":
    case "passport_photo_download":
      return "/passport-photo";
    case "coffee":
      return "/buy-me-a-coffee";
    case "privacy":
      return "/privacy";
    case "terms":
      return "/terms";
    case "not_found":
      return "/404";
    case "home":
    default:
      return "/";
  }
}

/**
 * Dynamic Meta Tags Generator:
 * Generates concise, high-converting titles (< 60 chars) and meta descriptions (< 155 chars)
 * adhering strictly to real image/PDF tools and verified privacy boundaries.
 */
export function generateMetaTags(pathname: string, view?: RetroView): PageMetaTags {
  const canonicalPath = normalizePath(pathname || getPathFromView(view));

  switch (canonicalPath) {
    case "/compress-image":
      return {
        title: "Compress Images Online Free | MONO-TRANSCODER",
        description: "Compress JPG, PNG, WebP, and AVIF images locally in your browser. Set target KB sizes and optimize files with zero server uploads.",
        ogTitle: "Compress Images Online with Zero Server Uploads",
        ogDescription: "Shrink JPG, PNG, and WebP image sizes down to custom KB limits with instant side-by-side previews. Your files never leave your device.",
        twitterTitle: "Free Private Image Compressor — MONO-TRANSCODER",
        twitterDescription: "Compress images directly on your device. Set target KB sizes, strip EXIF metadata, and preserve pixel clarity with zero cloud uploads.",
        canonicalPath: "/compress-image",
        category: "ImageCompressionApplication"
      };

    case "/compress-pdf":
      return {
        title: "Compress PDF Online Free | MONO-TRANSCODER",
        description: "Optimize and reduce PDF document file sizes in your browser with complete privacy. No cloud uploads, fast client-side compression.",
        ogTitle: "Compress PDF Documents Privately in Your Browser",
        ogDescription: "Reduce heavy PDF document sizes locally with zero cloud transfers. Strip bloated metadata and deflated streams with zero rasterization.",
        twitterTitle: "Client-Side PDF Compressor — MONO-TRANSCODER",
        twitterDescription: "Shrink bloated PDFs in seconds on your computer. Zero server uploads, password protection support, complete confidentiality.",
        canonicalPath: "/compress-pdf",
        category: "PdfCompressionApplication"
      };

    case "/convert-image":
      return {
        title: "Convert Image Online Free | MONO-TRANSCODER",
        description: "Convert images between PNG, JPG, WebP, and AVIF instantly in browser memory. High quality color preservation with zero uploads.",
        ogTitle: "Convert Image Formats Instantly with Complete Privacy",
        ogDescription: "Transform images between PNG, JPG, WebP, and AVIF in browser RAM. Lossless color preservation and instant high-speed transcoding.",
        twitterTitle: "Fast Local Image Converter — MONO-TRANSCODER",
        twitterDescription: "Convert images directly in your browser without waiting for server uploads. Instant format switching with zero data collection.",
        canonicalPath: "/convert-image",
        category: "ImageConversionApplication"
      };

    case "/image-to-pdf":
      return {
        title: "Image to PDF Converter Free | MONO-TRANSCODER",
        description: "Convert and compile multiple images into a single clean PDF document. Drag-and-drop ordering and private local generation.",
        ogTitle: "Create Professional PDFs from Images with Zero Uploads",
        ogDescription: "Combine JPG, PNG, and WebP photos into clean, multi-page PDF documents. Drag-and-drop page reordering and 100% private in-browser generation.",
        twitterTitle: "Image to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Merge images into single-file PDFs right on your device. Drag-and-drop sequencing with zero cloud uploads.",
        canonicalPath: "/image-to-pdf",
        category: "PdfGenerationApplication"
      };

    case "/merge-pdf":
      return {
        title: "Merge PDF Online Free | MONO-TRANSCODER",
        description: "Merge multiple PDF files into a single unified document with drag-and-drop page ordering. 100% private, zero uploads.",
        ogTitle: "Combine Multiple PDFs Into One Document Privately",
        ogDescription: "Merge PDF documents together seamlessly in your browser. Reorder files with intuitive drag-and-drop and generate unified PDFs with zero cloud exposure.",
        twitterTitle: "Merge PDF Files Locally — MONO-TRANSCODER",
        twitterDescription: "Combine multiple PDF files into one clean document on your computer. 100% client-side with zero data retention.",
        canonicalPath: "/merge-pdf",
        category: "PdfMergeApplication"
      };

    case "/pdf-to-images":
      return {
        title: "PDF to Images Online Free | MONO-TRANSCODER",
        description: "Rasterize and extract all PDF pages into high-resolution PNG or JPG images inside your browser without uploading to any server.",
        ogTitle: "Extract PDF Pages to High-Res JPG & PNG Images",
        ogDescription: "Convert every page of your PDF into crisp, individual images or download all pages in a single ZIP file. 100% client-side rasterization.",
        twitterTitle: "PDF to Image Extractor — MONO-TRANSCODER",
        twitterDescription: "Convert PDF pages into high-definition PNG or JPG images directly in your browser. Zero uploads, fast local rendering.",
        canonicalPath: "/pdf-to-images",
        category: "PdfRasterizationApplication"
      };

    case "/remove-pdf-pages":
      return {
        title: "Remove Pages from PDF Free | MONO-TRANSCODER",
        description: "Delete unwanted pages from any PDF document in your browser. Inspect page thumbnails and remove specific pages with zero uploads.",
        ogTitle: "Remove Pages from PDF Privately in Your Browser",
        ogDescription: "Select and delete specific pages or page ranges from your PDF losslessly in local RAM. Nothing is uploaded to any server.",
        twitterTitle: "Remove PDF Pages Locally — MONO-TRANSCODER",
        twitterDescription: "Delete unwanted PDF pages in seconds on your device. 100% client-side with zero uploads.",
        canonicalPath: "/remove-pdf-pages",
        category: "PdfEditingApplication"
      };

    case "/organize-pdf":
      return {
        title: "Organize PDF Pages Online Free | MONO-TRANSCODER",
        description: "Reorder, rotate, duplicate, and delete PDF pages in your browser with drag-and-drop visual previews. Nothing is uploaded.",
        ogTitle: "Organize & Reorder PDF Pages Privately in Browser",
        ogDescription: "Drag and drop PDF pages to rearrange order, rotate page orientations, or remove pages locally on your device.",
        twitterTitle: "Organize PDF Pages Locally — MONO-TRANSCODER",
        twitterDescription: "Rearrange and rotate PDF pages in your browser with zero server uploads.",
        canonicalPath: "/organize-pdf",
        category: "PdfEditingApplication"
      };

    case "/word-to-pdf":
      return {
        title: "Word to PDF Converter Free | MONO-TRANSCODER",
        description: "Convert Word (.docx) documents to PDF directly in your browser. Fast, private local conversion with zero server uploads.",
        ogTitle: "Convert Word (.DOCX) to PDF Privately in Browser",
        ogDescription: "Turn Word documents into clean, paginated PDFs locally in browser memory. Your files never leave your device.",
        twitterTitle: "Private Word to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Convert Word documents to PDF directly in your browser with zero cloud uploads.",
        canonicalPath: "/word-to-pdf",
        category: "DocumentConversionApplication"
      };

    case "/word-to-jpg":
      return {
        title: "Word to JPG Converter Free | MONO-TRANSCODER",
        description: "Convert Word (.docx) documents into high-resolution JPG images directly in your browser with zero server uploads.",
        ogTitle: "Convert Word (.DOCX) Pages to High-Res JPG Images Privately",
        ogDescription: "Render Word documents into crisp JPG page images or a single stitched JPG in browser RAM. Nothing is uploaded.",
        twitterTitle: "Private Word to JPG Converter — MONO-TRANSCODER",
        twitterDescription: "Convert Word documents to high-resolution JPG images locally on your device with zero uploads.",
        canonicalPath: "/word-to-jpg",
        category: "DocumentConversionApplication"
      };

    case "/pdf-to-word":
      return {
        title: "PDF to Word Converter Free | MONO-TRANSCODER",
        description: "Convert PDF documents into editable Microsoft Word (.docx) files in your browser. Nothing is uploaded to any server.",
        ogTitle: "Convert PDF to Editable Word (.DOCX) Privately",
        ogDescription: "Extract PDF text, headings, and page layouts into an editable Word document locally in browser RAM.",
        twitterTitle: "Private PDF to Word Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PDFs to editable .DOCX files directly on your device with zero uploads.",
        canonicalPath: "/pdf-to-word",
        category: "DocumentConversionApplication"
      };

    case "/excel-to-pdf":
      return {
        title: "Excel to PDF Converter Free | MONO-TRANSCODER",
        description: "Convert Excel (.xlsx) and CSV spreadsheets into clean, paginated PDF tables locally in your browser with zero server uploads.",
        ogTitle: "Convert Excel (.XLSX) & CSV Spreadsheets to PDF Privately",
        ogDescription: "Turn multi-sheet Excel workbooks and CSV files into formatted PDF tables directly in browser RAM.",
        twitterTitle: "Private Excel to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Convert Excel spreadsheets to PDF tables locally on your device with zero cloud uploads.",
        canonicalPath: "/excel-to-pdf",
        category: "DocumentConversionApplication"
      };

    case "/powerpoint-to-pdf":
      return {
        title: "PowerPoint to PDF Converter Free | MONO-TRANSCODER",
        description: "Convert PowerPoint (.pptx) presentations and speaker notes into crisp PDF slide decks in your browser with zero uploads.",
        ogTitle: "Convert PowerPoint (.PPTX) Slide Decks to PDF Privately",
        ogDescription: "Render PowerPoint presentations into widescreen 16:9, 4:3, or A4 handout PDFs locally in browser memory.",
        twitterTitle: "Private PowerPoint to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PowerPoint presentations to PDF directly in your browser with zero server uploads.",
        canonicalPath: "/powerpoint-to-pdf",
        category: "DocumentConversionApplication"
      };

    case "/pdf-to-powerpoint":
      return {
        title: "PDF to PowerPoint Converter Free | MONO-TRANSCODER",
        description: "Convert PDF pages into editable PowerPoint (.pptx) presentation slide decks directly in your browser with zero uploads.",
        ogTitle: "Convert PDF Documents to PowerPoint (.PPTX) Privately",
        ogDescription: "Transform PDF pages into widescreen 16:9 or 4:3 PowerPoint presentations in local browser RAM.",
        twitterTitle: "Private PDF to PowerPoint Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PDF files into .PPTX slide decks on your device with zero server uploads.",
        canonicalPath: "/pdf-to-powerpoint",
        category: "DocumentConversionApplication"
      };

    case "/pdf-to-excel":
      return {
        title: "PDF to Excel Converter Free | MONO-TRANSCODER",
        description: "Extract tables and rows from PDF documents into editable Excel (.xlsx) or CSV spreadsheets in your browser with zero uploads.",
        ogTitle: "Extract PDF Tables to Excel (.XLSX) & CSV Privately",
        ogDescription: "Scan PDF coordinates and reconstruct tabular rows and columns into Excel workbooks locally in browser memory.",
        twitterTitle: "Private PDF to Excel Extractor — MONO-TRANSCODER",
        twitterDescription: "Extract tables from PDFs into .XLSX or .CSV spreadsheets directly on your device.",
        canonicalPath: "/pdf-to-excel",
        category: "DocumentConversionApplication"
      };

    case "/watermark-pdf":
      return {
        title: "Watermark PDF Online Free | MONO-TRANSCODER",
        description: "Add custom text or image watermarks to PDF pages in your browser. Adjust rotation, opacity, and tiled patterns with zero uploads.",
        ogTitle: "Stamp Custom Text & Logo Watermarks on PDFs Privately",
        ogDescription: "Add confidential stamps, draft labels, or company logos across PDF pages 100% locally in your browser.",
        twitterTitle: "Private PDF Watermark Studio — MONO-TRANSCODER",
        twitterDescription: "Stamp text or image watermarks onto PDF files in browser memory with zero server uploads.",
        canonicalPath: "/watermark-pdf",
        category: "PdfEditingApplication"
      };

    case "/lock-pdf":
      return {
        title: "Lock & Protect PDF Online Free | MONO-TRANSCODER",
        description: "Encrypt and password-protect PDF files in your browser. Restrict printing, copying, and editing with 128-bit encryption and zero uploads.",
        ogTitle: "Password Protect & Encrypt PDF Documents Privately",
        ogDescription: "Lock sensitive PDFs with a 128-bit password and custom permission flags strictly in local browser memory.",
        twitterTitle: "Private Client-Side PDF Encryptor — MONO-TRANSCODER",
        twitterDescription: "Lock PDF files with a password directly in your browser. Nothing is uploaded.",
        canonicalPath: "/lock-pdf",
        category: "PdfSecurityApplication"
      };

    case "/unlock-pdf":
      return {
        title: "Unlock PDF Online Free | MONO-TRANSCODER",
        description: "Remove password prompts and printing/copying restrictions from encrypted PDF documents locally in your browser with zero uploads.",
        ogTitle: "Unlock Protected PDFs & Remove Restrictions Privately",
        ogDescription: "Decrypt password-protected PDFs and strip Owner permissions 100% locally in your web browser.",
        twitterTitle: "Private Client-Side PDF Unlocker — MONO-TRANSCODER",
        twitterDescription: "Unlock PDF files and remove restrictions directly on your device with zero cloud uploads.",
        canonicalPath: "/unlock-pdf",
        category: "PdfSecurityApplication"
      };

    case "/sign-pdf":
      return {
        title: "Sign PDF Online Free | MONO-TRANSCODER",
        description: "Sign PDF documents in your browser. Draw, type, or upload your signature and place it on any page with zero server uploads.",
        ogTitle: "Sign PDF Documents Privately in Your Browser",
        ogDescription: "Create handwritten, typed, or image signatures and stamp them onto your PDF locally. Your files never leave your device.",
        twitterTitle: "Private Client-Side PDF Signer — MONO-TRANSCODER",
        twitterDescription: "Sign PDF files directly in your browser without uploading sensitive documents to the cloud.",
        canonicalPath: "/sign-pdf",
        category: "PdfSigningApplication"
      };

    case "/passport-photo":
      return {
        title: "Passport Photo Maker Free Online | MONO-TRANSCODER",
        description: "Create official passport photos locally in your browser. Automatically remove background, set white or colored backdrops, and add formal shirts or coats.",
        ogTitle: "Free Private Passport Photo Maker with Formal Shirts & Coats",
        ogDescription: "Remove background, set solid white or custom passport backdrops, and add formal shirts or suit coats 100% privately in your browser.",
        twitterTitle: "Private Passport Photo Maker — MONO-TRANSCODER",
        twitterDescription: "Create 300 DPI passport photos and 4x6 print sheets with automatic background removal and formal attire overlays locally.",
        canonicalPath: "/passport-photo",
        category: "ImageEditingApplication"
      };

    case "/buy-me-a-coffee":
      return {
        title: "Support MONO-TRANSCODER | Buy Me A Coffee",
        description: "Support the development of MONO-TRANSCODER. Keep in-browser image and PDF compression 100% free and private for everyone.",
        ogTitle: "Support MONO-TRANSCODER — Privacy-First File Tools",
        ogDescription: "Help sustain free, zero-upload, client-side file conversion and compression tools. Support independent software with direct contributions.",
        twitterTitle: "Fuel MONO-TRANSCODER — 100% Private Local File Tools",
        twitterDescription: "Support open, privacy-first file tools. Keep in-browser image and PDF compression accessible to everyone worldwide.",
        canonicalPath: "/buy-me-a-coffee",
        category: "DonationPage"
      };

    case "/privacy":
      return {
        title: "Privacy Policy | MONO-TRANSCODER",
        description: "Our client-side privacy guarantee: your files never leave your device. Zero server uploads and 100% in-browser processing.",
        ogTitle: "100% Offline Client-Side Privacy Policy",
        ogDescription: "Discover how MONO-TRANSCODER guarantees complete privacy: zero file uploads, zero server storage, and ephemeral in-memory processing.",
        twitterTitle: "Privacy First: Zero Uploads, 100% Local Processing",
        twitterDescription: "Read MONO-TRANSCODER's privacy architecture: all image and PDF operations happen strictly in your browser RAM.",
        canonicalPath: "/privacy",
        category: "PrivacyPolicy"
      };

    case "/terms":
      return {
        title: "Terms of Service | MONO-TRANSCODER",
        description: "Terms of service for utilizing the free, open, client-side MONO-TRANSCODER file transcoder and compression engine.",
        ogTitle: "MONO-TRANSCODER Terms of Service",
        ogDescription: "Review the usage terms and guidelines for MONO-TRANSCODER's free, open-source, client-side file conversion and compression suite.",
        twitterTitle: "Terms of Service — MONO-TRANSCODER",
        twitterDescription: "Simple, transparent guidelines for using our private in-browser file transformation tools.",
        canonicalPath: "/terms",
        category: "TermsOfService"
      };

    case "/404":
      return {
        title: "404 Page Not Found | MONO-TRANSCODER",
        description: "The requested file transcoding routine was not found. Return home to convert and compress your images and PDFs.",
        ogTitle: "404 Not Found — MONO-TRANSCODER",
        ogDescription: "The requested file transcoding tool or page could not be located. Access our suite of free, private local file utilities.",
        twitterTitle: "404 Page Not Found — MONO-TRANSCODER",
        twitterDescription: "Requested page not found. Explore our free in-browser file compression and conversion tools.",
        canonicalPath: "/404",
        category: "ErrorPage"
      };

    case "/":
    default:
      return {
        title: "MONO-TRANSCODER: Private Image & PDF Converter",
        description: "Compress and convert images and PDFs in your browser. Nothing is uploaded. Fast, private local tools for JPG, PNG, WebP, and PDF files.",
        ogTitle: "MONO-TRANSCODER: Private Image & PDF Converter",
        ogDescription: "Compress and convert images and PDFs in your browser. Nothing is uploaded. Fast, private local tools for JPG, PNG, WebP, and PDF files.",
        twitterTitle: "MONO-TRANSCODER: Private Image & PDF Converter",
        twitterDescription: "Compress and convert images and PDFs in your browser. Nothing is uploaded. Your files never leave your device.",
        canonicalPath: "/",
        category: "UtilitiesApplication"
      };
  }
}

/**
 * Helmet Component:
 * Dynamically applies synchronized HTML Title, Meta Description, Open Graph (OG),
 * Twitter Cards, and Schema.org JSON-LD structured data based on the current page path and view.
 */
export default function Helmet({ currentView, path, customTitle, customDescription }: HelmetProps) {
  const [activePath, setActivePath] = useState<string>(() => {
    if (path) return path;
    if (typeof window !== "undefined") return window.location.pathname;
    return getPathFromView(currentView);
  });

  // Track path changes from browser history (back/forward popstate) and view transitions
  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window !== "undefined") {
        setActivePath(window.location.pathname);
      }
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Sync active path whenever currentView or path prop changes
  useEffect(() => {
    if (path) {
      setActivePath(path);
    } else if (currentView) {
      const viewPath = getPathFromView(currentView);
      if (typeof window !== "undefined" && window.location.pathname !== viewPath && !currentView.endsWith("_download")) {
        setActivePath(window.location.pathname);
      } else {
        setActivePath(viewPath);
      }
    }
  }, [currentView, path]);

  // Execute Dynamic Meta Tags Generation and DOM injection
  useEffect(() => {
    // 1. Generate full meta tags profile based on current normalized path & view
    const meta = generateMetaTags(activePath, currentView);

    const title = customTitle || meta.title;
    const description = customDescription || meta.description;
    const ogTitle = customTitle || meta.ogTitle;
    const ogDescription = customDescription || meta.ogDescription;
    const twitterTitle = customTitle || meta.twitterTitle;
    const twitterDescription = customDescription || meta.twitterDescription;

    // 2. Update document title
    document.title = title;

    // Helper to find or create a meta tag
    const updateMetaTag = (nameAttr: string, value: string, isProperty = false) => {
      const attribute = isProperty ? "property" : "name";
      let element = document.querySelector(`meta[${attribute}="${nameAttr}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, nameAttr);
        document.head.appendChild(element);
      }
      element.setAttribute("content", value);
    };

    // Helper to find or create a link tag
    const updateLinkTag = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.setAttribute("rel", rel);
        document.head.appendChild(element);
      }
      element.setAttribute("href", href);
    };

    // 3. Update standard search engine & verification tags
    updateMetaTag("description", description);
    updateMetaTag("google-site-verification", "zoItMRwQuzoxVNZ6JNSi78d9JA-U2hFOGRld1SwtQ7k");
    // Delete meta keywords tag if present (ignored by Google and outdated)
    const existingKeywords = document.querySelector('meta[name="keywords"]');
    if (existingKeywords) {
      existingKeywords.remove();
    }
    updateMetaTag("robots", "index, follow");

    // 4. Resolve canonical and Open Graph URLs using primary domain https://monotranscoder.runs-on.dev
    const primaryDomain = "https://monotranscoder.runs-on.dev";
    const canonicalUrl = `${primaryDomain}${meta.canonicalPath}`;
    const socialImageUrl = `${primaryDomain}/og-image.png`;

    updateLinkTag("canonical", canonicalUrl);

    // 5. Dynamic Open Graph Tags (Optimized for Facebook, LinkedIn, WhatsApp, Slack, Discord previews)
    updateMetaTag("og:type", "website", true);
    updateMetaTag("og:url", canonicalUrl, true);
    updateMetaTag("og:title", ogTitle, true);
    updateMetaTag("og:description", ogDescription, true);
    updateMetaTag("og:site_name", "MONO-TRANSCODER", true);
    updateMetaTag("og:locale", "en_US", true);
    updateMetaTag("og:image", socialImageUrl, true);
    updateMetaTag("og:image:width", "1200", true);
    updateMetaTag("og:image:height", "630", true);
    updateMetaTag("og:image:alt", title, true);

    // 6. Dynamic Twitter / X Card Tags (Optimized for summary_large_image rendering)
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:url", canonicalUrl);
    updateMetaTag("twitter:title", twitterTitle);
    updateMetaTag("twitter:description", twitterDescription);
    updateMetaTag("twitter:image", socialImageUrl);
    updateMetaTag("twitter:image:alt", title);

    // 7. Dynamic Schema.org JSON-LD Structured Data
    let schemaScript = document.getElementById("dynamic-schema-structured-data") as HTMLScriptElement | null;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.id = "dynamic-schema-structured-data";
      schemaScript.type = "application/ld+json";
      document.head.appendChild(schemaScript);
    }

    const breadcrumbItems =
      meta.canonicalPath === "/"
        ? [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "MONO-TRANSCODER",
              "item": `${primaryDomain}/`,
            },
          ]
        : [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "MONO-TRANSCODER",
              "item": `${primaryDomain}/`,
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": title.split("|")[0].trim(),
              "item": canonicalUrl,
            },
          ];

    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          "name": "MONO-TRANSCODER",
          "alternateName": title,
          "url": canonicalUrl,
          "image": socialImageUrl,
          "description": description,
          "applicationCategory": meta.category,
          "operatingSystem": "All modern web browsers",
          "isAccessibleForFree": true,
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          }
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": breadcrumbItems
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Is it really private?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Your files never leave your device. All compression and conversion tasks run directly in your web browser via client-side WebAssembly and HTML5 Canvas. Nothing is uploaded to any server."
              }
            },
            {
              "@type": "Question",
              "name": "What are the file size limits?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Because operations run locally in browser memory rather than over network uploads, typical documents and images up to 500MB process smoothly without upload bottlenecks."
              }
            },
            {
              "@type": "Question",
              "name": "Which file formats are supported?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Supported image formats include JPG, JPEG, PNG, WebP, and AVIF. Supported document operations include PDF signing, compression, merging, organizing, page removal, Word to PDF, Word to JPG, PDF to Word, and passport photo creation."
              }
            },
            {
              "@type": "Question",
              "name": "Are my files uploaded to any server?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Never. Nothing is uploaded. All computation happens entirely within your local web browser session."
              }
            }
          ]
        }
      ]
    };

    schemaScript.text = JSON.stringify(schemaData);
  }, [activePath, currentView, customTitle, customDescription]);

  return null;
}
