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
  keywords: string;
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
    case "/image-compressor":
    case "/pi7-image-compressor":
    case "/compress-image-to-20kb":
    case "/compress-image-to-50kb":
    case "/compress-image-to-100kb":
      return "/compress-image";
    case "/compress_pdf":
    case "/compresspdf":
    case "/pdf-compressor":
    case "/ilovepdf-compress":
      return "/compress-pdf";
    case "/convert_img":
    case "/convertimage":
    case "/convert-images":
    case "/image-converter":
      return "/convert-image";
    case "/image_to_pdf":
    case "/imagetopdf":
    case "/img-to-pdf":
    case "/jpg-to-pdf":
    case "/png-to-pdf":
      return "/image-to-pdf";
    case "/merge_pdf":
    case "/mergepdf":
    case "/combine-pdf":
    case "/ilovepdf-merge":
      return "/merge-pdf";
    case "/pdf_to_images":
    case "/pdftoimages":
    case "/pdf-to-image":
    case "/pdf-to-jpg":
    case "/pdf-to-png":
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
 * Generates high-intent, search-optimized titles and meta descriptions targeting
 * queries like "image compressor", "compress image to 20kb 50kb 100kb", "iLovePDF alternative",
 * "Pi7 image compressor alternative", and specific PDF/Office conversion keywords.
 */
