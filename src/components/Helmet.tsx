import React, { useEffect } from 'react';
import { DEFAULT_SITE_ORIGIN, getCanonicalPathForLocation, normalizePathname } from '../utils/routesConfig';

interface HelmetProps {
  view: string;
}

export interface RouteMetadata {
  title: string;
  description: string;
  keywords: string;
  heading?: string;
  intro?: string;
  steps?: string[];
  faqs?: Array<{ q: string; a: string }>;
}

export const ROUTE_METADATA: Record<string, RouteMetadata> = {
  '/': {
    title: 'Free Online PDF Tools & Image Compressor to Exact KB | MONO-TRANSCODER',
    description: '20 free browser-based PDF & image utilities: compress images to exact KB (20KB, 50KB, 100KB), merge, split, sign, lock, unlock, and convert PDF to Word, Excel, PowerPoint, or JPG locally. Your documents and photos never leave your device.',
    keywords: 'compress image to 50kb, compress image to 20kb, compress image to 100kb, merge pdf online free, remove pdf pages, compress pdf, word to pdf, pdf to word, image to pdf, pdf to images, sign pdf, lock pdf, unlock pdf, passport photo maker',
    heading: 'Private, Browser-Based PDF & Image Tools',
    intro: 'Process sensitive contracts, ID scans, passport photos, and academic documents directly inside your web browser. All 20 utilities run locally on your device—your documents and photos never leave your device.',
    steps: [
      'Choose any of the 20 PDF, Office, or Image utilities from the tool directory.',
      'Select or drag and drop your files directly from your phone or computer.',
      'Download your processed files immediately from local browser memory.'
    ],
    faqs: [
      {
        q: 'Are my PDF and image files uploaded to any server?',
        a: 'No. Your documents and photos never leave your device. Every file conversion, compression, and signature operation runs locally inside your browser using HTML5 Canvas and local JavaScript engines.'
      },
      {
        q: 'How do I compress an image to an exact KB size like 20KB, 50KB, or 100KB?',
        a: 'Open the Compress Image tool, select the 20 KB, 50 KB, or 100 KB preset chip (or enter a custom Min–Max KB range), and run the binary-search encoder. It automatically finds the highest visual quality that fits under your target byte limit.'
      },
      {
        q: 'Can I merge, organize, lock, unlock, and sign PDFs for free without watermarks?',
        a: 'Yes. All 20 tools in MONO-TRANSCODER are free to use with no watermarks, no daily task limits, and no mandatory account registration.'
      },
      {
        q: 'Does optional Google Sign-In upload my documents?',
        a: 'No. Document processing is always 100% local. Optional Google Sign-In is only used if you choose to save reusable visual signature images and basic profile metadata to your personal account.'
      }
    ]
  },
  '/compress-image': {
    title: 'Compress Image to Exact KB (20KB, 50KB, 100KB) Online Free | MONO-TRANSCODER',
    description: 'Reduce JPG, PNG, WebP, and AVIF file sizes to an exact KB target (20KB, 50KB, 100KB, 200KB) or Min–Max KB range using binary-search quality tuning. Your photos never leave your device.',
    keywords: 'compress image to 50kb, compress image to 20kb, compress image to 100kb, reduce image size in kb, jpg compressor online, photo size reducer in kb, min max kb image compressor',
    heading: 'Compress Image to Exact KB Target',
    intro: 'Use a 7-step binary search across quality levels and resolution scales to hit strict government portal, visa, and exam form file size limits (20KB, 50KB, 100KB, or custom Min–Max KB windows) locally in your browser.',
    steps: [
      'Drop your JPG, PNG, WebP, or AVIF photo into the workspace.',
      'Click a quick target chip (20 KB, 50 KB, 100 KB, 200 KB) or enable Min–Max KB range mode.',
      'Review the achieved vs. target KB size and download your compressed image.'
    ],
    faqs: [
      {
        q: 'How does exact KB targeting work?',
        a: 'The encoder runs a 7-step binary search on JPEG/WebP quality to land within 90–100% of your target KB without wasting quality, and progressively scales dimensions if needed.'
      },
      {
        q: 'Can I set both a minimum and maximum KB limit?',
        a: 'Yes. Enable Min–Max Window mode to specify both a minimum KB floor and maximum KB ceiling for portals that require a strict range (such as 20 KB to 50 KB).'
      }
    ]
  },
  '/compress-image-to-20kb': {
    title: 'Compress Image to 20KB Online Free (Exact Size Reducer) | MONO-TRANSCODER',
    description: 'Compress JPG, PNG, and WebP photos to under 20KB (18KB–20KB) for online exam forms, signature uploads, and government portals. Your photos never leave your device.',
    keywords: 'compress image to 20kb, resize photo to 20kb, signature compressor 20kb, reduce jpg size to 20kb online free, photo under 20kb',
    heading: 'Compress Image to 20KB Online',
    intro: 'Pre-configured to target 20 KB using multi-step binary search encoding. Ideal for signature scans, thumb impressions, and strict portal uploads requiring files between 10 KB and 20 KB.',
    steps: [
      'Upload your photo or signature scan (JPG, PNG, or WebP).',
      'Keep the 20 KB target preset or enable a 10 KB – 20 KB Min–Max window.',
      'Compress locally and download your file with verified KB size.'
    ]
  },
  '/compress-image-to-50kb': {
    title: 'Compress Image to 50KB Online Free (JPG, PNG, WebP) | MONO-TRANSCODER',
    description: 'Compress passport photos and ID scans to under 50KB with binary-search precision. Supports Min–Max KB ranges (e.g., 20KB–50KB). Your photos never leave your device.',
    keywords: 'compress image to 50kb, reduce photo size to 50kb, jpg under 50kb, passport photo 50kb compressor, resize image to 50kb',
    heading: 'Compress Image to 50KB Online',
    intro: 'Pre-configured to compress photos to 50 KB—the most common limit for passport applications, university admissions, and civil service portals.',
    steps: [
      'Select your portrait photo or document scan.',
      'Use the pre-selected 50 KB target (or set a 20 KB – 50 KB Min–Max window).',
      'Run the local binary-search compressor and save your image.'
    ]
  },
  '/compress-image-to-100kb': {
    title: 'Compress Image to 100KB Online Free (High Clarity) | MONO-TRANSCODER',
    description: 'Shrink high-resolution JPG, PNG, and WebP images to 100KB locally in your browser. Retains crisp text and portrait detail while meeting 100KB upload caps.',
    keywords: 'compress image to 100kb, reduce image size to 100kb, photo compressor 100kb, shrink jpg to 100kb',
    heading: 'Compress Image to 100KB Online',
    intro: 'Reduce multi-megabyte smartphone photos and scanned certificates to 100 KB while keeping text and facial features sharp.',
    steps: [
      'Add an image from your device.',
      'Confirm the 100 KB target preset (or customize your Min–Max KB bounds).',
      'Download the optimized 100 KB image immediately.'
    ]
  },
  '/compress-image-to-200kb': {
    title: 'Compress Image to 200KB Online Free | MONO-TRANSCODER',
    description: 'Compress large documents, certificates, and photos to 200KB right in your browser. Binary-search quality optimization with zero server uploads.',
    keywords: 'compress image to 200kb, reduce photo to 200kb, certificate size reducer 200kb, jpg compressor 200kb',
    heading: 'Compress Image to 200KB Online',
    intro: 'Ideal for scanned mark sheets, certificates, and KYC documents that must fit under a 200 KB portal limit without losing readability.',
    steps: [
      'Drop your scanned certificate or photo into the tool.',
      'Keep the 200 KB preset or adjust the output format.',
      'Compress and download your verified file.'
    ]
  },
  '/compress-pdf': {
    title: 'Compress PDF Online Free — Reduce PDF File Size Locally | MONO-TRANSCODER',
    description: 'Shrink large PDF files for email and portal uploads right in your browser. Choose light, balanced, or maximum compression while keeping your documents on your device.',
    keywords: 'compress pdf, reduce pdf file size, shrink pdf online free, pdf size reducer',
    heading: 'Compress PDF File Size',
    intro: 'Downsample high-DPI embedded page graphics and strip redundant metadata streams to make large PDFs easy to email or upload.',
    steps: [
      'Select the PDF file you need to shrink.',
      'Choose a target KB size or compression preset.',
      'Download the smaller PDF and compare the before/after byte savings.'
    ]
  },
  '/convert-image': {
    title: 'Convert Image Format Online Free — PNG, JPG, WebP, AVIF | MONO-TRANSCODER',
    description: 'Convert images between PNG, JPG, WebP, and AVIF formats locally in your browser. Your photos never leave your device.',
    keywords: 'convert image format, png to jpg, jpg to png, webp to jpg, avif to jpg, image converter online',
    heading: 'Convert Image Format (PNG, JPG, WebP, AVIF)',
    intro: 'Transcode photos and graphics between PNG, JPEG, WebP, and AVIF formats directly in your browser using hardware-accelerated HTML5 Canvas.',
    steps: [
      'Select a JPG, PNG, WebP, or AVIF image from your device.',
      'Pick the target output format.',
      'Convert and download the transcoded image immediately.'
    ]
  },
  '/image-to-pdf': {
    title: 'Image to PDF Converter Online Free — Combine Photos into PDF | MONO-TRANSCODER',
    description: 'Convert JPG, PNG, and WebP images into a clean multi-page PDF document locally in your browser. Your photos never leave your device.',
    keywords: 'image to pdf, jpg to pdf, png to pdf, combine photos into pdf free',
    heading: 'Convert Images to PDF',
    intro: 'Turn receipt photos, scanned notes, and ID cards into a formatted single- or multi-page PDF locally.',
    steps: [
      'Select one or more JPG, PNG, or WebP images and arrange their order.',
      'Rotate individual images if needed.',
      'Compile and download your PDF document.'
    ]
  },
  '/merge-pdf': {
    title: 'Merge PDF Online Free — Combine PDF Files Locally | MONO-TRANSCODER',
    description: 'Combine multiple PDF documents into a single file in your browser. Reorder files with no uploads and no watermarks. Your documents never leave your device.',
    keywords: 'merge pdf, combine pdf files, pdf merger online free, join pdf documents',
    heading: 'Merge PDF Files Locally',
    intro: 'Combine contracts, invoices, and multi-part reports into one clean PDF document directly in your browser memory.',
    steps: [
      'Select two or more PDF files from your device.',
      'Reorder the files into your preferred sequence.',
      'Click Merge PDF to generate and download your combined file.'
    ]
  },
  '/pdf-to-images': {
    title: 'PDF to Images Converter Online Free — Export JPG & PNG | MONO-TRANSCODER',
    description: 'Render PDF pages into high-resolution JPG or PNG images locally in your browser. Export single images or a complete ZIP archive.',
    keywords: 'pdf to images, pdf to jpg, pdf to png high resolution, convert pdf page to photo',
    heading: 'Convert PDF Pages to Images',
    intro: 'Render every page of your PDF into crisp raster images or batch-export all pages as a ZIP archive without uploading your document.',
    steps: [
      'Select your PDF document.',
      'Preview the pages and run the local rasterizer.',
      'Download your page images or ZIP bundle.'
    ]
  },
  '/remove-pdf-pages': {
    title: 'Remove PDF Pages Online Free — Delete Unwanted Pages Locally | MONO-TRANSCODER',
    description: 'Preview page thumbnails and delete unwanted pages from any PDF file locally in your browser. Fast, lossless, and your documents never leave your device.',
    keywords: 'remove pdf pages, delete pages from pdf, split pdf pages, cut pdf pages online free',
    heading: 'Remove Unwanted PDF Pages',
    intro: 'Inspect every page thumbnail in your PDF, select the pages you want to discard, and export a clean PDF without uploading your file.',
    steps: [
      'Open your PDF document in the local page inspector.',
      'Click the pages you want to remove (or type a page range).',
      'Export the remaining pages as a new PDF.'
    ]
  },
  '/organize-pdf': {
    title: 'Organize PDF Pages Online Free — Reorder, Rotate & Duplicate | MONO-TRANSCODER',
    description: 'Reorder, rotate, duplicate, or delete PDF pages visually in your browser. Your documents never leave your device.',
    keywords: 'organize pdf pages, reorder pdf pages, rotate pdf pages, rearrange pdf online free',
    heading: 'Organize, Reorder & Rotate PDF Pages',
    intro: 'Visually drag and drop page thumbnails to change page order, rotate sideways pages by 90°/180°, duplicate sheets, or remove blank pages locally.',
    steps: [
      'Load your PDF into the visual thumbnail organizer.',
      'Reorder, rotate, duplicate, or delete individual pages.',
      'Save your newly organized PDF.'
    ]
  },
  '/watermark-pdf': {
    title: 'Watermark PDF Online Free — Add Custom Text or Logo Stamp | MONO-TRANSCODER',
    description: 'Stamp CONFIDENTIAL, DRAFT, or custom text and image watermarks across PDF pages locally in your browser. Customize opacity, rotation, and position.',
    keywords: 'watermark pdf, add watermark to pdf, stamp pdf pages, confidential pdf stamp',
    heading: 'Add Custom Watermark to PDF',
    intro: 'Overlay customizable text or image watermarks across your PDF pages without uploading files to a server.',
    steps: [
      'Open your PDF file in the live watermark previewer.',
      'Configure your text or logo watermark, opacity, angle, and placement.',
      'Apply and download your watermarked PDF.'
    ]
  },
  '/word-to-pdf': {
    title: 'Word to PDF Converter Online Free — Basic Local DOCX to PDF | MONO-TRANSCODER',
    description: 'Convert Word (.docx, .rtf, .txt) files to PDF locally in your browser with basic layout conversion. Preserves text, headings, tables, and embedded images without server uploads.',
    keywords: 'word to pdf, docx to pdf converter online, convert word to pdf locally',
    heading: 'Word (.docx) to PDF — Basic Local Conversion',
    intro: 'Convert `.docx`, `.rtf`, and `.txt` documents into PDF locally in your browser. Note: This uses a client-side parser for basic text, headings, lists, tables, and images—complex Word features (floating frames, SmartArt, macros, and custom embedded fonts) may differ from Microsoft Word, and non-Latin lines are rasterized.',
    steps: [
      'Select your .docx, .rtf, or .txt file to inspect the local document preview.',
      'Verify paragraphs, tables, and page sizing in the preview panel.',
      'Export to PDF locally.'
    ]
  },
  '/word-to-jpg': {
    title: 'Word to Image Converter Online Free — DOCX to High-Res JPG | MONO-TRANSCODER',
    description: 'Render Word (.docx, .rtf, .txt) document pages into high-resolution JPG or PNG images locally in your browser. Your documents never leave your device.',
    keywords: 'word to jpg, word to image, docx to jpg converter, word to png online free',
    heading: 'Word (.docx) to Image — Basic Local Conversion',
    intro: 'Render pages from a `.docx`, `.rtf`, or `.txt` document into shareable JPG or PNG images directly in your browser.',
    steps: [
      'Select your Word document.',
      'Preview the rendered pages and choose your output resolution.',
      'Download individual page images or a ZIP archive.'
    ]
  },
  '/pdf-to-word': {
    title: 'PDF to Word Converter Online Free — Extract Editable DOCX | MONO-TRANSCODER',
    description: 'Extract selectable text and paragraphs from PDF files into an editable Microsoft Word (.docx) document locally in your browser.',
    keywords: 'pdf to word, convert pdf to docx online free, extract text from pdf to word',
    heading: 'Convert PDF to Editable Word (.docx)',
    intro: 'Reconstruct text blocks, headings, and reading order from digital PDFs into an editable `.docx` file right on your device.',
    steps: [
      'Select a PDF containing selectable text.',
      'Preview the extracted paragraphs and sections.',
      'Download the generated .docx file.'
    ]
  },
  '/excel-to-pdf': {
    title: 'Excel to PDF Converter Online Free — Basic Local XLSX to PDF | MONO-TRANSCODER',
    description: 'Convert Excel (.xlsx) and CSV spreadsheets into paginated PDF tables locally in your browser. Financial data never leaves your device.',
    keywords: 'excel to pdf, xlsx to pdf converter, spreadsheet to pdf online free, csv to pdf',
    heading: 'Excel (.xlsx / .csv) to PDF — Basic Table Conversion',
    intro: 'Render spreadsheet rows, columns, and cell values into clean PDF tables locally in your browser. Note: Performs basic tabular conversion; pivot charts, VBA macros, and conditional formatting gradients are not rendered.',
    steps: [
      'Select your .xlsx or .csv spreadsheet.',
      'Choose page orientation and preview the extracted table grid.',
      'Export the paginated PDF.'
    ]
  },
  '/pdf-to-excel': {
    title: 'PDF to Excel Converter Online Free — Extract Tables to XLSX/CSV | MONO-TRANSCODER',
    description: 'Extract tabular rows and columns from PDF pages into editable Excel (.xlsx) or CSV spreadsheets locally in your browser.',
    keywords: 'pdf to excel, pdf to xlsx, pdf to csv, extract table from pdf online free',
    heading: 'Convert PDF Tables to Excel (.xlsx / .csv)',
    intro: 'Detect aligned rows and columns on PDF pages and export them into editable `.xlsx` or `.csv` files directly in your browser.',
    steps: [
      'Select a PDF containing tabular text.',
      'Inspect the detected rows and columns in the table preview.',
      'Export as an Excel (.xlsx) workbook or CSV file.'
    ]
  },
  '/powerpoint-to-pdf': {
    title: 'PowerPoint to PDF Converter Online Free — Basic Local PPTX to PDF | MONO-TRANSCODER',
    description: 'Convert PowerPoint (.pptx) slide decks into landscape PDF handouts locally in your browser. Your slides never leave your device.',
    keywords: 'powerpoint to pdf, pptx to pdf converter, ppt to pdf online free, slides to pdf',
    heading: 'PowerPoint (.pptx) to PDF — Basic Slide Conversion',
    intro: 'Extract slide text, shapes, and embedded images from `.pptx` presentations into a PDF deck locally. Note: Basic conversion—slide transitions, animations, SmartArt, and embedded media are not preserved.',
    steps: [
      'Upload your .pptx presentation file.',
      'Preview the rendered slide snapshots and optional speaker notes.',
      'Download the PDF presentation.'
    ]
  },
  '/pdf-to-powerpoint': {
    title: 'PDF to PowerPoint Converter Online Free — PDF to PPTX Slides | MONO-TRANSCODER',
    description: 'Transform PDF pages into widescreen PowerPoint (.pptx) presentations locally in your browser. Your documents never leave your device.',
    keywords: 'pdf to powerpoint, pdf to pptx, convert pdf to slides online free',
    heading: 'Convert PDF Pages to PowerPoint (.pptx)',
    intro: 'Convert PDF pages into an editable `.pptx` slide deck locally in your browser.',
    steps: [
      'Select your PDF file.',
      'Choose slide mode and preview the extracted slides.',
      'Download your PowerPoint (.pptx) presentation.'
    ]
  },
  '/lock-pdf': {
    title: 'Lock PDF Online Free — Basic Password Protection Locally | MONO-TRANSCODER',
    description: 'Add a password to your PDF files locally in your browser using standard PDF RC4-128 (V2/R3) basic protection. Your documents never leave your device.',
    keywords: 'lock pdf, password protect pdf, encrypt pdf online free, add password to pdf',
    heading: 'Password Protect PDF (Basic RC4-128)',
    intro: 'Apply standard PDF 1.4–1.6 RC4-128 (V2/R3) password protection and permission flags locally in your browser. Ideal for basic access control against casual viewing; for high-security archival encryption, use dedicated desktop AES-256 tools (such as qpdf or Acrobat).',
    steps: [
      'Select the PDF document you want to password-protect.',
      'Enter a user password to require on open and an optional owner password.',
      'Download your locked PDF directly from browser memory.'
    ]
  },
  '/unlock-pdf': {
    title: 'Unlock PDF Online Free — Remove PDF Password Locally | MONO-TRANSCODER',
    description: 'Remove known open passwords and permission restrictions from your PDF files locally in your browser. Your documents and passwords never leave your device.',
    keywords: 'unlock pdf, remove pdf password, decrypt pdf online, pdf password remover',
    heading: 'Unlock Password-Protected PDF',
    intro: 'Enter the password for a locked PDF once and save an unlocked copy so you do not have to type the password every time you open it.',
    steps: [
      'Select your password-protected PDF file.',
      'Enter the current open password when prompted.',
      'Download a clean, unlocked PDF copy.'
    ]
  },
  '/sign-pdf': {
    title: 'Sign PDF Online Free — Stamp Visual Signatures Privately | MONO-TRANSCODER',
    description: 'Draw, type, or upload a visual signature image and stamp it onto any PDF page locally in your browser. Note: Applies a visual signature appearance, not a cryptographic PKI signature.',
    keywords: 'sign pdf online, electronic signature pdf, stamp signature on pdf, draw signature on pdf free',
    heading: 'Sign PDF (Visual Signature Stamp)',
    intro: 'Draw with a mouse or touchscreen, type with self-hosted calligraphy fonts, or upload an ink signature image and position it on any PDF page. Note: This tool stamps a visual signature image onto the PDF—it does not apply a cryptographic digital certificate (PKI/X.509).',
    steps: [
      'Open your PDF and navigate to the page that needs a signature.',
      'Draw, type, or upload your signature and drag it into position.',
      'Export your flattened, visually signed PDF locally.'
    ]
  },
  '/passport-photo': {
    title: 'Passport Photo Maker Online Free — US, UK, India, EU Sizes | MONO-TRANSCODER',
    description: 'Crop biometric passport, visa, and ID photos (2x2 inch, 35x45mm) with printable 4x6 sheets locally in your browser. Your portrait photos never leave your device.',
    keywords: 'passport photo maker, 2x2 photo maker free, 35x45mm passport photo, visa photo cropper, printable passport photo sheet',
    heading: 'Passport & ID Photo Maker',
    intro: 'Crop biometric ID and visa photos to official dimensions (US 2×2", UK/EU/India 35×45mm, China 33×48mm, Canada 50×70mm) and generate printable 4×6" sheets locally. Note: Background removal uses colour-cluster flood fill + manual brush touch-up; many issuing authorities reject digitally altered photos or suit overlays.',
    steps: [
      'Select a well-lit portrait photo taken against a plain wall.',
      'Choose your country size preset and align your face to the biometric guide.',
      'Download a single photo or a printable 4×6" multi-photo sheet.'
    ]
  },
  '/support': {
    title: 'Support Independent Local-First Software | MONO-TRANSCODER',
    description: 'Support the development of MONO-TRANSCODER — free, ad-free, local-first PDF and image utilities.',
    keywords: 'support mono transcoder, buy me a coffee open web tools',
    heading: 'Support Local-First Tools',
    intro: 'MONO-TRANSCODER is free to use with no paywalls, watermarks, or server tracking. Voluntary contributions help keep the project independent.'
  },
  '/privacy': {
    title: 'Privacy Policy & Local Processing Architecture | MONO-TRANSCODER',
    description: 'Learn how MONO-TRANSCODER processes all 20 PDF and image tools locally on your device, and what optional Google Sign-In stores if you choose to use it.',
    keywords: 'mono transcoder privacy policy, client side pdf privacy',
    heading: 'Privacy Policy & Local Architecture',
    intro: 'Your documents and photos never leave your device. Read our full disclosure on local browser processing and optional Google Sign-In for saved signatures.'
  },
  '/terms': {
    title: 'Terms of Service | MONO-TRANSCODER',
    description: 'Terms of use and disclaimers for MONO-TRANSCODER client-side PDF and image utilities.',
    keywords: 'mono transcoder terms of service',
    heading: 'Terms of Service',
    intro: 'Terms governing the use of the 20 local-first document and image processing tools in MONO-TRANSCODER.'
  },
  '/download': {
    title: 'Download Processed Files | MONO-TRANSCODER',
    description: 'Download your locally processed PDF or image files from browser memory.',
    keywords: 'download processed pdf',
    heading: 'Download Desk',
    intro: 'Your processed files are ready in temporary browser memory.'
  },
  '/404': {
    title: '404 — Page Not Found | MONO-TRANSCODER',
    description: 'The requested page could not be found. Browse all 20 local PDF and image tools on MONO-TRANSCODER.',
    keywords: '404 not found',
    heading: 'Page Not Found',
    intro: 'The URL you requested does not exist. Return to the main tool directory to access all 20 PDF and image utilities.'
  },
};

