/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Table as TableIcon,
  FolderOpen,
  Zap,
  Grid,
  Layers,
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
import ModuleIconBadge from "./ModuleIconBadge";

interface PdfToExcelViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

interface RawTextItem {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  str: string;
}

interface ExtractedPageGrid {
  pageNumber: number;
  rows: string[][];
  colCount: number;
}

type ExportFormat = "XLSX" | "CSV";
type SheetStructure = "MULTI_SHEET" | "MERGED_SINGLE_SHEET";
type RowSensitivity = "TIGHT" | "BALANCED" | "RELAXED";

const ROW_TOLERANCE_MAP: Record<RowSensitivity, number> = {
  TIGHT: 3,
  BALANCED: 6,
  RELAXED: 11,
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

function indexToColLetters(colIndex: number): string {
  let n = colIndex + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}

/**
 * Clusters positioned text items on a PDF page into aligned spreadsheet rows and columns
 */
function buildPageGridFromItems(
  items: RawTextItem[],
  yTolerance: number
): { rows: string[][]; colCount: number } {
  if (items.length === 0) return { rows: [], colCount: 0 };

  // Sort top-to-bottom (higher Y first in PDF coordinates)
  const sortedByY = [...items].sort((a, b) => b.y - a.y);

  const rowClusters: { yCenter: number; cells: RawTextItem[] }[] = [];
  for (const item of sortedByY) {
    const existing = rowClusters.find(
      (rc) => Math.abs(rc.yCenter - item.y) <= yTolerance
    );
    if (existing) {
      existing.cells.push(item);
      existing.yCenter =
        existing.cells.reduce((acc, c) => acc + c.y, 0) / existing.cells.length;
    } else {
      rowClusters.push({ yCenter: item.y, cells: [item] });
    }
  }

  // Sort each row's items left-to-right and merge items that are adjacent fragments of the same cell
  const mergedRowItems: { x: number; str: string }[][] = rowClusters.map((rc) => {
    const sortedX = [...rc.cells].sort((a, b) => a.x - b.x);
    const merged: { x: number; rightEdge: number; str: string }[] = [];

    for (const cell of sortedX) {
      const prev = merged[merged.length - 1];
      if (prev && cell.x - prev.rightEdge < 10) {
        prev.str = `${prev.str} ${cell.str}`.trim();
        prev.rightEdge = Math.max(prev.rightEdge, cell.x + cell.width);
      } else {
        merged.push({
          x: cell.x,
          rightEdge: cell.x + Math.max(12, cell.width),
          str: cell.str,
        });
      }
    }
    return merged.map((m) => ({ x: m.x, str: m.str }));
  });

  // Discover column X-anchors across rows with multiple cells
  const xAnchors: number[] = [];
  const colTolerance = 28;
  for (const row of mergedRowItems) {
    for (const cell of row) {
      const matchIdx = xAnchors.findIndex((ax) => Math.abs(ax - cell.x) <= colTolerance);
      if (matchIdx === -1) {
        xAnchors.push(cell.x);
        xAnchors.sort((a, b) => a - b);
      }
    }
  }

  const colCount = Math.min(24, Math.max(1, xAnchors.length));
  const finalAnchors = xAnchors.slice(0, colCount);

  const rows: string[][] = mergedRowItems.map((row) => {
    if (row.length === 1 && colCount > 1) {
      const singleRow = new Array(colCount).fill("");
      singleRow[0] = row[0].str;
      return singleRow;
    }
    const aligned = new Array(colCount).fill("");
    for (const cell of row) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < finalAnchors.length; c++) {
        const dist = Math.abs(finalAnchors[c] - cell.x);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      aligned[bestCol] = aligned[bestCol]
        ? `${aligned[bestCol]} ${cell.str}`.trim()
        : cell.str;
    }
    return aligned;
  });

  // Prune completely empty columns
  const nonEmptyColIndices: number[] = [];
  for (let c = 0; c < colCount; c++) {
    if (rows.some((r) => (r[c] || "").trim() !== "")) {
      nonEmptyColIndices.push(c);
    }
  }

  if (nonEmptyColIndices.length === 0) {
    return { rows: [], colCount: 0 };
  }

  const compactRows = rows.map((r) => nonEmptyColIndices.map((c) => r[c] || ""));
  return { rows: compactRows, colCount: nonEmptyColIndices.length };
}

