/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  FolderOpen,
  Zap,
  AlignLeft,
  Table as TableIcon,
  Image as ImageIcon,
  Layers,
} from "lucide-react";
import JSZip from "jszip";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";

interface WordToJpgViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

type DocBlock =
  | {
      type: "paragraph";
      text: string;
      style: "title" | "h1" | "h2" | "h3" | "body" | "list";
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right";
    }
  | {
      type: "table";
      rows: string[][];
    }
  | {
      type: "image";
      dataUrl: string;
      width: number;
      height: number;
    }
  | {
      type: "pageBreak";
    };

type PageSizePreset = "A4" | "LETTER";
type MarginPreset = "COMPACT" | "NORMAL" | "WIDE";
type FontScalePreset = "SMALL" | "MEDIUM" | "LARGE";
type DpiPreset = "150_DPI" | "220_DPI" | "300_DPI";
type MultiPageExportMode = "ZIP_PAGES" | "LONG_SINGLE_JPG";

const PAGE_DIMENSIONS: Record<PageSizePreset, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  LETTER: { width: 612, height: 792 },
};

const MARGIN_VALUES: Record<MarginPreset, number> = {
  COMPACT: 36,
  NORMAL: 54,
  WIDE: 72,
};

const FONT_SCALE_MULTIPLIER: Record<FontScalePreset, number> = {
  SMALL: 0.9,
  MEDIUM: 1.0,
  LARGE: 1.15,
};

const DPI_SCALE_MAP: Record<DpiPreset, { scale: number; label: string }> = {
  "150_DPI": { scale: 1.6, label: "150 DPI (STD)" },
  "220_DPI": { scale: 2.25, label: "220 DPI (HD)" },
  "300_DPI": { scale: 3.0, label: "300 DPI (ULTRA)" },
};

/**
 * Extracts structured blocks from a .docx archive or plain text buffer in browser memory
 */
