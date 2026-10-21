/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Presentation,
  FolderOpen,
  Zap,
  Layers,
  Type as TypeIcon,
} from "lucide-react";
import JSZip from "jszip";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface PdfToPptViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

interface ExtractedSlidePreview {
  pageNumber: number;
  title: string;
  lines: string[];
  thumbDataUrl: string;
  widthPt: number;
  heightPt: number;
}

type ConversionMode = "VISUAL_AND_NOTES" | "EDITABLE_SLIDES" | "VISUAL_SLIDES_ONLY";
type AspectRatioPreset = "16_9" | "4_3";
type RenderDpiPreset = "150_DPI" | "220_DPI" | "300_DPI";

const DPI_SCALE_MAP: Record<RenderDpiPreset, { scale: number; label: string }> = {
  "150_DPI": { scale: 1.5, label: "150 DPI (STD)" },
  "220_DPI": { scale: 2.1, label: "220 DPI (HD)" },
  "300_DPI": { scale: 2.75, label: "300 DPI (ULTRA)" },
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds a compliant OpenXML .pptx presentation archive in browser memory
 */
async function buildOpenXmlPptxArchive(
  slides: {
    pageNumber: number;
    title: string;
    lines: string[];
    jpegBytes: Uint8Array;
  }[],
  aspectRatio: AspectRatioPreset,
  mode: ConversionMode
): Promise<Blob> {
  const zip = new JSZip();

  // Slide size in EMUs (1 inch = 914400 EMUs)
  // 16:9 Widescreen = 13.333" x 7.5" -> 12192000 x 6858000
  // 4:3 Standard = 10" x 7.5" -> 9144000 x 6858000
  const cx = aspectRatio === "16_9" ? 12192000 : 9144000;
  const cy = 6858000;

  // 1. [Content_Types].xml
  const slideOverrides = slides
    .map(
      (_, idx) =>
        `  <Override PartName="/ppt/slides/slide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join("\n");

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverrides}
</Types>`;
  zip.file("[Content_Types].xml", contentTypesXml);

  // 2. _rels/.rels
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  // 3. ppt/_rels/presentation.xml.rels
  const presSlideRels = slides
    .map(
      (_, idx) =>
        `  <Relationship Id="rIdSlide${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`
    )
    .join("\n");

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
${presSlideRels}
</Relationships>`
  );

  // 4. ppt/presentation.xml
  const sldIdLst = slides
    .map(
      (_, idx) =>
        `    <p:sldId id="${256 + idx}" r:id="rIdSlide${idx + 1}"/>`
    )
    .join("\n");

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rIdMaster1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${sldIdLst}
  </p:sldIdLst>
  <p:sldSz cx="${cx}" cy="${cy}" type="${aspectRatio === "16_9" ? "screen16x9" : "screen4x3"}"/>
  <p:notesSz cx="${cy}" cy="${cx}"/>
</p:presentation>`
  );

  // 5. Minimal SlideMaster, SlideLayout, and Theme
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );

  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgRef idx="1001">
        <a:schemeClr val="bg1"/>
      </p:bgRef>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rIdLayout1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`
  );

  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>`
  );

  zip.file(
    "ppt/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  // 6. Generate each slide and media file
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i];
    const slideIdx = i + 1;
    const includeImage = mode !== "EDITABLE_SLIDES";
    const includeTextShapes = mode === "EDITABLE_SLIDES" || mode === "VISUAL_AND_NOTES";

    if (includeImage) {
      zip.file(`ppt/media/slide_img_${slideIdx}.jpg`, sl.jpegBytes);
    }

    zip.file(
      `ppt/slides/_rels/slide${slideIdx}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
${
  includeImage
    ? `  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide_img_${slideIdx}.jpg"/>`
    : ""
}
</Relationships>`
    );

    const picXml = includeImage
      ? `      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="SlideImage${slideIdx}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rIdImg1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="${cx}" cy="${cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>`
      : "";

    let textShapeXml = "";
    if (mode === "EDITABLE_SLIDES") {
      const titleXml = `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="SlideTitle${slideIdx}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="365760"/>
            <a:ext cx="${cx - 914400}" cy="914400"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="2800" b="1"/>
              <a:t>${escapeXml(sl.title)}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>`;

      const bodyParagraphs = (sl.lines.length > 0 ? sl.lines : [sl.title])
        .slice(0, 18)
        .map(
          (ln) => `          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="1600"/>
              <a:t>${escapeXml(ln)}</a:t>
            </a:r>
          </a:p>`
        )
        .join("\n");

      const bodyXml = `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="4" name="SlideBody${slideIdx}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1371600"/>
            <a:ext cx="${cx - 914400}" cy="${cy - 1828800}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
${bodyParagraphs}
        </p:txBody>
      </p:sp>`;

      textShapeXml = `${titleXml}\n${bodyXml}`;
    } else if (includeTextShapes && sl.lines.length > 0) {
      // Hidden or off-canvas searchable text box for hybrid slides so Ctrl+F works inside PowerPoint
      const searchParagraphs = sl.lines
        .slice(0, 25)
        .map(
          (ln) => `          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="1000">
                <a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill>
              </a:rPr>
              <a:t>${escapeXml(ln)}</a:t>
            </a:r>
          </a:p>`
        )
        .join("\n");

      textShapeXml = `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="EditableTextOverlay${slideIdx}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="365760" y="365760"/>
            <a:ext cx="${cx - 731520}" cy="${cy - 731520}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
${searchParagraphs}
        </p:txBody>
      </p:sp>`;
    }

    zip.file(
      `ppt/slides/slide${slideIdx}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
${picXml}
${textShapeXml}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`
    );
  }

  return await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export default function PdfToPptView({
  onSuccess,
  askPassword,
  initialFile,
}: PdfToPptViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [unlockedPassword, setUnlockedPassword] = useState<string | undefined>(undefined);
  const [slidePreviews, setSlidePreviews] = useState<ExtractedSlidePreview[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Settings
  const [conversionMode, setConversionMode] = useState<ConversionMode>("VISUAL_AND_NOTES");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>("16_9");
  const [renderDpi, setRenderDpi] = useState<RenderDpiPreset>("220_DPI");

  const handleLoadPdfFile = useCallback(
    async (selected: File) => {
      if (
        selected.type !== "application/pdf" &&
        !selected.name.toLowerCase().endsWith(".pdf")
      ) {
        showToast("Please select a valid PDF document.", "error");
        return;
      }

      setFile(selected);
      setIsParsing(true);
      setProgressMsg("INITIALIZING_PDF_SLIDE_SCANNER...");

      let pdfDoc: any = null;
      try {
        await yieldFrame();
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        let activePassword: string | undefined = undefined;
        const openWithPwd = async (pwd?: string): Promise<any> => {
          const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) params.password = pwd;
          try {
            const doc = await pdfjsLib.getDocument(params).promise;
            activePassword = pwd;
            return doc;
          } catch (err: any) {
            const isPwd =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              String(err?.message || "").toLowerCase().includes("password");
            if (isPwd) {
              const userPwd = await askPassword(pwd ? "wrong" : "required");
              if (userPwd === null) {
                throw new Error("Password prompt cancelled.");
              }
              return openWithPwd(userPwd);
            }
            throw err;
          }
        };

        pdfDoc = await openWithPwd();
        setUnlockedPassword(activePassword);

        const numPages = pdfDoc.numPages;
        const previews: ExtractedSlidePreview[] = [];
        const thumbCanvas = document.createElement("canvas");
        const thumbCtx = thumbCanvas.getContext("2d");

        for (let i = 1; i <= numPages; i++) {
          setProgressMsg(`ANALYZING_PAGE_${i}_OF_${numPages}...`);
          const page = await pdfDoc.getPage(i);
          const vp = page.getViewport({ scale: 1.0 });
          const thumbVp = page.getViewport({ scale: 0.45 });

          thumbCanvas.width = Math.max(1, Math.round(thumbVp.width));
          thumbCanvas.height = Math.max(1, Math.round(thumbVp.height));
          if (thumbCtx) {
            thumbCtx.fillStyle = "#ffffff";
            thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
            await page.render({ canvasContext: thumbCtx, viewport: thumbVp }).promise;
          }
          const thumbDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.78);

          // Extract text lines
          const textContent = await page.getTextContent();
          const lineMap = new Map<number, { x: number; str: string }[]>();
          for (const item of textContent.items as any[]) {
            const str = String(item.str || "").trim();
            if (!str) continue;
            const y = Math.round((item.transform?.[5] || 0) / 4) * 4;
            const x = item.transform?.[4] || 0;
            const bucket = lineMap.get(y) || [];
            bucket.push({ x, str });
            lineMap.set(y, bucket);
          }

          const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
          const lines: string[] = [];
          for (const y of sortedYs) {
            const row = (lineMap.get(y) || []).sort((a, b) => a.x - b.x);
            const joined = row.map((r) => r.str).join(" ").trim();
            if (joined) lines.push(joined);
          }

          previews.push({
            pageNumber: i,
            title: lines[0] ? lines[0].slice(0, 80) : `Slide ${i}`,
            lines: lines.slice(1),
            thumbDataUrl,
            widthPt: Math.round(vp.width),
            heightPt: Math.round(vp.height),
          });

          if (typeof page.cleanup === "function") page.cleanup();
        }

        thumbCanvas.width = 0;
        thumbCanvas.height = 0;
        setSlidePreviews(previews);
      } catch (err: any) {
        logger.error("PDF to PPTX parse error:", err);
        showToast(`Failed to read PDF: ${err?.message || err}`, "error");
        setFile(null);
        setSlidePreviews([]);
      } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
          pdfDoc.destroy();
        }
        setIsParsing(false);
        setProgressMsg("");
      }
    },
    [askPassword, showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadPdfFile(initialFile);
    }
  }, [initialFile, handleLoadPdfFile]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleLoadPdfFile(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadPdfFile]);

  const stats = useMemo(() => {
    const totalLines = slidePreviews.reduce((acc, s) => acc + s.lines.length + 1, 0);
    return {
      slideCount: slidePreviews.length,
      totalLines,
    };
  }, [slidePreviews]);

  const handleReset = () => {
    setFile(null);
    setSlidePreviews([]);
    setUnlockedPassword(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConvertToPptx = async () => {
    if (!file || slidePreviews.length === 0) return;

    setIsProcessing(true);
    setProgressMsg("RENDERING_HIGH_DPI_SLIDE_FRAMES...");

    let pdfDoc: any = null;
    try {
      await yieldFrame();
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await loadPdfJsLibrary();
      const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
      if (unlockedPassword) params.password = unlockedPassword;
      pdfDoc = await pdfjsLib.getDocument(params).promise;

      const scale = DPI_SCALE_MAP[renderDpi].scale;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const slidePayload: {
        pageNumber: number;
        title: string;
        lines: string[];
        jpegBytes: Uint8Array;
      }[] = [];

      for (let i = 0; i < slidePreviews.length; i++) {
        const preview = slidePreviews[i];
        setProgressMsg(`ENCODING_PPTX_SLIDE_${i + 1}_OF_${slidePreviews.length}...`);
        await yieldFrame();

        let jpegBytes = new Uint8Array(0);
        if (conversionMode !== "EDITABLE_SLIDES") {
          const page = await pdfDoc.getPage(preview.pageNumber);
          const vp = page.getViewport({ scale });
          canvas.width = Math.max(1, Math.round(vp.width));
          canvas.height = Math.max(1, Math.round(vp.height));
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          }

          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob(
              (b) => (b ? res(b) : rej(new Error("Slide canvas encode failed"))),
              "image/jpeg",
              0.88
            )
          );
          jpegBytes = new Uint8Array(await blob.arrayBuffer());
          if (typeof page.cleanup === "function") page.cleanup();
        }

        slidePayload.push({
          pageNumber: preview.pageNumber,
          title: preview.title,
          lines: preview.lines,
          jpegBytes,
        });
      }

      canvas.width = 0;
      canvas.height = 0;

      setProgressMsg("PACKING_OPENXML_PPTX_ARCHIVE...");
      const pptxBlob = await buildOpenXmlPptxArchive(
        slidePayload,
        aspectRatio,
        conversionMode
      );

      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      await saveFile("pdf_to_ppt", {
        blob: pptxBlob,
        filename: `${cleanName}_monotranscoder`,
        size: pptxBlob.size,
        format: "pptx",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("PDF converted to PowerPoint (.pptx) successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("PDF to PPTX error:", err);
      showToast(`Failed to convert PDF to PowerPoint: ${err?.message || err}`, "error");
    } finally {
      if (pdfDoc && typeof pdfDoc.destroy === "function") {
        pdfDoc.destroy();
      }
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="pdf-to-ppt-view"
      aria-labelledby="pdf-to-ppt-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="pdf-to-ppt-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            PDF TO POWERPOINT // PDF_TO_PPT.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Convert PDF pages into PowerPoint (.pptx) presentation slide decks directly in browser memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="pdf-to-ppt-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to convert to PowerPoint"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadPdfFile(e.dataTransfer.files[0]);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-white bg-zinc-900"
              : "border-zinc-700 hover:border-white hover:bg-zinc-950"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadPdfFile(f);
            }}
            accept=".pdf,application/pdf"
            className="hidden"
            aria-label="Select PDF File"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <Presentation className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF DOCUMENT (.PDF)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Builds a standards-compliant OpenXML .pptx presentation deck with zero server uploads.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_PDF_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="pdf_to_ppt"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${slidePreviews.length} SLIDES (.PPTX)`}
          statusMessage={
            progressMsg ||
            (isParsing ? "SCANNING_PDF_PAGES..." : "BUILDING_PPTX_ARCHIVE...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Slide Thumbnail & Text Preview */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" /> EXTRACTED_SLIDE_FRAMES
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                {stats.slideCount} SLIDES · {stats.totalLines} TEXT LINES
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {slidePreviews.map((sl) => (
                <div
                  key={sl.pageNumber}
                  className="bg-black border border-zinc-800 rounded-lg p-2.5 flex flex-col justify-between space-y-2"
                >
                  <div className="aspect-video bg-zinc-900 rounded overflow-hidden flex items-center justify-center border border-zinc-800">
                    <img
                      src={sl.thumbDataUrl}
                      alt={`Slide ${sl.pageNumber} preview`}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span className="font-bold text-amber-400">SLIDE #{sl.pageNumber}</span>
                      <span>
                        {sl.widthPt}×{sl.heightPt}
                      </span>
                    </div>
                    <p className="text-[11px] font-sans font-bold text-white truncate mt-0.5" title={sl.title}>
                      {sl.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TOTAL_SLIDES</span>
                <strong className="text-amber-400">{stats.slideCount}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TEXT_LINES</span>
                <strong className="text-emerald-400 flex items-center gap-1">
                  <TypeIcon className="w-3 h-3" /> {stats.totalLines}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">OUTPUT_CONTAINER</span>
                <strong className="text-sky-400">OPENXML .PPTX</strong>
              </div>
            </div>
          </div>

          {/* Right: PPTX Generation Options */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-amber-400" /> PPTX_BUILDER.CFG
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                >
                  [CHANGE_FILE]
                </button>
              </div>

              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_FILE:</span>
                  <strong className="text-emerald-400 truncate max-w-[180px]" title={file.name}>
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_SIZE:</span>
                  <strong className="text-amber-400 tabular-nums">{formatBytes(file.size)}</strong>
                </div>
              </div>

              {/* Conversion Mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  SLIDE RECONSTRUCTION MODE:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      {
                        key: "VISUAL_AND_NOTES",
                        label: "HYBRID (EXACT VISUAL SLIDES + TEXT LAYER)",
                      },
                      {
                        key: "EDITABLE_SLIDES",
                        label: "EDITABLE TEXT BOXES ONLY (LIGHTWEIGHT)",
                      },
                      {
                        key: "VISUAL_SLIDES_ONLY",
                        label: "1:1 FULL-BLEED SLIDE GRAPHICS ONLY",
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setConversionMode(m.key)}
                      className={`py-2 px-3 rounded-lg font-mono text-[11px] font-bold uppercase border-2 text-left transition-all cursor-pointer ${
                        conversionMode === m.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slide Aspect Ratio */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  SLIDE ASPECT RATIO:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "16_9", label: "16:9 WIDESCREEN" },
                      { key: "4_3", label: "4:3 STANDARD" },
                    ] as const
                  ).map((ar) => (
                    <button
                      key={ar.key}
                      type="button"
                      onClick={() => setAspectRatio(ar.key)}
                      className={`py-2 px-2.5 rounded-lg font-mono text-xs font-bold uppercase border-2 transition-all cursor-pointer ${
                        aspectRatio === ar.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Render Resolution */}
              {conversionMode !== "EDITABLE_SLIDES" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    SLIDE RENDER QUALITY:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["150_DPI", "220_DPI", "300_DPI"] as RenderDpiPreset[]).map((dpi) => (
                      <button
                        key={dpi}
                        type="button"
                        onClick={() => setRenderDpi(dpi)}
                        className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          renderDpi === dpi
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {DPI_SCALE_MAP[dpi].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleConvertToPptx}
              disabled={isProcessing}
              aria-label="Convert PDF to PowerPoint Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT PDF TO POWERPOINT NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