export function generateMetaTags(pathname: string, view?: RetroView): PageMetaTags {
  const canonicalPath = normalizePath(pathname || getPathFromView(view));

  switch (canonicalPath) {
    case "/compress-image":
      return {
        title: "Image Compressor Online Free (20KB, 50KB, 100KB) | MONO-TRANSCODER",
        description: "Free online Image Compressor to shrink JPG, PNG, WebP & AVIF to exact KB size (20KB, 50KB, 100KB). Private Pi7 & iLovePDF alternative with zero uploads.",
        ogTitle: "Free Online Image Compressor (Shrink to 20KB, 50KB, 100KB) — Private Pi7 Alternative",
        ogDescription: "Compress JPG, PNG, and WebP images to exact target KB sizes locally in your browser. Zero server uploads—faster and more private than Pi7 or iLoveIMG.",
        twitterTitle: "Image Compressor Online (Exact KB Size) — MONO-TRANSCODER",
        twitterDescription: "Compress images to 20KB, 50KB, 100KB, or custom KB limits directly on your device with zero server uploads.",
        canonicalPath: "/compress-image",
        category: "ImageCompressionApplication",
        keywords: "image compressor, compress image online, compress image to 20kb, compress image to 50kb, compress image to 100kb, pi7 image compressor, reduce image size in kb, jpg compressor, png compressor, private image compressor"
      };

    case "/compress-pdf":
      return {
        title: "Compress PDF Online Free (Reduce PDF Size in KB) | MONO-TRANSCODER",
        description: "Compress PDF file size online free to 100KB, 200KB, or 500KB in your browser. Private iLovePDF & Pi7 PDF compressor alternative with zero server uploads.",
        ogTitle: "Compress PDF Online Free — Private iLovePDF & Pi7 PDF Compressor Alternative",
        ogDescription: "Reduce PDF document size locally in your browser with zero cloud uploads. Shrink heavy PDFs for email and portals with complete privacy.",
        twitterTitle: "Free Private PDF Compressor Online — MONO-TRANSCODER",
        twitterDescription: "Compress PDF files in seconds on your device. Zero server uploads, custom DPI downsampling, and total confidentiality.",
        canonicalPath: "/compress-pdf",
        category: "PdfCompressionApplication",
        keywords: "compress pdf, pdf compressor, reduce pdf size, compress pdf to 100kb, compress pdf to 200kb, ilovepdf compress pdf, pi7 pdf compressor, shrink pdf online free, private pdf compressor"
      };

    case "/convert-image":
      return {
        title: "Image Converter Online Free (PNG, JPG, WebP, AVIF) | MONO-TRANSCODER",
        description: "Convert images between JPG, PNG, WebP, and AVIF online free in browser memory. Fast, lossless Pi7 & iLoveIMG converter alternative with zero uploads.",
        ogTitle: "Convert Image Formats Online (PNG, JPG, WebP, AVIF) — Zero Uploads",
        ogDescription: "Transform images between PNG, JPG, WebP, and AVIF in local browser RAM. Lossless color preservation and instant client-side transcoding.",
        twitterTitle: "Free Online Image Format Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PNG to JPG, WebP to PNG, and AVIF to JPG directly in your browser without server uploads.",
        canonicalPath: "/convert-image",
        category: "ImageConversionApplication",
        keywords: "image converter, convert image to jpg, png to jpg, webp to png, avif converter, convert image format online, pi7 image tool, iloveimg converter alternative"
      };

    case "/image-to-pdf":
      return {
        title: "JPG to PDF & Image to PDF Converter Online Free | MONO-TRANSCODER",
        description: "Convert JPG, PNG, and WebP images to PDF online free. Combine multiple photos into one PDF locally—private iLovePDF & Pi7 JPG to PDF alternative.",
        ogTitle: "JPG to PDF & Image to PDF Converter Online — Zero Server Uploads",
        ogDescription: "Combine JPG, PNG, and WebP photos into clean multi-page PDF documents. Drag-and-drop page reordering and 100% private in-browser generation.",
        twitterTitle: "Free JPG to PDF & Image to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Merge photos and images into a single PDF right on your device. Drag-and-drop sequencing with zero cloud uploads.",
        canonicalPath: "/image-to-pdf",
        category: "PdfGenerationApplication",
        keywords: "image to pdf, jpg to pdf, png to pdf, convert photos to pdf, combine images to pdf, ilovepdf jpg to pdf, pi7 image to pdf, free jpg to pdf converter"
      };

    case "/merge-pdf":
      return {
        title: "Merge PDF Online Free — Combine PDF Files Privately | MONO-TRANSCODER",
        description: "Merge multiple PDF files into one document online free with drag-and-drop sorting. 100% private iLovePDF Merge PDF alternative with zero uploads.",
        ogTitle: "Merge PDF Files Online Free — Private iLovePDF Alternative",
        ogDescription: "Combine multiple PDF documents together seamlessly in your browser. Reorder files with drag-and-drop and merge PDFs with zero cloud exposure.",
        twitterTitle: "Merge PDF Files Locally Online — MONO-TRANSCODER",
        twitterDescription: "Combine multiple PDF files into one clean document on your computer. 100% client-side iLovePDF alternative.",
        canonicalPath: "/merge-pdf",
        category: "PdfMergeApplication",
        keywords: "merge pdf, combine pdf, join pdf files, ilovepdf merge pdf, merge pdf online free, pdf combiner, private pdf merger, pi7 merge pdf"
      };

    case "/pdf-to-images":
      return {
        title: "PDF to JPG & PNG Converter Online Free | MONO-TRANSCODER",
        description: "Convert PDF pages to high-resolution JPG or PNG images online free in your browser. Private iLovePDF PDF to JPG alternative with zero server uploads.",
        ogTitle: "PDF to JPG & PNG Image Extractor Online — 100% Private",
        ogDescription: "Convert every page of your PDF into crisp JPG or PNG images or download all pages as a ZIP archive. 100% local browser rendering.",
        twitterTitle: "PDF to JPG & Image Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PDF pages into high-definition PNG or JPG images directly in your browser. Zero uploads, fast local rendering.",
        canonicalPath: "/pdf-to-images",
        category: "PdfRasterizationApplication",
        keywords: "pdf to jpg, pdf to png, pdf to image, convert pdf to jpg online, extract images from pdf, ilovepdf pdf to jpg, high resolution pdf to image"
      };

    case "/remove-pdf-pages":
      return {
        title: "Remove Pages from PDF Online Free — Delete PDF Pages | MONO-TRANSCODER",
        description: "Delete unwanted pages from any PDF document online free in your browser. Private iLovePDF Remove Pages alternative with visual thumbnails & zero uploads.",
        ogTitle: "Delete & Remove Pages from PDF Privately in Your Browser",
        ogDescription: "Select and delete specific pages or page ranges from your PDF losslessly in local RAM. Nothing is uploaded to any server.",
        twitterTitle: "Remove PDF Pages Online Free — MONO-TRANSCODER",
        twitterDescription: "Delete unwanted PDF pages in seconds on your device. 100% client-side with zero uploads.",
        canonicalPath: "/remove-pdf-pages",
        category: "PdfEditingApplication",
        keywords: "remove pages from pdf, delete pdf pages, split pdf pages, ilovepdf remove pages, delete pages from pdf online free, pdf page remover"
      };

    case "/organize-pdf":
      return {
        title: "Organize PDF Pages Online Free — Rearrange & Rotate PDF | MONO-TRANSCODER",
        description: "Reorder, rotate, duplicate, and delete PDF pages online free with drag-and-drop visual previews. Private iLovePDF Organize PDF alternative in browser.",
        ogTitle: "Organize, Reorder & Rotate PDF Pages Privately Online",
        ogDescription: "Drag and drop PDF pages to rearrange order, rotate page orientations, or remove pages locally on your device with zero uploads.",
        twitterTitle: "Organize & Reorder PDF Pages Online — MONO-TRANSCODER",
        twitterDescription: "Rearrange and rotate PDF pages in your browser with zero server uploads.",
        canonicalPath: "/organize-pdf",
        category: "PdfEditingApplication",
        keywords: "organize pdf, reorder pdf pages, rearrange pdf pages, rotate pdf pages, ilovepdf organize pdf, sort pdf pages online free"
      };

    case "/word-to-pdf":
      return {
        title: "Word to PDF Converter Online Free (.DOCX to PDF) | MONO-TRANSCODER",
        description: "Convert Word (.docx, .doc, .rtf) documents to PDF online free directly in your browser. Private iLovePDF Word to PDF alternative with zero uploads.",
        ogTitle: "Convert Word (.DOCX) to PDF Privately in Browser — Free Online",
        ogDescription: "Turn Microsoft Word documents into clean, paginated PDFs locally in browser memory. Your files never leave your device.",
        twitterTitle: "Free Word to PDF Converter Online — MONO-TRANSCODER",
        twitterDescription: "Convert Word documents to PDF directly in your browser with zero cloud uploads.",
        canonicalPath: "/word-to-pdf",
        category: "DocumentConversionApplication",
        keywords: "word to pdf, docx to pdf, doc to pdf, convert word to pdf online free, ilovepdf word to pdf, private word to pdf converter"
      };

    case "/word-to-jpg":
      return {
        title: "Word to JPG Converter Online Free (.DOCX to Image) | MONO-TRANSCODER",
        description: "Convert Word (.docx) documents into high-resolution JPG images online free directly in your browser with zero server uploads.",
        ogTitle: "Convert Word (.DOCX) Pages to High-Res JPG Images Privately",
        ogDescription: "Render Word documents into crisp JPG page images or a single stitched JPG in browser RAM. Nothing is uploaded.",
        twitterTitle: "Free Word to JPG Converter Online — MONO-TRANSCODER",
        twitterDescription: "Convert Word documents to high-resolution JPG images locally on your device with zero uploads.",
        canonicalPath: "/word-to-jpg",
        category: "DocumentConversionApplication",
        keywords: "word to jpg, docx to jpg, word to image, convert word to jpg online free, save word document as image"
      };

    case "/pdf-to-word":
      return {
        title: "PDF to Word Converter Online Free (Editable .DOCX) | MONO-TRANSCODER",
        description: "Convert PDF documents into editable Microsoft Word (.docx) files online free in your browser. Private iLovePDF PDF to Word alternative with zero uploads.",
        ogTitle: "Convert PDF to Editable Word (.DOCX) Online Privately",
        ogDescription: "Extract PDF text, headings, and page layouts into an editable Word document locally in browser RAM with zero server uploads.",
        twitterTitle: "Free PDF to Word (.DOCX) Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PDFs to editable .DOCX files directly on your device with zero uploads.",
        canonicalPath: "/pdf-to-word",
        category: "DocumentConversionApplication",
        keywords: "pdf to word, pdf to docx, convert pdf to word online free, editable word from pdf, ilovepdf pdf to word, private pdf to word"
      };

    case "/excel-to-pdf":
      return {
        title: "Excel to PDF Converter Online Free (.XLSX & CSV to PDF) | MONO-TRANSCODER",
        description: "Convert Excel (.xlsx) and CSV spreadsheets into clean paginated PDF tables online free in your browser. Private iLovePDF Excel to PDF alternative.",
        ogTitle: "Convert Excel (.XLSX) & CSV Spreadsheets to PDF Privately",
        ogDescription: "Turn multi-sheet Excel workbooks and CSV files into formatted PDF tables directly in browser RAM with zero uploads.",
        twitterTitle: "Free Excel to PDF Converter Online — MONO-TRANSCODER",
        twitterDescription: "Convert Excel spreadsheets to PDF tables locally on your device with zero cloud uploads.",
        canonicalPath: "/excel-to-pdf",
        category: "DocumentConversionApplication",
        keywords: "excel to pdf, xlsx to pdf, csv to pdf, convert spreadsheet to pdf, ilovepdf excel to pdf, excel to pdf online free"
      };

    case "/powerpoint-to-pdf":
      return {
        title: "PowerPoint to PDF Converter Online Free (.PPTX to PDF) | MONO-TRANSCODER",
        description: "Convert PowerPoint (.pptx) presentations into crisp PDF slide decks online free in your browser. Private iLovePDF PPT to PDF alternative with zero uploads.",
        ogTitle: "Convert PowerPoint (.PPTX) Slide Decks to PDF Privately",
        ogDescription: "Render PowerPoint presentations into widescreen 16:9, 4:3, or A4 handout PDFs locally in browser memory.",
        twitterTitle: "Free PowerPoint to PDF Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PowerPoint presentations to PDF directly in your browser with zero server uploads.",
        canonicalPath: "/powerpoint-to-pdf",
        category: "DocumentConversionApplication",
        keywords: "powerpoint to pdf, pptx to pdf, ppt to pdf, convert slides to pdf, ilovepdf powerpoint to pdf, ppt to pdf online free"
      };

    case "/pdf-to-powerpoint":
      return {
        title: "PDF to PowerPoint Converter Online Free (PDF to .PPTX) | MONO-TRANSCODER",
        description: "Convert PDF pages into editable PowerPoint (.pptx) presentation slide decks online free in your browser. Private iLovePDF PDF to PPTX alternative.",
        ogTitle: "Convert PDF Documents to PowerPoint (.PPTX) Privately",
        ogDescription: "Transform PDF pages into widescreen 16:9 or 4:3 PowerPoint presentations in local browser RAM with zero uploads.",
        twitterTitle: "Free PDF to PowerPoint (.PPTX) Converter — MONO-TRANSCODER",
        twitterDescription: "Convert PDF files into .PPTX slide decks on your device with zero server uploads.",
        canonicalPath: "/pdf-to-powerpoint",
        category: "DocumentConversionApplication",
        keywords: "pdf to powerpoint, pdf to pptx, pdf to ppt, convert pdf to slides, ilovepdf pdf to powerpoint, pdf to pptx online free"
      };

    case "/pdf-to-excel":
      return {
        title: "PDF to Excel Converter Online Free (PDF to .XLSX & CSV) | MONO-TRANSCODER",
        description: "Extract tables and rows from PDF documents into editable Excel (.xlsx) or CSV spreadsheets online free. Private iLovePDF PDF to Excel alternative.",
        ogTitle: "Extract PDF Tables to Excel (.XLSX) & CSV Privately",
        ogDescription: "Scan PDF coordinates and reconstruct tabular rows and columns into Excel workbooks locally in browser memory.",
        twitterTitle: "Free PDF to Excel (.XLSX) Extractor — MONO-TRANSCODER",
        twitterDescription: "Extract tables from PDFs into .XLSX or .CSV spreadsheets directly on your device.",
        canonicalPath: "/pdf-to-excel",
        category: "DocumentConversionApplication",
        keywords: "pdf to excel, pdf to xlsx, pdf to csv, extract table from pdf, ilovepdf pdf to excel, convert pdf table to excel free"
      };

    case "/watermark-pdf":
      return {
        title: "Watermark PDF Online Free — Add Text & Logo Watermarks | MONO-TRANSCODER",
        description: "Add custom text or image watermarks to PDF pages online free in your browser. Private iLovePDF Watermark alternative with rotation, opacity & tiled stamps.",
        ogTitle: "Stamp Custom Text & Logo Watermarks on PDFs Privately",
        ogDescription: "Add confidential stamps, draft labels, or company logos across PDF pages 100% locally in your browser with zero uploads.",
        twitterTitle: "Free PDF Watermark Adder Online — MONO-TRANSCODER",
        twitterDescription: "Stamp text or image watermarks onto PDF files in browser memory with zero server uploads.",
        canonicalPath: "/watermark-pdf",
        category: "PdfEditingApplication",
        keywords: "watermark pdf, add watermark to pdf, stamp pdf online, ilovepdf watermark, pdf watermark maker free"
      };

    case "/lock-pdf":
      return {
        title: "Protect & Lock PDF Online Free (Encrypt PDF Password) | MONO-TRANSCODER",
        description: "Encrypt and password-protect PDF files online free in your browser. Private iLovePDF Protect PDF alternative with 128-bit encryption and zero uploads.",
        ogTitle: "Password Protect & Encrypt PDF Documents Privately Online",
        ogDescription: "Lock sensitive PDFs with a 128-bit password and custom permission flags strictly in local browser memory.",
        twitterTitle: "Free Private PDF Password Protector — MONO-TRANSCODER",
        twitterDescription: "Lock PDF files with a password directly in your browser. Nothing is uploaded.",
        canonicalPath: "/lock-pdf",
        category: "PdfSecurityApplication",
        keywords: "lock pdf, protect pdf, password protect pdf, encrypt pdf online free, ilovepdf protect pdf, add password to pdf"
      };

    case "/unlock-pdf":
      return {
        title: "Unlock PDF Online Free — Remove PDF Password Privately | MONO-TRANSCODER",
        description: "Remove password prompts and printing/copying restrictions from encrypted PDF files online free in your browser. Private iLovePDF Unlock PDF alternative.",
        ogTitle: "Unlock Protected PDFs & Remove Restrictions Privately",
        ogDescription: "Decrypt password-protected PDFs and strip Owner permissions 100% locally in your web browser with zero server uploads.",
        twitterTitle: "Free Private PDF Unlocker Online — MONO-TRANSCODER",
        twitterDescription: "Unlock PDF files and remove restrictions directly on your device with zero cloud uploads.",
        canonicalPath: "/unlock-pdf",
        category: "PdfSecurityApplication",
        keywords: "unlock pdf, remove pdf password, decrypt pdf online free, ilovepdf unlock pdf, pdf password remover"
      };

    case "/sign-pdf":
      return {
        title: "Sign PDF Online Free — Electronic Signature on PDF | MONO-TRANSCODER",
        description: "Sign PDF documents online free in your browser. Draw, type, or upload your e-signature and stamp any page—private iLovePDF Sign PDF alternative.",
        ogTitle: "Sign PDF Documents Privately in Your Browser — Zero Uploads",
        ogDescription: "Create handwritten, typed, or image signatures and stamp them onto your PDF locally. Your sensitive contracts never leave your device.",
        twitterTitle: "Free Private PDF Signer Online — MONO-TRANSCODER",
        twitterDescription: "Sign PDF files directly in your browser without uploading sensitive contracts to the cloud.",
        canonicalPath: "/sign-pdf",
        category: "PdfSigningApplication",
        keywords: "sign pdf, esign pdf, electronic signature pdf, sign pdf online free, ilovepdf sign pdf, add signature to pdf"
      };

    case "/passport-photo":
      return {
        title: "Passport Photo Maker Online Free (Background Remover & Suit) | MONO-TRANSCODER",
        description: "Make official 300 DPI passport size photos online free in your browser. AI background removal, custom backdrop colors & formal suit overlays—Pi7 alternative.",
        ogTitle: "Free Online Passport Size Photo Maker with AI Background Removal & Formal Suits",
        ogDescription: "Remove background, set white/blue passport backdrops, add formal shirts or coats, and export 4x6 print sheets 100% privately in your browser.",
        twitterTitle: "Free Private Passport Photo Maker — MONO-TRANSCODER",
        twitterDescription: "Create 300 DPI passport photos and 4x6 print sheets with automatic background removal and formal attire overlays locally.",
        canonicalPath: "/passport-photo",
        category: "ImageEditingApplication",
        keywords: "passport photo maker, passport size photo maker online, pi7 passport photo, remove background passport photo, passport photo with suit online free"
      };

    case "/buy-me-a-coffee":
      return {
        title: "Support MONO-TRANSCODER | Buy Me A Coffee",
        description: "Support the development of MONO-TRANSCODER. Keep in-browser image compressor and PDF tools 100% free, ad-free, and private for everyone.",
        ogTitle: "Support MONO-TRANSCODER — Privacy-First Image & PDF Tools",
        ogDescription: "Help sustain free, zero-upload, client-side file conversion and compression tools. Support independent software with direct contributions.",
        twitterTitle: "Fuel MONO-TRANSCODER — 100% Private Local File Tools",
        twitterDescription: "Support open, privacy-first file tools. Keep in-browser image and PDF compression accessible to everyone worldwide.",
        canonicalPath: "/buy-me-a-coffee",
        category: "DonationPage",
        keywords: "support mono transcoder, buy me a coffee, donate privacy tools"
      };

    case "/privacy":
      return {
        title: "Privacy Policy | MONO-TRANSCODER Zero-Upload Guarantee",
        description: "Our client-side privacy guarantee: your files never leave your device. Zero server uploads and 100% in-browser processing for all PDF and image tools.",
        ogTitle: "100% Offline Client-Side Privacy Policy — MONO-TRANSCODER",
        ogDescription: "Discover how MONO-TRANSCODER guarantees complete privacy: zero file uploads, zero server storage, and ephemeral in-memory processing.",
        twitterTitle: "Privacy First: Zero Uploads, 100% Local Processing",
        twitterDescription: "Read MONO-TRANSCODER's privacy architecture: all image and PDF operations happen strictly in your browser RAM.",
        canonicalPath: "/privacy",
        category: "PrivacyPolicy",
        keywords: "privacy policy, zero upload pdf tool, client side image compressor privacy"
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
        category: "TermsOfService",
        keywords: "terms of service, mono transcoder terms"
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
        category: "ErrorPage",
        keywords: "404 not found"
      };

    case "/":
    default:
      return {
        title: "MONO-TRANSCODER: Free Image Compressor (KB) & Private PDF Converter",
        description: "Free online Image Compressor (20KB, 50KB, 100KB) and complete PDF & Office toolkit. Merge, Compress, Sign, Word/Excel/PPT to PDF in your browser—100% private with zero uploads.",
        ogTitle: "MONO-TRANSCODER: Private Image Compressor & All-in-One PDF Suite (Zero Uploads)",
        ogDescription: "Compress images to exact KB sizes and convert, merge, compress, or sign PDFs directly in your browser with zero server uploads.",
        twitterTitle: "MONO-TRANSCODER: Free Image Compressor & Private PDF Suite",
        twitterDescription: "Shrink images to target KB sizes and manage PDFs 100% locally in your browser. Zero server uploads—your files never leave your device.",
        canonicalPath: "/",
        category: "UtilitiesApplication",
        keywords: "image compressor, compress image to 20kb, compress image to 50kb, compress image to 100kb, ilovepdf, ilovepdf alternative, pi7, pi7 image compressor, pdf compressor, merge pdf, jpg to pdf, word to pdf, pdf to word, sign pdf, passport photo maker, private pdf tools"
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
    updateMetaTag("keywords", meta.keywords);
    updateMetaTag("google-site-verification", "zoItMRwQuzoxVNZ6JNSi78d9JA-U2hFOGRld1SwtQ7k");
    updateMetaTag("robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");

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
          "@type": ["WebApplication", "SoftwareApplication"],
          "name": meta.canonicalPath === "/" ? "MONO-TRANSCODER" : title.split("|")[0].trim(),
          "alternateName": [
            title,
            "MONO-TRANSCODER Private Image & PDF Suite",
            "Private iLovePDF Alternative",
            "Private Pi7 Image Compressor Alternative"
          ],
          "url": canonicalUrl,
          "image": socialImageUrl,
          "description": description,
          "keywords": meta.keywords,
          "applicationCategory": meta.category,
          "operatingSystem": "All modern web browsers (Windows, macOS, Linux, Android, iOS)",
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
              "name": "How is MONO-TRANSCODER different from iLovePDF or Pi7 Image Compressor?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Unlike traditional cloud tools where your documents and photos are uploaded to remote servers, MONO-TRANSCODER runs 100% locally inside your web browser using WebAssembly and HTML5 Canvas. You get all the features of iLovePDF and Pi7 (compress image to 20KB/50KB/100KB, merge PDF, compress PDF, sign PDF, Word to PDF, passport photo maker) with zero server uploads and total privacy."
              }
            },
            {
              "@type": "Question",
              "name": "Can I compress an image to an exact KB size like 20KB, 50KB, or 100KB?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Our Compress Image tool lets you type any exact target KB limit (such as 20KB, 50KB, 100KB, or 200KB for government portals and exam forms) and automatically binary-searches the optimal quality in local browser memory."
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