export function buildStructuredDataForRoute(canonicalPath: string, siteOrigin: string = DEFAULT_SITE_ORIGIN): Record<string, unknown> | null {
  if (canonicalPath === '/404' || canonicalPath === '/download') {
    return null;
  }

  const meta = ROUTE_METADATA[canonicalPath] || ROUTE_METADATA['/'];
  const fullUrl = canonicalPath === '/' ? `${siteOrigin}/` : `${siteOrigin}${canonicalPath}`;

  if (canonicalPath === '/privacy' || canonicalPath === '/terms' || canonicalPath === '/support') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url: fullUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: 'MONO-TRANSCODER',
        url: `${siteOrigin}/`
      }
    };
  }

  const webAppNode: Record<string, unknown> = {
    '@type': 'WebApplication',
    name: canonicalPath === '/' ? 'MONO-TRANSCODER' : meta.title.split(' | ')[0],
    url: fullUrl,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'All (Web Browser)',
    browserRequirements: 'Requires HTML5 Canvas and JavaScript',
    description: meta.description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return {
    '@context': 'https://schema.org',
    ...webAppNode,
  };
}

export const Helmet: React.FC<HelmetProps> = ({ view }) => {
  useEffect(() => {
    const rawPathname = window.location.pathname;
    const cleanPath = normalizePathname(rawPathname);
    const isDownloadView = view.endsWith('_download');
    const canonicalPath = view === 'not_found'
      ? '/404'
      : isDownloadView
        ? '/download'
        : getCanonicalPathForLocation(cleanPath, view);
    const meta = ROUTE_METADATA[canonicalPath] || ROUTE_METADATA['/'];
    const isNoIndex = view === 'not_found' || isDownloadView || canonicalPath === '/404' || canonicalPath === '/download';

    document.title = meta.title;

    const updateMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const fullCanonicalUrl = canonicalPath === '/'
      ? `${DEFAULT_SITE_ORIGIN}/`
      : `${DEFAULT_SITE_ORIGIN}${canonicalPath}`;

    updateMeta('description', meta.description);
    updateMeta('keywords', meta.keywords);
    updateMeta(
      'robots',
      isNoIndex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    );
    updateMeta('og:title', meta.title, true);
    updateMeta('og:description', meta.description, true);
    updateMeta('og:url', fullCanonicalUrl, true);
    updateMeta('og:image', `${DEFAULT_SITE_ORIGIN}/og-image.png`, true);
    updateMeta('twitter:title', meta.title);
    updateMeta('twitter:description', meta.description);
    updateMeta('twitter:url', fullCanonicalUrl);
    updateMeta('twitter:image', `${DEFAULT_SITE_ORIGIN}/og-image.png`);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', fullCanonicalUrl);

    const legacyDynamic = document.querySelector('script#dynamic-schema');
    if (legacyDynamic) {
      legacyDynamic.remove();
    }

    let script = document.querySelector('script#schema-structured-data');
    const structuredData = buildStructuredDataForRoute(canonicalPath, DEFAULT_SITE_ORIGIN);
    if (!structuredData) {
      if (script) script.remove();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('id', 'schema-structured-data');
        script.setAttribute('type', 'application/ld+json');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }
  }, [view]);

  return null;
};

export default Helmet;