/**
 * Generates a valid OpenXML .xlsx spreadsheet archive in browser memory
 */
async function buildOpenXmlXlsxBlob(
  sheets: { name: string; rows: string[][] }[]
): Promise<Blob> {
  const zip = new JSZip();

  const sheetOverrides = sheets
    .map(
      (_, idx) =>
        `  <Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("\n");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheetOverrides}
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  const wbRels = sheets
    .map(
      (_, idx) =>
        `  <Relationship Id="rIdSheet${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join("\n");

  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${wbRels}
</Relationships>`
  );

  const sheetNodes = sheets
    .map(
      (s, idx) =>
        `    <sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${idx + 1}" r:id="rIdSheet${idx + 1}"/>`
    )
    .join("\n");

  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetNodes}
  </sheets>
</workbook>`
  );

  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`
  );

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const sheet = sheets[sIdx];
    const rowXmlParts: string[] = [];

    for (let rIdx = 0; rIdx < sheet.rows.length; rIdx++) {
      const row = sheet.rows[rIdx];
      const rowNum = rIdx + 1;
      const cellXmlParts: string[] = [];

      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        const rawVal = (row[cIdx] || "").trim();
        if (!rawVal) continue;

        const cellRef = `${indexToColLetters(cIdx)}${rowNum}`;
        const styleAttr = rIdx === 0 ? ' s="1"' : "";

        // Detect clean numeric values so Excel treats them as numbers
        const cleanedNum = rawVal.replace(/,/g, "");
        if (/^-?\d+(\.\d+)?$/.test(cleanedNum) && cleanedNum.length < 15) {
          cellXmlParts.push(
            `<c r="${cellRef}"${styleAttr}><v>${cleanedNum}</v></c>`
          );
        } else {
          cellXmlParts.push(
            `<c r="${cellRef}" t="inlineStr"${styleAttr}><is><t>${escapeXml(rawVal)}</t></is></c>`
          );
        }
      }

      rowXmlParts.push(`<row r="${rowNum}">${cellXmlParts.join("")}</row>`);
    }

    zip.file(
      `xl/worksheets/sheet${sIdx + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowXmlParts.join("\n    ")}
  </sheetData>
</worksheet>`
    );
  }

  return await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export default function PdfToExcelView({
  onSuccess,
  askPassword,
  initialFile,
}: PdfToExcelViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [rawItems, setRawItems] = useState<RawTextItem[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [activePageIdx, setActivePageIdx] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Configuration
  const [exportFormat, setExportFormat] = useState<ExportFormat>("XLSX");
  const [sheetStructure, setSheetStructure] = useState<SheetStructure>("MULTI_SHEET");
  const [rowSensitivity, setRowSensitivity] = useState<RowSensitivity>("BALANCED");

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
      setProgressMsg("SCANNING_PDF_COORDINATE_MATRIX...");

      let pdfDoc: any = null;
      try {
        await yieldFrame();
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        const openWithPwd = async (pwd?: string): Promise<any> => {
          const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) params.password = pwd;
          try {
            return await pdfjsLib.getDocument(params).promise;
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
        const totalPages = pdfDoc.numPages;
        const collected: RawTextItem[] = [];

        for (let p = 1; p <= totalPages; p++) {
          setProgressMsg(`EXTRACTING_TABLE_COORDINATES_PAGE_${p}_OF_${totalPages}...`);
          const page = await pdfDoc.getPage(p);
          const textContent = await page.getTextContent();
          for (const item of textContent.items as any[]) {
            const str = String(item.str || "").trim();
            if (!str) continue;
            const x = Number(item.transform?.[4] || 0);
            const y = Number(item.transform?.[5] || 0);
            const width = Number(item.width || str.length * 5);
            collected.push({ pageNumber: p, x, y, width, str });
          }
          if (typeof page.cleanup === "function") page.cleanup();
        }

        if (collected.length === 0) {
          throw new Error(
            "No extractable text items found in this PDF. (Scanned image-only PDFs contain no text layer)."
          );
        }

        setRawItems(collected);
        setNumPages(totalPages);
        setActivePageIdx(0);
      } catch (err: any) {
        logger.error("PDF to Excel parse error:", err);
        showToast(`Could not extract tables from PDF: ${err?.message || err}`, "error");
        setFile(null);
        setRawItems([]);
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

  const pageGrids: ExtractedPageGrid[] = useMemo(() => {
    const tol = ROW_TOLERANCE_MAP[rowSensitivity];
    const grids: ExtractedPageGrid[] = [];
    for (let p = 1; p <= numPages; p++) {
      const pItems = rawItems.filter((i) => i.pageNumber === p);
      if (pItems.length === 0) continue;
      const { rows, colCount } = buildPageGridFromItems(pItems, tol);
      if (rows.length > 0) {
        grids.push({ pageNumber: p, rows, colCount });
      }
    }
    return grids;
  }, [rawItems, numPages, rowSensitivity]);

  const stats = useMemo(() => {
    let totalRows = 0;
    let maxCols = 0;
    for (const g of pageGrids) {
      totalRows += g.rows.length;
      maxCols = Math.max(maxCols, g.colCount);
    }
    return {
      sheets: pageGrids.length,
      totalRows,
      maxCols,
      itemsCount: rawItems.length,
    };
  }, [pageGrids, rawItems.length]);

  const activeGrid = pageGrids[activePageIdx] || pageGrids[0] || null;

  const handleReset = () => {
    setFile(null);
    setRawItems([]);
    setNumPages(0);
    setActivePageIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExportSpreadsheet = async () => {
    if (!file || pageGrids.length === 0) return;

    setIsProcessing(true);
    setProgressMsg(
      exportFormat === "XLSX"
        ? "COMPILING_OPENXML_XLSX_WORKBOOK..."
        : "SERIALIZING_CSV_DATA_STREAM..."
    );

    try {
      await yieldFrame();
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      if (exportFormat === "CSV") {
        const allRows: string[][] = [];
        for (const g of pageGrids) {
          if (pageGrids.length > 1 && sheetStructure === "MULTI_SHEET") {
            allRows.push([`--- PAGE ${g.pageNumber} ---`]);
          }
          allRows.push(...g.rows);
        }
        const csvText = allRows
          .map((row) =>
            row
              .map((cell) => {
                const escaped = String(cell || "").replace(/"/g, '""');
                return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
              })
              .join(",")
          )
          .join("\r\n");

        const csvBlob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
        await saveFile("pdf_to_excel", {
          blob: csvBlob,
          filename: `${cleanName}_monotranscoder`,
          size: csvBlob.size,
          format: "csv",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      } else {
        const targetSheets =
          sheetStructure === "MERGED_SINGLE_SHEET"
            ? [
                {
                  name: "Extracted_Data",
                  rows: pageGrids.flatMap((g) => g.rows),
                },
              ]
            : pageGrids.map((g) => ({
                name: `Page_${g.pageNumber}`,
                rows: g.rows,
              }));

        const xlsxBlob = await buildOpenXmlXlsxBlob(targetSheets);
        await saveFile("pdf_to_excel", {
          blob: xlsxBlob,
          filename: `${cleanName}_monotranscoder`,
          size: xlsxBlob.size,
          format: "xlsx",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      }

      showToast(
        `PDF tables extracted to ${exportFormat === "XLSX" ? "Excel (.xlsx)" : "CSV (.csv)"} successfully.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      logger.error("PDF to Excel export error:", err);
      showToast(`Failed to export spreadsheet: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="pdf-to-excel-view"
      aria-labelledby="pdf-to-excel-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="pdf-to-excel-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            PDF TO EXCEL // PDF_TO_EXCEL.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Extract tabular rows and columns from PDF documents into editable Excel (.xlsx) or CSV spreadsheets in RAM.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="pdf-to-excel-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to extract to Excel"
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
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="pdf_to_excel" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF DOCUMENT (.PDF)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Scans X/Y coordinate matrices to reconstruct rows, columns, and numeric cells into .xlsx or .csv.
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
          variant="pdf_to_excel"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={exportFormat === "XLSX" ? "EXCEL (.XLSX)" : "CSV (.CSV)"}
          statusMessage={
            progressMsg ||
            (isParsing ? "CLUSTERING_TABLE_COORDINATES..." : "PACKING_EXCEL_WORKBOOK...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Extracted Table Grid Preview */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                  <Grid className="w-4 h-4 text-teal-400" /> EXTRACTED_SPREADSHEET_PREVIEW
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                  {stats.totalRows} ROWS · {stats.maxCols} COLS
                </span>
              </div>

              {pageGrids.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {pageGrids.map((g, idx) => (
                    <button
                      key={g.pageNumber}
                      type="button"
                      onClick={() => setActivePageIdx(idx)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase border cursor-pointer transition-all ${
                        activePageIdx === idx
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                      }`}
                    >
                      PAGE {g.pageNumber} ({g.rows.length})
                    </button>
                  ))}
                </div>
              )}

              {activeGrid && (
                <div className="bg-black border border-zinc-800 rounded-lg overflow-auto max-h-[400px]">
                  <table className="w-full text-[11px] font-mono text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900 text-white border-b border-zinc-700">
                      <tr>
                        <th className="p-2 border-r border-zinc-800 text-zinc-500 w-10 text-center">
                          ROW
                        </th>
                        {Array.from({ length: activeGrid.colCount }).map((_, cIdx) => (
                          <th
                            key={cIdx}
                            className="p-2 border-r border-zinc-800 font-bold text-teal-400"
                          >
                            {indexToColLetters(cIdx)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeGrid.rows.slice(0, 60).map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={`border-b border-zinc-900 ${
                            rIdx === 0
                              ? "bg-zinc-900/70 font-bold text-white"
                              : "text-zinc-300 hover:bg-zinc-900/40"
                          }`}
                        >
                          <td className="p-1.5 border-r border-zinc-800 text-zinc-500 text-center">
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="p-1.5 border-r border-zinc-900 truncate max-w-[180px]"
                              title={cell}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PDF_PAGES</span>
                <strong className="text-teal-400 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {stats.sheets}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">EXTRACTED_ROWS</span>
                <strong className="text-emerald-400">{stats.totalRows}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">DETECTED_COLS</span>
                <strong className="text-amber-400">{stats.maxCols}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TEXT_NODES</span>
                <strong className="text-sky-400">{stats.itemsCount}</strong>
              </div>
            </div>
          </div>

          {/* Right: Excel Extraction Controls */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-teal-400" /> EXCEL_EXTRACTOR.CFG
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

              {/* Output Format */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  OUTPUT SPREADSHEET FORMAT:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "XLSX", label: "EXCEL WORKBOOK (.XLSX)" },
                      { key: "CSV", label: "UNIVERSAL CSV (.CSV)" },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.key}
                      type="button"
                      onClick={() => setExportFormat(fmt.key)}
                      className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        exportFormat === fmt.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Worksheet Organization */}
              {pageGrids.length > 1 && exportFormat === "XLSX" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    WORKSHEET TAB LAYOUT:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: "MULTI_SHEET", label: "ONE SHEET PER PAGE" },
                        { key: "MERGED_SINGLE_SHEET", label: "MERGE INTO 1 SHEET" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setSheetStructure(st.key)}
                        className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          sheetStructure === st.key
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row Alignment Sensitivity */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  ROW ALIGNMENT TOLERANCE:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["TIGHT", "BALANCED", "RELAXED"] as RowSensitivity[]).map((sens) => (
                    <button
                      key={sens}
                      type="button"
                      onClick={() => setRowSensitivity(sens)}
                      className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        rowSensitivity === sens
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {sens}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportSpreadsheet}
              disabled={isProcessing}
              aria-label="Convert PDF to Excel Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>
                {exportFormat === "XLSX"
                  ? "CONVERT PDF TO EXCEL (.XLSX) NOW"
                  : "CONVERT PDF TO CSV NOW"}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