async function parseWordDocumentForJpg(file: File): Promise<DocBlock[]> {
  const arrayBuffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();

  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZipHeader =
    headerBytes.length >= 4 &&
    headerBytes[0] === 0x50 &&
    headerBytes[1] === 0x4b &&
    headerBytes[2] === 0x03 &&
    headerBytes[3] === 0x04;

  if (isZipHeader || lowerName.endsWith(".docx")) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      throw new Error("Invalid .docx structure: missing word/document.xml.");
    }

    const relsMap = new Map<string, string>();
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const parser = new DOMParser();
      const relsDom = parser.parseFromString(relsXml, "application/xml");
      const relNodes = Array.from(relsDom.getElementsByTagName("Relationship"));
      for (const rel of relNodes) {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) {
          relsMap.set(id, target.replace(/^\/+/, ""));
        }
      }
    }

    const xmlText = await docXmlFile.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    const body =
      xmlDoc.getElementsByTagName("w:body")[0] ||
      xmlDoc.getElementsByTagName("body")[0];
    if (!body) {
      throw new Error("Could not locate document body in word/document.xml.");
    }

    const blocks: DocBlock[] = [];

    const extractParagraphBlock = async (pNode: Element): Promise<DocBlock[]> => {
      const result: DocBlock[] = [];
      let style: "title" | "h1" | "h2" | "h3" | "body" | "list" = "body";
      let align: "left" | "center" | "right" = "left";
      let isBold = false;
      let isItalic = false;

      const pPr =
        pNode.getElementsByTagName("w:pPr")[0] ||
        pNode.getElementsByTagName("pPr")[0];
      if (pPr) {
        const pStyleNode =
          pPr.getElementsByTagName("w:pStyle")[0] ||
          pPr.getElementsByTagName("pStyle")[0];
        const styleVal = (
          pStyleNode?.getAttribute("w:val") ||
          pStyleNode?.getAttribute("val") ||
          ""
        ).toLowerCase();

        if (styleVal.includes("title")) style = "title";
        else if (styleVal.includes("heading1") || styleVal === "h1" || styleVal === "1")
          style = "h1";
        else if (styleVal.includes("heading2") || styleVal === "h2" || styleVal === "2")
          style = "h2";
        else if (styleVal.includes("heading3") || styleVal === "h3" || styleVal === "3")
          style = "h3";
        else if (styleVal.includes("list")) style = "list";

        const numPr =
          pPr.getElementsByTagName("w:numPr")[0] ||
          pPr.getElementsByTagName("numPr")[0];
        if (numPr && style === "body") {
          style = "list";
        }

        const jcNode =
          pPr.getElementsByTagName("w:jc")[0] || pPr.getElementsByTagName("jc")[0];
        const jcVal = (
          jcNode?.getAttribute("w:val") ||
          jcNode?.getAttribute("val") ||
          ""
        ).toLowerCase();
        if (jcVal === "center") align = "center";
        else if (jcVal === "right" || jcVal === "end") align = "right";
      }

      // Check for embedded images inside paragraph runs
      const blips = [
        ...Array.from(pNode.getElementsByTagName("a:blip")),
        ...Array.from(pNode.getElementsByTagName("blip")),
      ];
      for (const blip of blips) {
        const embedId =
          blip.getAttribute("r:embed") || blip.getAttribute("embed");
        if (embedId && relsMap.has(embedId)) {
          const targetPath = relsMap.get(embedId)!;
          const fullZipPath = targetPath.startsWith("word/")
            ? targetPath
            : `word/${targetPath}`;
          const mediaFile = zip.file(fullZipPath);
          if (mediaFile) {
            try {
              const imgBytes = await mediaFile.async("uint8array");
              const lowerTarget = fullZipPath.toLowerCase();
              if (
                lowerTarget.endsWith(".png") ||
                lowerTarget.endsWith(".jpg") ||
                lowerTarget.endsWith(".jpeg") ||
                lowerTarget.endsWith(".webp")
              ) {
                const mimeType = lowerTarget.endsWith(".png")
                  ? "image/png"
                  : lowerTarget.endsWith(".webp")
                  ? "image/webp"
                  : "image/jpeg";
                const blob = new Blob([imgBytes], { type: mimeType });
                const dataUrl = await new Promise<string>((res) => {
                  const reader = new FileReader();
                  reader.onloadend = () => res(String(reader.result || ""));
                  reader.readAsDataURL(blob);
                });
                const dims = await new Promise<{ width: number; height: number }>(
                  (res) => {
                    const img = new Image();
                    img.onload = () =>
                      res({
                        width: img.naturalWidth || 400,
                        height: img.naturalHeight || 300,
                      });
                    img.onerror = () => res({ width: 400, height: 300 });
                    img.src = dataUrl;
                  }
                );
                result.push({
                  type: "image",
                  dataUrl,
                  width: dims.width,
                  height: dims.height,
                });
              }
            } catch (imgErr) {
              logger.warn("Skipped embedded DOCX image:", imgErr);
            }
          }
        }
      }

      let textChunks: string[] = [];
      let runBoldCount = 0;
      let runItalicCount = 0;
      let totalRunsWithText = 0;
      let maxFontSizeHalfPts = 0;

      const runs = [
        ...Array.from(pNode.getElementsByTagName("w:r")),
        ...Array.from(pNode.getElementsByTagName("r")),
      ];

      for (const run of runs) {
        const rPr =
          run.getElementsByTagName("w:rPr")[0] ||
          run.getElementsByTagName("rPr")[0];
        let rBold = false;
        let rItalic = false;

        if (rPr) {
          const bNode =
            rPr.getElementsByTagName("w:b")[0] || rPr.getElementsByTagName("b")[0];
          if (bNode) {
            const val = bNode.getAttribute("w:val") || bNode.getAttribute("val");
            if (val !== "0" && val !== "false") rBold = true;
          }
          const iNode =
            rPr.getElementsByTagName("w:i")[0] || rPr.getElementsByTagName("i")[0];
          if (iNode) {
            const val = iNode.getAttribute("w:val") || iNode.getAttribute("val");
            if (val !== "0" && val !== "false") rItalic = true;
          }
          const szNode =
            rPr.getElementsByTagName("w:sz")[0] ||
            rPr.getElementsByTagName("sz")[0];
          if (szNode) {
            const szVal = parseInt(
              szNode.getAttribute("w:val") || szNode.getAttribute("val") || "0",
              10
            );
            if (!isNaN(szVal) && szVal > maxFontSizeHalfPts) {
              maxFontSizeHalfPts = szVal;
            }
          }
        }

        let runStr = "";
        for (let i = 0; i < run.childNodes.length; i++) {
          const child = run.childNodes[i] as Element;
          const nodeName = child.nodeName.toLowerCase();
          if (nodeName === "w:t" || nodeName === "t") {
            runStr += child.textContent || "";
          } else if (nodeName === "w:tab" || nodeName === "tab") {
            runStr += "    ";
          } else if (nodeName === "w:br" || nodeName === "br") {
            const brType =
              child.getAttribute?.("w:type") || child.getAttribute?.("type");
            if (brType === "page") {
              if (textChunks.join("").trim()) {
                result.push({
                  type: "paragraph",
                  text: textChunks.join(""),
                  style,
                  bold: isBold,
                  italic: isItalic,
                  align,
                });
                textChunks = [];
              }
              result.push({ type: "pageBreak" });
            } else {
              runStr += "\n";
            }
          }
        }

        if (runStr.length > 0) {
          textChunks.push(runStr);
          if (runStr.trim().length > 0) {
            totalRunsWithText++;
            if (rBold) runBoldCount++;
            if (rItalic) runItalicCount++;
          }
        }
      }

      if (textChunks.length === 0 && runs.length === 0) {
        const rawText = pNode.textContent?.trim() || "";
        if (rawText) {
          textChunks.push(rawText);
        }
      }

      const combinedText = textChunks.join("").replace(/\r\n/g, "\n");
      if (combinedText.trim().length > 0) {
        if (totalRunsWithText > 0 && runBoldCount === totalRunsWithText) {
          isBold = true;
        }
        if (totalRunsWithText > 0 && runItalicCount === totalRunsWithText) {
          isItalic = true;
        }
        if (style === "body") {
          if (maxFontSizeHalfPts >= 40) style = "title";
          else if (maxFontSizeHalfPts >= 32) style = "h1";
          else if (maxFontSizeHalfPts >= 28) style = "h2";
          else if (maxFontSizeHalfPts >= 25 && isBold) style = "h3";
        }

        const lines = combinedText.split("\n");
        for (const line of lines) {
          if (line.trim().length > 0) {
            result.push({
              type: "paragraph",
              text: line,
              style,
              bold: isBold,
              italic: isItalic,
              align,
            });
          }
        }
      }

      return result;
    };

    for (let i = 0; i < body.childNodes.length; i++) {
      const node = body.childNodes[i] as Element;
      if (!node || !node.nodeName) continue;
      const tag = node.nodeName.toLowerCase();

      if (tag === "w:p" || tag === "p") {
        const pBlocks = await extractParagraphBlock(node);
        blocks.push(...pBlocks);
      } else if (tag === "w:tbl" || tag === "tbl") {
        const rows: string[][] = [];
        const trNodes = [
          ...Array.from(node.getElementsByTagName("w:tr")),
          ...Array.from(node.getElementsByTagName("tr")),
        ];
        for (const tr of trNodes) {
          const rowCells: string[] = [];
          const tcNodes = [
            ...Array.from(tr.getElementsByTagName("w:tc")),
            ...Array.from(tr.getElementsByTagName("tc")),
          ];
          for (const tc of tcNodes) {
            const cellText = (tc.textContent || "").trim().replace(/\s+/g, " ");
            rowCells.push(cellText);
          }
          if (rowCells.some((c) => c.length > 0)) {
            rows.push(rowCells);
          }
        }
        if (rows.length > 0) {
          blocks.push({ type: "table", rows });
        }
      }
    }

    if (blocks.length === 0) {
      const fallbackText = (body.textContent || "").trim();
      if (fallbackText) {
        blocks.push({
          type: "paragraph",
          text: fallbackText,
          style: "body",
        });
      }
    }

    return blocks;
  }

  // Fallback for plain text / RTF / legacy .doc text extraction
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let rawString = decoder.decode(arrayBuffer);

  if (lowerName.endsWith(".rtf") || rawString.startsWith("{\\rtf")) {
    rawString = rawString
      .replace(/\\par[d]?/g, "\n")
      .replace(/\{\\[^{}]+\}/g, "")
      .replace(/\\[a-zA-Z]+\d*\s?/g, "")
      .replace(/[{}]/g, "");
  }

  const lines = rawString.split(/\r?\n/);
  const blocks: DocBlock[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      blocks.push({
        type: "paragraph",
        text: trimmed,
        style: "body",
      });
    }
  }

  if (blocks.length === 0) {
    throw new Error("No readable text content found in the selected document.");
  }

  return blocks;
}

export default function WordToJpgView({ onSuccess, initialFile }: WordToJpgViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [file, setFile] = useState<File | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [pageSize, setPageSize] = useState<PageSizePreset>("A4");
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("NORMAL");
  const [fontScale, setFontScale] = useState<FontScalePreset>("MEDIUM");
  const [dpiPreset, setDpiPreset] = useState<DpiPreset>("220_DPI");
  const [jpgQuality, setJpgQuality] = useState<number>(92);
  const [multiPageMode, setMultiPageMode] = useState<MultiPageExportMode>("ZIP_PAGES");

  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadWordFile = useCallback(
    async (selectedFile: File) => {
      const lower = selectedFile.name.toLowerCase();
      const isSupported =
        lower.endsWith(".docx") ||
        lower.endsWith(".doc") ||
        lower.endsWith(".rtf") ||
        lower.endsWith(".txt") ||
        selectedFile.type.includes("word") ||
        selectedFile.type.includes("officedocument") ||
        selectedFile.type === "text/plain";

      if (!isSupported) {
        showToast(
          `Unsupported file: ${selectedFile.name}. Please select a Word (.docx, .doc, .rtf) or text document.`,
          "error"
        );
        return;
      }

      setFile(selectedFile);
      setIsParsing(true);
      try {
        await yieldFrame();
        const extracted = await parseWordDocumentForJpg(selectedFile);
        setBlocks(extracted);
        showToast(`Loaded "${selectedFile.name}" (${extracted.length} blocks parsed).`, "success");
      } catch (err: any) {
        logger.error("Word parse error:", err);
        showToast(`Could not parse Word file: ${err?.message || err}`, "error");
        setFile(null);
        setBlocks([]);
      } finally {
        setIsParsing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadWordFile(initialFile);
    }
  }, [initialFile, handleLoadWordFile]);

  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        handleLoadWordFile(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadWordFile]);

  const stats = useMemo(() => {
    let paragraphs = 0;
    let words = 0;
    let tables = 0;
    let images = 0;

    for (const b of blocks) {
      if (b.type === "paragraph") {
        paragraphs++;
        const w = b.text.trim().split(/\s+/).filter(Boolean).length;
        words += w;
      } else if (b.type === "table") {
        tables++;
        for (const r of b.rows) {
          for (const c of r) {
            words += c.trim().split(/\s+/).filter(Boolean).length;
          }
        }
      } else if (b.type === "image") {
        images++;
      }
    }

    return { paragraphs, words, tables, images };
  }, [blocks]);

  const handleReset = () => {
    setFile(null);
    setBlocks([]);
    setIsParsing(false);
    setIsProcessing(false);
    setProgressMsg("");
  };

  const handleConvertToJpg = async () => {
    if (!file || blocks.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgressMsg("INITIALIZING_JPG_PAGE_RASTERIZER...");

    try {
      await yieldFrame();

      const { width: pageW, height: pageH } = PAGE_DIMENSIONS[pageSize];
      const margin = MARGIN_VALUES[marginPreset];
      const scaleMult = FONT_SCALE_MULTIPLIER[fontScale];
      const renderScale = DPI_SCALE_MAP[dpiPreset].scale;
      const maxContentWidth = pageW - margin * 2;
      const qualityFraction = Math.max(0.5, Math.min(1.0, jpgQuality / 100));

      // Create pages as offscreen high-DPI canvases
      const pageCanvases: HTMLCanvasElement[] = [];

      const createBlankPageCanvas = (): {
        canvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
      } => {
        const c = document.createElement("canvas");
        c.width = Math.round(pageW * renderScale);
        c.height = Math.round(pageH * renderScale);
        const ctx = c.getContext("2d")!;
        ctx.scale(renderScale, renderScale);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, pageW, pageH);
        pageCanvases.push(c);
        return { canvas: c, ctx };
      };

      let { ctx: currentCtx } = createBlankPageCanvas();
      let cursorY = margin;

      const ensurePageSpace = (neededHeight: number) => {
        if (cursorY + neededHeight > pageH - margin) {
          const next = createBlankPageCanvas();
          currentCtx = next.ctx;
          cursorY = margin;
        }
      };

      for (let idx = 0; idx < blocks.length; idx++) {
        if (idx % 12 === 0) {
          setProgressMsg(`RASTERIZING_BLOCK_${idx + 1}_OF_${blocks.length}...`);
          await yieldFrame();
        }

        const block = blocks[idx];

        if (block.type === "pageBreak") {
          const next = createBlankPageCanvas();
          currentCtx = next.ctx;
          cursorY = margin;
          continue;
        }

        if (block.type === "image") {
          try {
            const loadedImg = await new Promise<HTMLImageElement>((res, rej) => {
              const img = new Image();
              img.onload = () => res(img);
              img.onerror = () => rej(new Error("Image decode error"));
              img.src = block.dataUrl;
            });

            const maxImgW = maxContentWidth;
            const maxImgH = (pageH - margin * 2) * 0.65;
            const ratio = Math.min(
              1,
              maxImgW / Math.max(1, block.width),
              maxImgH / Math.max(1, block.height)
            );
            const drawW = block.width * ratio;
            const drawH = block.height * ratio;

            ensurePageSpace(drawH + 14);
            const drawX = margin + (maxContentWidth - drawW) / 2;
            currentCtx.drawImage(loadedImg, drawX, cursorY, drawW, drawH);
            cursorY += drawH + 14;
          } catch (imgErr) {
            logger.warn("Skipped image during JPG page rendering:", imgErr);
          }
          continue;
        }

        if (block.type === "table") {
          const rowHeight = Math.round(22 * scaleMult);
          const fontSize = Math.round(9.5 * scaleMult * 10) / 10;
          const numCols = Math.max(1, ...block.rows.map((r) => r.length));
          const colWidth = maxContentWidth / numCols;

          for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
            ensurePageSpace(rowHeight + 4);
            const row = block.rows[rIdx];

            for (let cIdx = 0; cIdx < numCols; cIdx++) {
              const cellX = margin + cIdx * colWidth;

              if (rIdx === 0) {
                currentCtx.fillStyle = "#F3F4F6";
                currentCtx.fillRect(cellX, cursorY, colWidth, rowHeight);
              }

              currentCtx.strokeStyle = "#BDBDBD";
              currentCtx.lineWidth = 0.6;
              currentCtx.strokeRect(cellX, cursorY, colWidth, rowHeight);

              const cellText = (row[cIdx] || "").trim();
              if (cellText) {
                currentCtx.fillStyle = "#111827";
                currentCtx.font = `${
                  rIdx === 0 ? "bold " : ""
                }${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                currentCtx.textBaseline = "middle";
                currentCtx.textAlign = "left";

                const maxCellW = colWidth - 10;
                let displayStr = cellText;
                if (currentCtx.measureText(displayStr).width > maxCellW) {
                  while (
                    displayStr.length > 3 &&
                    currentCtx.measureText(`${displayStr}...`).width > maxCellW
                  ) {
                    displayStr = displayStr.slice(0, -1);
                  }
                  displayStr = `${displayStr}...`;
                }

                currentCtx.fillText(displayStr, cellX + 5, cursorY + rowHeight / 2);
              }
            }
            cursorY += rowHeight;
          }
          cursorY += 10;
          continue;
        }

        if (block.type === "paragraph") {
          const styleSizes: Record<typeof block.style, number> = {
            title: 22 * scaleMult,
            h1: 17 * scaleMult,
            h2: 14 * scaleMult,
            h3: 12.5 * scaleMult,
            body: 11 * scaleMult,
            list: 11 * scaleMult,
          };

          const fontSize = Math.round(styleSizes[block.style] * 10) / 10;
          const lineHeight = fontSize * 1.48;
          const isBold =
            block.bold ||
            block.style === "title" ||
            block.style === "h1" ||
            block.style === "h2" ||
            block.style === "h3";

          const fontSpec = `${block.italic ? "italic " : ""}${
            isBold ? "bold " : ""
          }${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          currentCtx.font = fontSpec;
          currentCtx.fillStyle = "#111827";
          currentCtx.textBaseline = "top";

          const indent = block.style === "list" ? 16 : 0;
          const availWidth = maxContentWidth - indent;
          const prefix = block.style === "list" ? "•  " : "";
          const fullText = `${prefix}${block.text.replace(/\t/g, "    ")}`;

          const words = fullText.split(" ");
          const wrappedLines: string[] = [];
          let currentLine = "";

          for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            const candidateWidth = currentCtx.measureText(candidate).width;
            if (candidateWidth <= availWidth || !currentLine) {
              currentLine = candidate;
            } else {
              wrappedLines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) {
            wrappedLines.push(currentLine);
          }

          if (block.style === "h1" || block.style === "h2" || block.style === "title") {
            cursorY += 6;
          }

          for (const line of wrappedLines) {
            ensurePageSpace(lineHeight + 2);
            // Re-apply font settings in case ensurePageSpace switched to a fresh canvas
            currentCtx.font = fontSpec;
            currentCtx.fillStyle = "#111827";
            currentCtx.textBaseline = "top";

            let drawX = margin + indent;
            if (block.align === "center") {
              const lw = currentCtx.measureText(line).width;
              drawX = margin + Math.max(0, (maxContentWidth - lw) / 2);
            } else if (block.align === "right") {
              const lw = currentCtx.measureText(line).width;
              drawX = margin + Math.max(0, maxContentWidth - lw);
            }

            currentCtx.fillText(line, drawX, cursorY);
            cursorY += lineHeight;
          }

          cursorY += block.style === "list" ? 3 : 6;
        }
      }

      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanName}_monotranscoder`;

      if (pageCanvases.length === 1) {
        setProgressMsg("ENCODING_HIGH_RES_JPEG...");
        const singleCanvas = pageCanvases[0];
        const jpgBlob: Blob = await new Promise((res, rej) =>
          singleCanvas.toBlob(
            (b) => (b ? res(b) : rej(new Error("Canvas JPEG encoding failed"))),
            "image/jpeg",
            qualityFraction
          )
        );
        singleCanvas.width = 0;
        singleCanvas.height = 0;

        await saveFile("word_to_jpg", {
          blob: jpgBlob,
          filename: defaultFilename,
          size: jpgBlob.size,
          format: "image/jpeg",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      } else if (multiPageMode === "LONG_SINGLE_JPG") {
        setProgressMsg(`STITCHING_${pageCanvases.length}_PAGES_INTO_SINGLE_JPG...`);
        const separatorPx = 12;
        const singleW = pageCanvases[0].width;
        const totalH =
          pageCanvases.reduce((acc, c) => acc + c.height, 0) +
          separatorPx * (pageCanvases.length - 1);

        const stitchedCanvas = document.createElement("canvas");
        stitchedCanvas.width = singleW;
        stitchedCanvas.height = totalH;
        const sCtx = stitchedCanvas.getContext("2d")!;
        sCtx.fillStyle = "#E4E4E7";
        sCtx.fillRect(0, 0, singleW, totalH);

        let yOffset = 0;
        for (let i = 0; i < pageCanvases.length; i++) {
          const pc = pageCanvases[i];
          sCtx.drawImage(pc, 0, yOffset);
          yOffset += pc.height + separatorPx;
          pc.width = 0;
          pc.height = 0;
        }

        const jpgBlob: Blob = await new Promise((res, rej) =>
          stitchedCanvas.toBlob(
            (b) => (b ? res(b) : rej(new Error("Stitched JPEG encoding failed"))),
            "image/jpeg",
            qualityFraction
          )
        );
        stitchedCanvas.width = 0;
        stitchedCanvas.height = 0;

        await saveFile("word_to_jpg", {
          blob: jpgBlob,
          filename: defaultFilename,
          size: jpgBlob.size,
          format: "image/jpeg",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      } else {
        setProgressMsg(`PACKAGING_${pageCanvases.length}_JPG_PAGES_INTO_ZIP...`);
        const zip = new JSZip();

        for (let i = 0; i < pageCanvases.length; i++) {
          const pc = pageCanvases[i];
          const pageBlob: Blob = await new Promise((res, rej) =>
            pc.toBlob(
              (b) => (b ? res(b) : rej(new Error("Page JPEG encoding failed"))),
              "image/jpeg",
              qualityFraction
            )
          );
          zip.file(`${cleanName}_page_${i + 1}.jpg`, pageBlob);
          pc.width = 0;
          pc.height = 0;
        }

        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "STORE",
        });

        await saveFile("word_to_jpg", {
          blob: zipBlob,
          filename: defaultFilename,
          size: zipBlob.size,
          format: "application/zip",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      }

      showToast(
        `Converted Word document (${pageCanvases.length} page${
          pageCanvases.length > 1 ? "s" : ""
        }) to JPG successfully.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      logger.error("Word to JPG conversion error:", err);
      showToast(`Failed to convert Word to JPG: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="word-to-jpg-view"
      aria-labelledby="word-to-jpg-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="word-to-jpg-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            WORD TO JPG CONVERTER // WORD_TO_JPG.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Render Word (.docx, .rtf, .txt) pages into crisp, high-resolution JPG images directly in browser RAM.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="word-to-jpg-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload Word file to convert to JPG. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadWordFile(e.dataTransfer.files[0]);
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
              if (f) handleLoadWordFile(f);
            }}
            accept=".docx,.doc,.rtf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
            className="hidden"
            aria-label="Select Word Document"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="word_to_jpg" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE WORD DOCUMENT (.DOCX)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Renders OpenXML paragraphs, headings, tables, and embedded graphics into high-resolution JPG images locally.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select Word File"
          >
            SELECT_WORD_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="word_to_jpg"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${DPI_SCALE_MAP[dpiPreset].label} JPG`}
          statusMessage={
            progressMsg ||
            (isParsing ? "PARSING_OPENXML_ARCHIVE..." : "RASTERIZING_WORD_TO_JPG...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Document Preview & Extracted Structure */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <AlignLeft className="w-4 h-4 text-amber-400" /> DOCUMENT_CONTENT_PREVIEW
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                {stats.words} WORDS · {stats.paragraphs} PARAGRAPHS
              </span>
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-5 max-h-[440px] overflow-y-auto space-y-3 font-sans text-zinc-200">
              {blocks.slice(0, 80).map((b, i) => {
                if (b.type === "paragraph") {
                  if (b.style === "title" || b.style === "h1") {
                    return (
                      <h3 key={i} className="text-base font-bold text-white pt-1">
                        {b.text}
                      </h3>
                    );
                  }
                  if (b.style === "h2" || b.style === "h3") {
                    return (
                      <h4 key={i} className="text-sm font-bold text-zinc-100 pt-1">
                        {b.text}
                      </h4>
                    );
                  }
                  return (
                    <p
                      key={i}
                      className={`text-xs leading-relaxed text-zinc-300 ${
                        b.style === "list" ? "pl-4" : ""
                      } ${b.bold ? "font-bold text-white" : ""}`}
                    >
                      {b.style === "list" ? `• ${b.text}` : b.text}
                    </p>
                  );
                }
                if (b.type === "table") {
                  return (
                    <div
                      key={i}
                      className="border border-zinc-800 rounded overflow-x-auto my-2"
                    >
                      <table className="w-full text-[11px] font-mono text-left border-collapse">
                        <tbody>
                          {b.rows.slice(0, 6).map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? "bg-zinc-900 font-bold text-white"
                                  : "border-t border-zinc-800 text-zinc-300"
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-1.5 border-r border-zinc-800 last:border-r-0">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                if (b.type === "image") {
                  return (
                    <div
                      key={i}
                      className="my-2 flex justify-center bg-zinc-900/50 p-2 rounded border border-zinc-800"
                    >
                      <img
                        src={b.dataUrl}
                        alt="Embedded document graphic"
                        referrerPolicy="no-referrer"
                        className="max-h-40 object-contain rounded"
                      />
                    </div>
                  );
                }
                return null;
              })}
              {blocks.length > 80 && (
                <p className="text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-900">
                  + {blocks.length - 80} additional content blocks ready for JPG rasterization...
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PARAGRAPHS</span>
                <strong className="text-sky-400">{stats.paragraphs}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">WORD_COUNT</span>
                <strong className="text-emerald-400">{stats.words}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TABLES</span>
                <strong className="text-amber-400 flex items-center gap-1">
                  <TableIcon className="w-3 h-3 text-amber-400" /> {stats.tables}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">IMAGES</span>
                <strong className="text-violet-400 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-violet-400" /> {stats.images}
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Rasterization Parameters & Action */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-amber-400" /> JPG_RASTER_CONFIG.CFG
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

              {/* Resolution / DPI Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  OUTPUT RESOLUTION (DPI):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["150_DPI", "220_DPI", "300_DPI"] as DpiPreset[]).map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setDpiPreset(dpi)}
                      className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        dpiPreset === dpi
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {DPI_SCALE_MAP[dpi].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* JPG Quality Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <label className="font-bold uppercase text-zinc-300">JPG QUALITY:</label>
                  <span className="text-amber-400 font-bold tabular-nums">{jpgQuality}%</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={100}
                  step={1}
                  value={jpgQuality}
                  onChange={(e) => setJpgQuality(Number(e.target.value))}
                  className="w-full accent-white cursor-pointer"
                  aria-label="JPG Compression Quality"
                />
              </div>

              {/* Multi-Page Output Format */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  MULTI-PAGE OUTPUT MODE:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMultiPageMode("ZIP_PAGES")}
                    className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      multiPageMode === "ZIP_PAGES"
                        ? "bg-white text-black border-white"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>SEPARATE PAGES (ZIP)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiPageMode("LONG_SINGLE_JPG")}
                    className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      multiPageMode === "LONG_SINGLE_JPG"
                        ? "bg-white text-black border-white"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>STITCH INTO 1 JPG</span>
                  </button>
                </div>
              </div>

              {/* Page Size & Margins */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                    PAGE SIZE:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["A4", "LETTER"] as PageSizePreset[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPageSize(sz)}
                        className={`py-1.5 px-2 rounded font-mono text-[11px] font-bold uppercase border cursor-pointer ${
                          pageSize === sz
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                    TEXT SCALE:
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["SMALL", "MEDIUM", "LARGE"] as FontScalePreset[]).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setFontScale(sc)}
                        className={`py-1.5 px-1.5 rounded font-mono text-[10px] font-bold uppercase border cursor-pointer ${
                          fontScale === sc
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {sc === "SMALL" ? "SM" : sc === "MEDIUM" ? "MD" : "LG"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Margins */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                  PAGE MARGINS:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["COMPACT", "NORMAL", "WIDE"] as MarginPreset[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMarginPreset(m)}
                      className={`py-1.5 px-2 rounded font-mono text-[11px] font-bold uppercase border cursor-pointer ${
                        marginPreset === m
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConvertToJpg}
              disabled={isProcessing || blocks.length === 0}
              aria-label="Convert Word to JPG Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-40"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT WORD TO JPG NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
