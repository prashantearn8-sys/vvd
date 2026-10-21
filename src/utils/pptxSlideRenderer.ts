/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from "jszip";
import { yieldFrame } from "./imageProcessor";

export type ScreenshotDpiPreset = "STANDARD_HD" | "FULL_HD" | "ULTRA_HD";
export type ScreenshotFormat = "JPEG_95" | "PNG_LOSSLESS";

export interface RenderedSlideScreenshot {
  slideNumber: number;
  title: string;
  notes: string;
  widthPx: number;
  heightPx: number;
  aspectRatio: number;
  screenshotDataUrl: string;
  screenshotBytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  shapeCount: number;
  imageCount: number;
}

export interface ParsedPresentationDeck {
  slideWidthEmu: number;
  slideHeightEmu: number;
  aspectRatio: number;
  slides: RenderedSlideScreenshot[];
  reRenderAtOptions: (
    dpi: ScreenshotDpiPreset,
    format: ScreenshotFormat,
    onProgress?: (slideIndex: number, total: number) => void
  ) => Promise<RenderedSlideScreenshot[]>;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GradientStop {
  pos: number; // 0..1
  color: RgbaColor;
}

interface FillStyleSpec {
  type: "none" | "solid" | "gradient" | "image";
  color?: RgbaColor;
  gradientStops?: GradientStop[];
  gradientAngleDeg?: number;
  imageElement?: HTMLImageElement;
  crop?: { l: number; t: number; r: number; b: number };
}

interface StrokeStyleSpec {
  widthEmu: number;
  color: RgbaColor;
  dash?: string;
}

interface BoxEmu {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rotDeg?: number;
  flipH?: boolean;
  flipV?: boolean;
}

interface PlaceholderDef {
  type: string;
  idx: string;
  box?: BoxEmu;
}

interface ThemeContext {
  schemeColors: Record<string, RgbaColor>;
  clrMap: Record<string, string>;
  majorFont: string;
  minorFont: string;
}

const DEFAULT_SCHEME_COLORS: Record<string, RgbaColor> = {
  dk1: { r: 0, g: 0, b: 0, a: 1 },
  lt1: { r: 255, g: 255, b: 255, a: 1 },
  dk2: { r: 31, g: 73, b: 125, a: 1 },
  lt2: { r: 238, g: 236, b: 225, a: 1 },
  accent1: { r: 79, g: 129, b: 189, a: 1 },
  accent2: { r: 192, g: 80, b: 77, a: 1 },
  accent3: { r: 155, g: 187, b: 89, a: 1 },
  accent4: { r: 128, g: 100, b: 162, a: 1 },
  accent5: { r: 75, g: 172, b: 198, a: 1 },
  accent6: { r: 247, g: 150, b: 70, a: 1 },
  hlink: { r: 0, g: 0, b: 255, a: 1 },
  folHlink: { r: 128, g: 0, b: 128, a: 1 },
};

const DEFAULT_CLR_MAP: Record<string, string> = {
  bg1: "lt1",
  tx1: "dk1",
  bg2: "lt2",
  tx2: "dk2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
  hlink: "hlink",
  folHlink: "folHlink",
};

const PRESET_COLOR_HEX: Record<string, string> = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  cyan: "00FFFF",
  magenta: "FF00FF",
  gray: "808080",
  grey: "808080",
  ltGray: "D3D3D3",
  dkGray: "A9A9A9",
  orange: "FFA500",
  purple: "800080",
  navy: "000080",
  teal: "008080",
  maroon: "800000",
  olive: "808000",
  silver: "C0C0C0",
};

function getTargetWidthPx(dpi: ScreenshotDpiPreset): number {
  switch (dpi) {
    case "ULTRA_HD":
      return 2400;
    case "FULL_HD":
      return 1920;
    case "STANDARD_HD":
    default:
      return 1280;
  }
}

function hexToRgba(hex: string, alpha = 1): RgbaColor {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return { r, g, b, a: alpha };
  }
  return { r: 0, g: 0, b: 0, a: alpha };
}

function rgbaToCss(c: RgbaColor): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  const a = Math.max(0, Math.min(1, c.a));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Applies OpenXML color modifiers (lumMod, lumOff, tint, shade, alpha, satMod)
 */
function applyColorTransforms(base: RgbaColor, colorNode: Element): RgbaColor {
  let { r, g, b, a } = base;
  let [h, s, l] = rgbToHsl(r, g, b);

  const children = Array.from(colorNode.children);
  for (const ch of children) {
    const ln = ch.localName;
    const rawVal = parseInt(ch.getAttribute("val") || "0", 10);
    const ratio = rawVal / 100000;

    if (ln === "lumMod") {
      l *= ratio;
    } else if (ln === "lumOff") {
      l += ratio;
    } else if (ln === "satMod") {
      s *= ratio;
    } else if (ln === "satOff") {
      s += ratio;
    } else if (ln === "tint") {
      // Blend toward white in RGB space
      ;[r, g, b] = hslToRgb(
        h,
        Math.max(0, Math.min(1, s)),
        Math.max(0, Math.min(1, l))
      );
      r = r + (255 - r) * (1 - ratio);
      g = g + (255 - g) * (1 - ratio);
      b = b + (255 - b) * (1 - ratio);
      ;[h, s, l] = rgbToHsl(r, g, b);
    } else if (ln === "shade") {
      // Multiply toward black in RGB space
      ;[r, g, b] = hslToRgb(
        h,
        Math.max(0, Math.min(1, s)),
        Math.max(0, Math.min(1, l))
      );
      r = r * ratio;
      g = g * ratio;
      b = b * ratio;
      ;[h, s, l] = rgbToHsl(r, g, b);
    } else if (ln === "alpha") {
      a = Math.max(0, Math.min(1, ratio));
    }
  }

  l = Math.max(0, Math.min(1, l));
  s = Math.max(0, Math.min(1, s));
  const [finalR, finalG, finalB] = hslToRgb(h, s, l);
  return { r: finalR, g: finalG, b: finalB, a };
}

function findDirectChild(parent: Element | null | undefined, localName: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (ch.localName === localName) return ch;
  }
  return null;
}

function findDirectChildren(parent: Element | null | undefined, localName: string): Element[] {
  if (!parent) return [];
  const res: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (ch.localName === localName) res.push(ch);
  }
  return res;
}

function findFirstDescendant(parent: Element | Document | null | undefined, localName: string): Element | null {
  if (!parent) return null;
  const all = parent.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i];
  }
  return null;
}

/**
 * Resolves a color element (<a:srgbClr>, <a:schemeClr>, <a:sysClr>, <a:prstClr>)
 */
function resolveColorFromContainer(
  container: Element | null | undefined,
  theme: ThemeContext,
  phColorOverride?: RgbaColor
): RgbaColor | null {
  if (!container) return null;

  const srgb = findDirectChild(container, "srgbClr");
  if (srgb) {
    const val = srgb.getAttribute("val") || "000000";
    return applyColorTransforms(hexToRgba(val), srgb);
  }

  const sys = findDirectChild(container, "sysClr");
  if (sys) {
    const last = sys.getAttribute("lastClr") || "000000";
    return applyColorTransforms(hexToRgba(last), sys);
  }

  const prst = findDirectChild(container, "prstClr");
  if (prst) {
    const val = prst.getAttribute("val") || "black";
    const hex = PRESET_COLOR_HEX[val] || "000000";
    return applyColorTransforms(hexToRgba(hex), prst);
  }

  const scheme = findDirectChild(container, "schemeClr");
  if (scheme) {
    const rawKey = scheme.getAttribute("val") || "tx1";
    if (rawKey === "phClr" && phColorOverride) {
      return applyColorTransforms(phColorOverride, scheme);
    }
    const mappedKey = theme.clrMap[rawKey] || rawKey;
    const baseColor =
      theme.schemeColors[mappedKey] ||
      theme.schemeColors[rawKey] ||
      DEFAULT_SCHEME_COLORS[mappedKey] ||
      { r: 0, g: 0, b: 0, a: 1 };
    return applyColorTransforms(baseColor, scheme);
  }

  return null;
}

async function parseRelsMap(zip: JSZip, xmlPath: string, parser: DOMParser): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const parts = xmlPath.split("/");
  const fileName = parts.pop() || "";
  const dir = parts.join("/");
  const relsPath = `${dir}/_rels/${fileName}.rels`;

  const relsFile = zip.file(relsPath);
  if (!relsFile) return map;

  try {
    const relsXml = await relsFile.async("string");
    const doc = parser.parseFromString(relsXml, "application/xml");
    const nodes = doc.getElementsByTagName("Relationship");
    for (let i = 0; i < nodes.length; i++) {
      const id = nodes[i].getAttribute("Id");
      const target = nodes[i].getAttribute("Target");
      if (id && target) {
        // Resolve relative path against dir
        if (target.startsWith("/")) {
          map.set(id, target.replace(/^\/+/, ""));
        } else {
          const stack = dir ? dir.split("/") : [];
          for (const seg of target.split("/")) {
            if (seg === "..") stack.pop();
            else if (seg !== "." && seg !== "") stack.push(seg);
          }
          map.set(id, stack.join("/"));
        }
      }
    }
  } catch {
    // Ignore malformed rels
  }
  return map;
}

async function loadImageFromZip(
  zip: JSZip,
  mediaPath: string,
  cache: Map<string, HTMLImageElement>
): Promise<HTMLImageElement | undefined> {
  if (cache.has(mediaPath)) return cache.get(mediaPath);
  const f = zip.file(mediaPath);
  if (!f) return undefined;

  const lower = mediaPath.toLowerCase();
  let mime = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
  else if (lower.endsWith(".gif")) mime = "image/gif";
  else if (lower.endsWith(".webp")) mime = "image/webp";
  else if (lower.endsWith(".svg")) mime = "image/svg+xml";
  else if (!lower.endsWith(".png")) return undefined;

  try {
    const bytes = await f.async("uint8array");
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = url;
    });
    URL.revokeObjectURL(url);
    cache.set(mediaPath, img);
    return img;
  } catch {
    return undefined;
  }
}

async function parseThemeXml(zip: JSZip, parser: DOMParser): Promise<ThemeContext> {
  const schemeColors: Record<string, RgbaColor> = { ...DEFAULT_SCHEME_COLORS };
  const clrMap: Record<string, string> = { ...DEFAULT_CLR_MAP };
  let majorFont = "Calibri, 'Helvetica Neue', Arial, sans-serif";
  let minorFont = "Calibri, 'Helvetica Neue', Arial, sans-serif";

  const themeFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/theme\/theme\d+\.xml$/i.test(k))
    .sort();

  if (themeFiles.length > 0) {
    const tf = zip.file(themeFiles[0]);
    if (tf) {
      try {
        const xml = await tf.async("string");
        const doc = parser.parseFromString(xml, "application/xml");
        const clrScheme = findFirstDescendant(doc, "clrScheme");
        if (clrScheme) {
          for (let i = 0; i < clrScheme.children.length; i++) {
            const ch = clrScheme.children[i];
            const key = ch.localName;
            const c = resolveColorFromContainer(ch, {
              schemeColors,
              clrMap,
              majorFont,
              minorFont,
            });
            if (c) schemeColors[key] = c;
          }
        }
        const fontScheme = findFirstDescendant(doc, "fontScheme");
        if (fontScheme) {
          const maj = findDirectChild(fontScheme, "majorFont");
          const min = findDirectChild(fontScheme, "minorFont");
          const majLatin = findDirectChild(maj, "latin")?.getAttribute("typeface");
          const minLatin = findDirectChild(min, "latin")?.getAttribute("typeface");
          if (majLatin) majorFont = `"${majLatin}", Calibri, Arial, sans-serif`;
          if (minLatin) minorFont = `"${minLatin}", Calibri, Arial, sans-serif`;
        }
      } catch {
        // Use defaults
      }
    }
  }

  return { schemeColors, clrMap, majorFont, minorFont };
}

function parseXfrm(xfrmNode: Element | null | undefined): BoxEmu | undefined {
  if (!xfrmNode) return undefined;
  const off = findDirectChild(xfrmNode, "off");
  const ext = findDirectChild(xfrmNode, "ext");
  if (!off || !ext) return undefined;

  const x = parseInt(off.getAttribute("x") || "0", 10);
  const y = parseInt(off.getAttribute("y") || "0", 10);
  const cx = parseInt(ext.getAttribute("cx") || "0", 10);
  const cy = parseInt(ext.getAttribute("cy") || "0", 10);
  if (cx <= 0 && cy <= 0) return undefined;

  const rotRaw = parseInt(xfrmNode.getAttribute("rot") || "0", 10);
  const rotDeg = rotRaw ? rotRaw / 60000 : 0;
  const flipH = xfrmNode.getAttribute("flipH") === "1";
  const flipV = xfrmNode.getAttribute("flipV") === "1";

  return { x, y, cx, cy, rotDeg, flipH, flipV };
}

function extractPlaceholderDef(spNode: Element): PlaceholderDef | null {
  const nvSpPr =
    findDirectChild(spNode, "nvSpPr") ||
    findDirectChild(spNode, "nvPicPr") ||
    findDirectChild(spNode, "nvGraphicFramePr");
  const nvPr = findDirectChild(nvSpPr, "nvPr");
  const ph = findDirectChild(nvPr, "ph");
  if (!ph) return null;

  const type = ph.getAttribute("type") || "body";
  const idx = ph.getAttribute("idx") || "";
  const spPr = findDirectChild(spNode, "spPr") || findDirectChild(spNode, "xfrm");
  const xfrm = spPr?.localName === "xfrm" ? spPr : findDirectChild(spPr, "xfrm");
  const box = parseXfrm(xfrm);

  return { type, idx, box };
}

function buildPlaceholderMap(spTree: Element | null): Map<string, BoxEmu> {
  const map = new Map<string, BoxEmu>();
  if (!spTree) return map;

  for (let i = 0; i < spTree.children.length; i++) {
    const ch = spTree.children[i];
    if (ch.localName === "sp" || ch.localName === "pic" || ch.localName === "graphicFrame") {
      const ph = extractPlaceholderDef(ch);
      if (ph && ph.box) {
        if (ph.idx) map.set(`idx:${ph.idx}`, ph.box);
        if (ph.type) map.set(`type:${ph.type}`, ph.box);
      }
    }
  }
  return map;
}

/**
 * Fallback standard PowerPoint placeholder coordinates when neither slide nor layout specifies xfrm
 */
function getFallbackPlaceholderBox(
  phType: string,
  phIdx: string,
  slideW: number,
  slideH: number
): BoxEmu {
  switch (phType) {
    case "ctrTitle":
      return {
        x: Math.round(slideW * 0.1),
        y: Math.round(slideH * 0.28),
        cx: Math.round(slideW * 0.8),
        cy: Math.round(slideH * 0.25),
      };
    case "subTitle":
      return {
        x: Math.round(slideW * 0.15),
        y: Math.round(slideH * 0.56),
        cx: Math.round(slideW * 0.7),
        cy: Math.round(slideH * 0.2),
      };
    case "title":
      return {
        x: Math.round(slideW * 0.06),
        y: Math.round(slideH * 0.06),
        cx: Math.round(slideW * 0.88),
        cy: Math.round(slideH * 0.16),
      };
    case "dt":
      return {
        x: Math.round(slideW * 0.06),
        y: Math.round(slideH * 0.91),
        cx: Math.round(slideW * 0.22),
        cy: Math.round(slideH * 0.05),
      };
    case "ftr":
      return {
        x: Math.round(slideW * 0.32),
        y: Math.round(slideH * 0.91),
        cx: Math.round(slideW * 0.36),
        cy: Math.round(slideH * 0.05),
      };
    case "sldNum":
      return {
        x: Math.round(slideW * 0.72),
        y: Math.round(slideH * 0.91),
        cx: Math.round(slideW * 0.22),
        cy: Math.round(slideH * 0.05),
      };
    case "body":
    case "obj":
    default:
      if (phIdx === "1" || !phIdx) {
        return {
          x: Math.round(slideW * 0.06),
          y: Math.round(slideH * 0.24),
          cx: Math.round(slideW * 0.88),
          cy: Math.round(slideH * 0.65),
        };
      }
      return {
        x: Math.round(slideW * 0.52),
        y: Math.round(slideH * 0.24),
        cx: Math.round(slideW * 0.42),
        cy: Math.round(slideH * 0.65),
      };
  }
}

async function resolveFillFromNode(
  container: Element | null | undefined,
  theme: ThemeContext,
  rels: Map<string, string>,
  zip: JSZip,
  imgCache: Map<string, HTMLImageElement>,
  styleNode?: Element | null
): Promise<FillStyleSpec> {
  if (!container) return { type: "none" };

  if (findDirectChild(container, "noFill")) {
    return { type: "none" };
  }

  const solid = findDirectChild(container, "solidFill");
  if (solid) {
    const color = resolveColorFromContainer(solid, theme);
    if (color) return { type: "solid", color };
  }

  const grad = findDirectChild(container, "gradFill");
  if (grad) {
    const gsLst = findDirectChild(grad, "gsLst");
    const stops: GradientStop[] = [];
    if (gsLst) {
      const gsNodes = findDirectChildren(gsLst, "gs");
      for (const gs of gsNodes) {
        const posRaw = parseInt(gs.getAttribute("pos") || "0", 10);
        const c = resolveColorFromContainer(gs, theme);
        if (c) {
          stops.push({ pos: Math.max(0, Math.min(1, posRaw / 100000)), color: c });
        }
      }
    }
    if (stops.length >= 2) {
      stops.sort((a, b) => a.pos - b.pos);
      const lin = findDirectChild(grad, "lin");
      const angRaw = parseInt(lin?.getAttribute("ang") || "5400000", 10);
      return {
        type: "gradient",
        gradientStops: stops,
        gradientAngleDeg: angRaw / 60000,
      };
    } else if (stops.length === 1) {
      return { type: "solid", color: stops[0].color };
    }
  }

  const blipFill = findDirectChild(container, "blipFill");
  if (blipFill) {
    const blip = findDirectChild(blipFill, "blip");
    const embedId =
      blip?.getAttribute("r:embed") ||
      blip?.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "embed"
      );
    if (embedId) {
      const mediaPath = rels.get(embedId);
      if (mediaPath) {
        const img = await loadImageFromZip(zip, mediaPath, imgCache);
        if (img) {
          const srcRect = findDirectChild(blipFill, "srcRect");
          const crop = srcRect
            ? {
                l: parseInt(srcRect.getAttribute("l") || "0", 10) / 100000,
                t: parseInt(srcRect.getAttribute("t") || "0", 10) / 100000,
                r: parseInt(srcRect.getAttribute("r") || "0", 10) / 100000,
                b: parseInt(srcRect.getAttribute("b") || "0", 10) / 100000,
              }
            : undefined;
          return { type: "image", imageElement: img, crop };
        }
      }
    }
  }

  // Check shape <p:style><a:fillRef idx="...">
  if (styleNode) {
    const fillRef = findDirectChild(styleNode, "fillRef");
    if (fillRef) {
      const idx = parseInt(fillRef.getAttribute("idx") || "0", 10);
      if (idx > 0) {
        const refColor = resolveColorFromContainer(fillRef, theme);
        if (refColor) return { type: "solid", color: refColor };
      }
    }
  }

  return { type: "none" };
}

function resolveStrokeFromNode(
  spPr: Element | null | undefined,
  theme: ThemeContext,
  styleNode?: Element | null
): StrokeStyleSpec | null {
  if (!spPr) return null;
  const ln = findDirectChild(spPr, "ln");
  if (ln) {
    if (findDirectChild(ln, "noFill")) return null;
    const wEmu = parseInt(ln.getAttribute("w") || "12700", 10);
    const solid = findDirectChild(ln, "solidFill");
    const color = resolveColorFromContainer(solid, theme);
    const dash = findDirectChild(ln, "prstDash")?.getAttribute("val") || undefined;
    if (color) {
      return { widthEmu: wEmu, color, dash };
    }
  }

  if (styleNode) {
    const lnRef = findDirectChild(styleNode, "lnRef");
    if (lnRef) {
      const idx = parseInt(lnRef.getAttribute("idx") || "0", 10);
      if (idx > 0) {
        const refColor = resolveColorFromContainer(lnRef, theme);
        if (refColor) {
          return { widthEmu: 12700 * idx, color: refColor };
        }
      }
    }
  }
  return null;
}

function applyFillToContext(
  ctx: CanvasRenderingContext2D,
  fill: FillStyleSpec,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (fill.type === "solid" && fill.color) {
    ctx.fillStyle = rgbaToCss(fill.color);
    ctx.fill();
  } else if (fill.type === "gradient" && fill.gradientStops && fill.gradientStops.length >= 2) {
    const rad = ((fill.gradientAngleDeg || 90) * Math.PI) / 180;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.sqrt(w * w + h * h) / 2;
    const x0 = cx - Math.cos(rad) * r;
    const y0 = cy - Math.sin(rad) * r;
    const x1 = cx + Math.cos(rad) * r;
    const y1 = cy + Math.sin(rad) * r;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const st of fill.gradientStops) {
      grad.addColorStop(st.pos, rgbaToCss(st.color));
    }
    ctx.fillStyle = grad;
    ctx.fill();
  } else if (fill.type === "image" && fill.imageElement) {
    const img = fill.imageElement;
    const crop = fill.crop || { l: 0, t: 0, r: 0, b: 0 };
    const sx = Math.max(0, crop.l * img.naturalWidth);
    const sy = Math.max(0, crop.t * img.naturalHeight);
    const sw = Math.max(1, (1 - crop.l - crop.r) * img.naturalWidth);
    const sh = Math.max(1, (1 - crop.t - crop.b) * img.naturalHeight);
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }
}

function buildPresetShapePath(
  ctx: CanvasRenderingContext2D,
  prst: string,
  x: number,
  y: number,
  w: number,
  h: number,
  adjVal?: number
) {
  ctx.beginPath();
  switch (prst) {
    case "ellipse": {
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      break;
    }
    case "roundRect":
    case "snipRoundRect":
    case "round1Rect":
    case "round2SameRect": {
      const ratio = adjVal !== undefined ? Math.min(0.5, Math.max(0, adjVal / 100000)) : 0.16;
      const r = Math.min(w, h) * ratio;
      ctx.roundRect(x, y, w, h, r);
      break;
    }
    case "triangle":
    case "isoscelesTriangle": {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case "diamond": {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    }
    case "parallelogram": {
      const off = w * 0.2;
      ctx.moveTo(x + off, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - off, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case "rightArrow": {
      const headW = Math.min(w * 0.4, h * 0.8);
      const shaftH = h * 0.5;
      const shaftY = y + (h - shaftH) / 2;
      ctx.moveTo(x, shaftY);
      ctx.lineTo(x + w - headW, shaftY);
      ctx.lineTo(x + w - headW, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - headW, y + h);
      ctx.lineTo(x + w - headW, shaftY + shaftH);
      ctx.lineTo(x, shaftY + shaftH);
      ctx.closePath();
      break;
    }
    case "chevron":
    case "homePlate": {
      const tip = Math.min(w * 0.25, h * 0.5);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - tip, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - tip, y + h);
      ctx.lineTo(x, y + h);
      if (prst === "chevron") {
        ctx.lineTo(x + tip, y + h / 2);
      }
      ctx.closePath();
      break;
    }
    case "line":
    case "straightConnector1": {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      break;
    }
    default: {
      ctx.rect(x, y, w, h);
      break;
    }
  }
}

interface RichTextRun {
  text: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: RgbaColor;
  fontFamily: string;
}

interface RichParagraph {
  align: "left" | "center" | "right";
  level: number;
  bulletChar: string | null;
  spaceBeforePt: number;
  spaceAfterPt: number;
  lineSpacingMult: number;
  runs: RichTextRun[];
}

function parseRichParagraphs(
  txBody: Element,
  theme: ThemeContext,
  phType: string,
  defaultDarkBg: boolean,
  styleFontColor?: RgbaColor | null
): {
  paragraphs: RichParagraph[];
  vAlign: "t" | "ctr" | "b";
  padLeftEmu: number;
  padRightEmu: number;
  padTopEmu: number;
  padBottomEmu: number;
  fontScale: number;
} {
  const bodyPr = findDirectChild(txBody, "bodyPr");
  const vAlignAttr = bodyPr?.getAttribute("anchor") || (phType === "ctrTitle" ? "ctr" : "t");
  const vAlign: "t" | "ctr" | "b" =
    vAlignAttr === "ctr" ? "ctr" : vAlignAttr === "b" ? "b" : "t";

  const padLeftEmu = parseInt(bodyPr?.getAttribute("lIns") ?? "91440", 10);
  const padTopEmu = parseInt(bodyPr?.getAttribute("tIns") ?? "45720", 10);
  const padRightEmu = parseInt(bodyPr?.getAttribute("rIns") ?? "91440", 10);
  const padBottomEmu = parseInt(bodyPr?.getAttribute("bIns") ?? "45720", 10);

  const normAutofit = findDirectChild(bodyPr, "normAutofit");
  const fontScaleRaw = parseInt(normAutofit?.getAttribute("fontScale") || "100000", 10);
  const fontScale = Math.max(0.45, Math.min(1.0, fontScaleRaw / 100000));

  // Determine default font size & alignment based on placeholder type
  let defaultSizePt = 18;
  let defaultAlign: "left" | "center" | "right" = "left";
  let defaultBold = false;
  let defaultBullet: string | null = null;

  if (phType === "ctrTitle") {
    defaultSizePt = 40;
    defaultAlign = "center";
    defaultBold = true;
  } else if (phType === "title") {
    defaultSizePt = 32;
    defaultAlign = "left";
    defaultBold = true;
  } else if (phType === "subTitle") {
    defaultSizePt = 22;
    defaultAlign = "center";
  } else if (phType === "body" || phType === "obj") {
    defaultSizePt = 20;
    defaultBullet = "•";
  } else if (phType === "dt" || phType === "ftr" || phType === "sldNum") {
    defaultSizePt = 11;
  }

  const defaultTextColor: RgbaColor =
    styleFontColor ||
    (defaultDarkBg
      ? theme.schemeColors[theme.clrMap.lt1 || "lt1"] || { r: 255, g: 255, b: 255, a: 1 }
      : theme.schemeColors[theme.clrMap.tx1 || "dk1"] || { r: 17, g: 24, b: 39, a: 1 });

  const lstStyle = findDirectChild(txBody, "lstStyle");

  const pNodes = findDirectChildren(txBody, "p");
  const paragraphs: RichParagraph[] = [];

  for (let pIdx = 0; pIdx < pNodes.length; pIdx++) {
    const pNode = pNodes[pIdx];
    const pPr = findDirectChild(pNode, "pPr");
    const lvl = parseInt(pPr?.getAttribute("lvl") || "0", 10);

    // Check lstStyle level defaults if present
    const lvlPPr = findDirectChild(lstStyle, `lvl${lvl + 1}pPr`);
    const defRPr = findDirectChild(pPr, "defRPr") || findDirectChild(lvlPPr, "defRPr");

    const algnAttr =
      pPr?.getAttribute("algn") || lvlPPr?.getAttribute("algn") || "";
    let align: "left" | "center" | "right" = defaultAlign;
    if (algnAttr === "ctr") align = "center";
    else if (algnAttr === "r") align = "right";
    else if (algnAttr === "l" || algnAttr === "just") align = "left";

    // Bullet resolution
    let bulletChar: string | null = defaultBullet;
    if (findDirectChild(pPr, "buNone") || findDirectChild(lvlPPr, "buNone")) {
      bulletChar = null;
    } else {
      const buCharNode =
        findDirectChild(pPr, "buChar") || findDirectChild(lvlPPr, "buChar");
      if (buCharNode) {
        bulletChar = buCharNode.getAttribute("char") || "•";
      } else if (
        findDirectChild(pPr, "buAutoNum") ||
        findDirectChild(lvlPPr, "buAutoNum")
      ) {
        bulletChar = `${pIdx + 1}.`;
      }
    }

    // Spacing
    let spaceBeforePt = 0;
    const spcBef = findDirectChild(pPr, "spcBef");
    const spcBefPts = findDirectChild(spcBef, "spcPts");
    if (spcBefPts) {
      spaceBeforePt = parseInt(spcBefPts.getAttribute("val") || "0", 10) / 100;
    }

    let spaceAfterPt = phType === "body" || phType === "obj" ? 6 : 2;
    const spcAft = findDirectChild(pPr, "spcAft");
    const spcAftPts = findDirectChild(spcAft, "spcPts");
    if (spcAftPts) {
      spaceAfterPt = parseInt(spcAftPts.getAttribute("val") || "0", 10) / 100;
    }

    let lineSpacingMult = 1.2;
    const lnSpc = findDirectChild(pPr, "lnSpc");
    const spcPct = findDirectChild(lnSpc, "spcPct");
    if (spcPct) {
      lineSpacingMult = Math.max(
        0.9,
        Math.min(2.5, parseInt(spcPct.getAttribute("val") || "120000", 10) / 100000)
      );
    }

    const defSizeAttr = defRPr?.getAttribute("sz");
    const paraDefaultSizePt = defSizeAttr
      ? parseInt(defSizeAttr, 10) / 100
      : Math.max(12, defaultSizePt - lvl * 2);

    const defColor =
      resolveColorFromContainer(findDirectChild(defRPr, "solidFill"), theme) ||
      defaultTextColor;

    const runs: RichTextRun[] = [];

    for (let cIdx = 0; cIdx < pNode.children.length; cIdx++) {
      const ch = pNode.children[cIdx];
      if (ch.localName === "r" || ch.localName === "fld") {
        const rPr = findDirectChild(ch, "rPr");
        const tNode = findDirectChild(ch, "t");
        let rawText = tNode?.textContent || "";
        if (!rawText) continue;

        if (rPr?.getAttribute("cap") === "all") {
          rawText = rawText.toUpperCase();
        }

        const szAttr = rPr?.getAttribute("sz");
        const fontSizePt =
          (szAttr ? parseInt(szAttr, 10) / 100 : paraDefaultSizePt) * fontScale;

        const bold =
          rPr?.getAttribute("b") === "1" ||
          defRPr?.getAttribute("b") === "1" ||
          defaultBold;
        const italic =
          rPr?.getAttribute("i") === "1" || defRPr?.getAttribute("i") === "1";
        const underline =
          Boolean(rPr?.getAttribute("u")) && rPr?.getAttribute("u") !== "none";

        const runColor =
          resolveColorFromContainer(findDirectChild(rPr, "solidFill"), theme) ||
          defColor;

        const latinFont = findDirectChild(rPr, "latin")?.getAttribute("typeface");
        const fontFamily = latinFont
          ? `"${latinFont}", ${theme.minorFont}`
          : phType === "title" || phType === "ctrTitle"
          ? theme.majorFont
          : theme.minorFont;

        runs.push({
          text: rawText,
          fontSizePt,
          bold,
          italic,
          underline,
          color: runColor,
          fontFamily,
        });
      } else if (ch.localName === "br") {
        runs.push({
          text: "\n",
          fontSizePt: paraDefaultSizePt * fontScale,
          bold: defaultBold,
          italic: false,
          underline: false,
          color: defColor,
          fontFamily: theme.minorFont,
        });
      }
    }

    paragraphs.push({
      align,
      level: lvl,
      bulletChar: runs.length > 0 ? bulletChar : null,
      spaceBeforePt,
      spaceAfterPt,
      lineSpacingMult,
      runs,
    });
  }

  return {
    paragraphs,
    vAlign,
    padLeftEmu,
    padRightEmu,
    padTopEmu,
    padBottomEmu,
    fontScale,
  };
}

interface WrappedSpan {
  text: string;
  widthPx: number;
  fontSizePx: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: RgbaColor;
  fontFamily: string;
}

interface WrappedVisualLine {
  align: "left" | "center" | "right";
  indentPx: number;
  heightPx: number;
  spaceBeforePx: number;
  spaceAfterPx: number;
  spans: WrappedSpan[];
}

function drawRichTextBody(
  ctx: CanvasRenderingContext2D,
  txBody: Element,
  boxPx: { x: number; y: number; w: number; h: number },
  emuToPxScale: number,
  ptToPxScale: number,
  theme: ThemeContext,
  phType: string,
  isDarkBackground: boolean,
  styleFontColor?: RgbaColor | null
) {
  const parsed = parseRichParagraphs(
    txBody,
    theme,
    phType,
    isDarkBackground,
    styleFontColor
  );
  if (parsed.paragraphs.length === 0) return;

  const padL = parsed.padLeftEmu * emuToPxScale;
  const padR = parsed.padRightEmu * emuToPxScale;
  const padT = parsed.padTopEmu * emuToPxScale;
  const padB = parsed.padBottomEmu * emuToPxScale;

  const contentX = boxPx.x + padL;
  const contentY = boxPx.y + padT;
  const contentW = Math.max(20, boxPx.w - padL - padR);
  const contentH = Math.max(12, boxPx.h - padT - padB);

  // Measure and wrap lines; if total height exceeds contentH, auto-shrink up to 2 passes
  let shrinkFactor = 1.0;

  const buildLines = (scaleFactor: number): WrappedVisualLine[] => {
    const visualLines: WrappedVisualLine[] = [];

    for (const para of parsed.paragraphs) {
      const indentPx = para.level * 18 * ptToPxScale;
      const maxLineW = Math.max(16, contentW - indentPx);

      if (para.runs.length === 0) {
        const emptyH = 14 * ptToPxScale * scaleFactor;
        visualLines.push({
          align: para.align,
          indentPx,
          heightPx: emptyH,
          spaceBeforePx: para.spaceBeforePt * ptToPxScale * scaleFactor,
          spaceAfterPx: para.spaceAfterPt * ptToPxScale * scaleFactor,
          spans: [],
        });
        continue;
      }

      let currentSpans: WrappedSpan[] = [];
      let currentLineW = 0;
      let currentMaxFontPx = 12 * ptToPxScale * scaleFactor;
      let isFirstLineOfPara = true;

      const flushLine = (isLastOfPara: boolean) => {
        visualLines.push({
          align: para.align,
          indentPx,
          heightPx: currentMaxFontPx * para.lineSpacingMult,
          spaceBeforePx: isFirstLineOfPara
            ? para.spaceBeforePt * ptToPxScale * scaleFactor
            : 0,
          spaceAfterPx: isLastOfPara
            ? para.spaceAfterPt * ptToPxScale * scaleFactor
            : 0,
          spans: currentSpans,
        });
        isFirstLineOfPara = false;
        currentSpans = [];
        currentLineW = 0;
      };

      // Prepend bullet if present
      if (para.bulletChar) {
        const firstRun = para.runs[0];
        const fontPx = Math.max(7, firstRun.fontSizePt * ptToPxScale * scaleFactor);
        ctx.font = `${firstRun.italic ? "italic " : ""}${
          firstRun.bold ? "700 " : "400 "
        }${fontPx.toFixed(1)}px ${firstRun.fontFamily}`;
        const bulletText = `${para.bulletChar}  `;
        const bw = ctx.measureText(bulletText).width;
        currentSpans.push({
          text: bulletText,
          widthPx: bw,
          fontSizePx: fontPx,
          bold: firstRun.bold,
          italic: false,
          underline: false,
          color: firstRun.color,
          fontFamily: firstRun.fontFamily,
        });
        currentLineW += bw;
        currentMaxFontPx = Math.max(currentMaxFontPx, fontPx);
      }

      for (const run of para.runs) {
        if (run.text === "\n") {
          flushLine(false);
          continue;
        }

        const fontPx = Math.max(7, run.fontSizePt * ptToPxScale * scaleFactor);
        currentMaxFontPx = Math.max(currentMaxFontPx, fontPx);
        ctx.font = `${run.italic ? "italic " : ""}${
          run.bold ? "700 " : "400 "
        }${fontPx.toFixed(1)}px ${run.fontFamily}`;

        // Tokenize preserving spaces
        const tokens = run.text.split(/(\s+)/).filter((t) => t.length > 0);
        for (const token of tokens) {
          const tokenW = ctx.measureText(token).width;
          if (
            currentLineW + tokenW > maxLineW &&
            currentSpans.length > 0 &&
            !/^\s+$/.test(token)
          ) {
            flushLine(false);
            currentMaxFontPx = fontPx;
          }
          if (currentSpans.length === 0 && /^\s+$/.test(token)) {
            continue;
          }
          currentSpans.push({
            text: token,
            widthPx: tokenW,
            fontSizePx: fontPx,
            bold: run.bold,
            italic: run.italic,
            underline: run.underline,
            color: run.color,
            fontFamily: run.fontFamily,
          });
          currentLineW += tokenW;
        }
      }

      if (currentSpans.length > 0) {
        flushLine(true);
      }
    }

    return visualLines;
  };

  let lines = buildLines(shrinkFactor);
  const calcTotalHeight = (ls: WrappedVisualLine[]) =>
    ls.reduce((acc, l) => acc + l.spaceBeforePx + l.heightPx + l.spaceAfterPx, 0);

  let totalH = calcTotalHeight(lines);
  if (totalH > contentH && contentH > 20) {
    shrinkFactor = Math.max(0.58, Math.sqrt(contentH / totalH));
    lines = buildLines(shrinkFactor);
    totalH = calcTotalHeight(lines);
  }

  let startY = contentY;
  if (parsed.vAlign === "ctr") {
    startY = contentY + Math.max(0, (contentH - totalH) / 2);
  } else if (parsed.vAlign === "b") {
    startY = contentY + Math.max(0, contentH - totalH);
  }

  ctx.save();
  // Soft clip to shape bounds with slight vertical allowance
  ctx.beginPath();
  ctx.rect(
    boxPx.x - 4,
    boxPx.y - 4,
    boxPx.w + 8,
    boxPx.h + 12
  );
  ctx.clip();

  let cursorY = startY;
  for (const line of lines) {
    cursorY += line.spaceBeforePx;
    const lineW = line.spans.reduce((s, sp) => s + sp.widthPx, 0);
    const availW = Math.max(10, contentW - line.indentPx);

    let cursorX = contentX + line.indentPx;
    if (line.align === "center") {
      cursorX = contentX + line.indentPx + (availW - lineW) / 2;
    } else if (line.align === "right") {
      cursorX = contentX + line.indentPx + (availW - lineW);
    }

    const baselineY = cursorY + line.heightPx * 0.78;
    for (const sp of line.spans) {
      ctx.font = `${sp.italic ? "italic " : ""}${
        sp.bold ? "700 " : "400 "
      }${sp.fontSizePx.toFixed(1)}px ${sp.fontFamily}`;
      ctx.fillStyle = rgbaToCss(sp.color);
      ctx.fillText(sp.text, cursorX, baselineY);

      if (sp.underline) {
        ctx.strokeStyle = rgbaToCss(sp.color);
        ctx.lineWidth = Math.max(1, sp.fontSizePx * 0.06);
        ctx.beginPath();
        ctx.moveTo(cursorX, baselineY + sp.fontSizePx * 0.1);
        ctx.lineTo(cursorX + sp.widthPx, baselineY + sp.fontSizePx * 0.1);
        ctx.stroke();
      }

      cursorX += sp.widthPx;
    }

    cursorY += line.heightPx + line.spaceAfterPx;
  }

  ctx.restore();
}

/**
 * Estimates whether a color is dark (luminance < 0.45) so default text contrast is accurate
 */
function isColorDark(c?: RgbaColor): boolean {
  if (!c) return false;
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum < 0.45;
}

/**
 * Parses and renders a single .pptx slide (including master + layout cascade) to a high-DPI HTML5 Canvas
 */
export async function parseAndRenderPptxDeck(
  file: File,
  initialDpi: ScreenshotDpiPreset = "FULL_HD",
  initialFormat: ScreenshotFormat = "JPEG_95",
  onProgress?: (slideIndex: number, total: number) => void
): Promise<ParsedPresentationDeck> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();
  const imgCache = new Map<string, HTMLImageElement>();

  // 1. Parse presentation.xml for native slide dimensions (p:sldSz)
  let slideWidthEmu = 12192000; // Default 16:9 widescreen (13.333" x 7.5")
  let slideHeightEmu = 6858000;

  const presFile = zip.file("ppt/presentation.xml");
  if (presFile) {
    try {
      const presXml = await presFile.async("string");
      const presDoc = parser.parseFromString(presXml, "application/xml");
      const sldSz = findFirstDescendant(presDoc, "sldSz");
      if (sldSz) {
        const cx = parseInt(sldSz.getAttribute("cx") || "0", 10);
        const cy = parseInt(sldSz.getAttribute("cy") || "0", 10);
        if (cx > 0 && cy > 0) {
          slideWidthEmu = cx;
          slideHeightEmu = cy;
        }
      }
    } catch {
      // Keep default 16:9
    }
  }

  // 2. Parse Theme (colors + fonts)
  const theme = await parseThemeXml(zip, parser);

  // 3. Discover all slides sorted numerically
  const slidePaths = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
      return numA - numB;
    });

  if (slidePaths.length === 0) {
    throw new Error("Invalid PowerPoint (.pptx) archive: no slides found in ppt/slides/.");
  }

  const renderDeckWithConfig = async (
    dpi: ScreenshotDpiPreset,
    format: ScreenshotFormat,
    progressCb?: (slideIndex: number, total: number) => void
  ): Promise<RenderedSlideScreenshot[]> => {
    const targetWidthPx = getTargetWidthPx(dpi);
    const targetHeightPx = Math.max(
      200,
      Math.round(targetWidthPx * (slideHeightEmu / slideWidthEmu))
    );
    const emuToPxScale = targetWidthPx / slideWidthEmu;
    const ptToPxScale = targetHeightPx / (slideHeightEmu / 12700);

    const renderedSlides: RenderedSlideScreenshot[] = [];

    for (let idx = 0; idx < slidePaths.length; idx++) {
      const slidePath = slidePaths[idx];
      const slideNum = idx + 1;
      progressCb?.(slideNum, slidePaths.length);
      await yieldFrame();

      const slideFile = zip.file(slidePath);
      if (!slideFile) continue;

      const slideXml = await slideFile.async("string");
      const slideDoc = parser.parseFromString(slideXml, "application/xml");
      const slideRels = await parseRelsMap(zip, slidePath, parser);

      // Find linked slideLayout & slideMaster
      let layoutPath = "";
      for (const [, target] of slideRels.entries()) {
        if (target.includes("slideLayouts/slideLayout")) {
          layoutPath = target;
          break;
        }
      }

      let layoutDoc: Document | null = null;
      let layoutRels = new Map<string, string>();
      let masterPath = "";

      if (layoutPath && zip.file(layoutPath)) {
        const layoutXml = await zip.file(layoutPath)!.async("string");
        layoutDoc = parser.parseFromString(layoutXml, "application/xml");
        layoutRels = await parseRelsMap(zip, layoutPath, parser);
        for (const [, target] of layoutRels.entries()) {
          if (target.includes("slideMasters/slideMaster")) {
            masterPath = target;
            break;
          }
        }
      }

      let masterDoc: Document | null = null;
      let masterRels = new Map<string, string>();
      if (masterPath && zip.file(masterPath)) {
        const masterXml = await zip.file(masterPath)!.async("string");
        masterDoc = parser.parseFromString(masterXml, "application/xml");
        masterRels = await parseRelsMap(zip, masterPath, parser);
      }

      // Build placeholder coordinate lookup from master -> layout
      const masterSpTree = findFirstDescendant(masterDoc, "spTree");
      const layoutSpTree = findFirstDescendant(layoutDoc, "spTree");
      const slideSpTree = findFirstDescendant(slideDoc, "spTree");

      const masterPhMap = buildPlaceholderMap(masterSpTree);
      const layoutPhMap = buildPlaceholderMap(layoutSpTree);

      // Check clrMap on master
      const masterClrMapNode = findFirstDescendant(masterDoc, "clrMap");
      const activeTheme: ThemeContext = {
        ...theme,
        clrMap: { ...theme.clrMap },
      };
      if (masterClrMapNode) {
        for (const key of Object.keys(DEFAULT_CLR_MAP)) {
          const v = masterClrMapNode.getAttribute(key);
          if (v) activeTheme.clrMap[key] = v;
        }
      }

      // Create offscreen canvas for this slide screenshot
      const canvas = document.createElement("canvas");
      canvas.width = targetWidthPx;
      canvas.height = targetHeightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");

      // Default white slide canvas
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

      // Resolve background cascade: slide -> layout -> master
      let bgDark = false;
      const resolveBg = async (
        doc: Document | null,
        rels: Map<string, string>
      ): Promise<FillStyleSpec | null> => {
        if (!doc) return null;
        const bgNode = findFirstDescendant(doc, "bg");
        if (!bgNode) return null;
        const bgPr = findDirectChild(bgNode, "bgPr");
        if (bgPr) {
          const fill = await resolveFillFromNode(bgPr, activeTheme, rels, zip, imgCache);
          if (fill.type !== "none") return fill;
        }
        const bgRef = findDirectChild(bgNode, "bgRef");
        if (bgRef) {
          const c = resolveColorFromContainer(bgRef, activeTheme);
          if (c) return { type: "solid", color: c };
        }
        return null;
      };

      const bgSpec =
        (await resolveBg(slideDoc, slideRels)) ||
        (await resolveBg(layoutDoc, layoutRels)) ||
        (await resolveBg(masterDoc, masterRels));

      if (bgSpec && bgSpec.type !== "none") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, targetWidthPx, targetHeightPx);
        applyFillToContext(ctx, bgSpec, 0, 0, targetWidthPx, targetHeightPx);
        ctx.restore();
        if (bgSpec.type === "solid") {
          bgDark = isColorDark(bgSpec.color);
        } else if (bgSpec.type === "gradient" && bgSpec.gradientStops?.[0]) {
          bgDark = isColorDark(bgSpec.gradientStops[0].color);
        }
      }

      let slideTitle = "";
      let shapeCounter = 0;
      let imageCounter = 0;

      // Helper to render a shape tree (master decorative shapes, layout decorative shapes, or slide shapes)
      const renderShapeTree = async (
        treeNode: Element | null,
        rels: Map<string, string>,
        isMasterOrLayout: boolean,
        groupTransform?: {
          parentX: number;
          parentY: number;
          scaleX: number;
          scaleY: number;
          chOffX: number;
          chOffY: number;
        }
      ) => {
        if (!treeNode) return;

        const mapBoxToCanvas = (box: BoxEmu) => {
          let emuX = box.x;
          let emuY = box.y;
          let emuW = box.cx;
          let emuH = box.cy;
          if (groupTransform) {
            emuX =
              groupTransform.parentX +
              (box.x - groupTransform.chOffX) * groupTransform.scaleX;
            emuY =
              groupTransform.parentY +
              (box.y - groupTransform.chOffY) * groupTransform.scaleY;
            emuW = box.cx * groupTransform.scaleX;
            emuH = box.cy * groupTransform.scaleY;
          }
          return {
            x: emuX * emuToPxScale,
            y: emuY * emuToPxScale,
            w: emuW * emuToPxScale,
            h: emuH * emuToPxScale,
            rotDeg: box.rotDeg || 0,
          };
        };

        for (let i = 0; i < treeNode.children.length; i++) {
          const node = treeNode.children[i];
          const ln = node.localName;

          if (ln === "grpSp") {
            const grpSpPr = findDirectChild(node, "grpSpPr");
            const xfrm = findDirectChild(grpSpPr, "xfrm");
            const off = findDirectChild(xfrm, "off");
            const ext = findDirectChild(xfrm, "ext");
            const chOff = findDirectChild(xfrm, "chOff");
            const chExt = findDirectChild(xfrm, "chExt");

            if (off && ext && chOff && chExt) {
              const gx = parseInt(off.getAttribute("x") || "0", 10);
              const gy = parseInt(off.getAttribute("y") || "0", 10);
              const gcx = Math.max(1, parseInt(ext.getAttribute("cx") || "1", 10));
              const gcy = Math.max(1, parseInt(ext.getAttribute("cy") || "1", 10));
              const cox = parseInt(chOff.getAttribute("x") || "0", 10);
              const coy = parseInt(chOff.getAttribute("y") || "0", 10);
              const ccx = Math.max(1, parseInt(chExt.getAttribute("cx") || "1", 10));
              const ccy = Math.max(1, parseInt(chExt.getAttribute("cy") || "1", 10));

              const nextTransform = groupTransform
                ? {
                    parentX:
                      groupTransform.parentX +
                      (gx - groupTransform.chOffX) * groupTransform.scaleX,
                    parentY:
                      groupTransform.parentY +
                      (gy - groupTransform.chOffY) * groupTransform.scaleY,
                    scaleX: groupTransform.scaleX * (gcx / ccx),
                    scaleY: groupTransform.scaleY * (gcy / ccy),
                    chOffX: cox,
                    chOffY: coy,
                  }
                : {
                    parentX: gx,
                    parentY: gy,
                    scaleX: gcx / ccx,
                    scaleY: gcy / ccy,
                    chOffX: cox,
                    chOffY: coy,
                  };

              await renderShapeTree(node, rels, isMasterOrLayout, nextTransform);
            }
            continue;
          }

          const phDef = extractPlaceholderDef(node);
          // Skip placeholder templates on Master/Layout so we don't draw "Click to edit Master title style"
          if (isMasterOrLayout && phDef) {
            continue;
          }

          if (ln === "pic") {
            const spPr = findDirectChild(node, "spPr");
            const xfrm = findDirectChild(spPr, "xfrm");
            const boxEmu =
              parseXfrm(xfrm) ||
              (phDef?.idx ? layoutPhMap.get(`idx:${phDef.idx}`) : undefined) ||
              (phDef?.type ? layoutPhMap.get(`type:${phDef.type}`) : undefined) ||
              (phDef?.idx ? masterPhMap.get(`idx:${phDef.idx}`) : undefined) ||
              (phDef?.type ? masterPhMap.get(`type:${phDef.type}`) : undefined);

            if (!boxEmu) continue;

            const fillSpec = await resolveFillFromNode(
              node,
              activeTheme,
              rels,
              zip,
              imgCache
            );
            if (fillSpec.type === "image" && fillSpec.imageElement) {
              const rect = mapBoxToCanvas(boxEmu);
              const prstGeom = findDirectChild(spPr, "prstGeom");
              const prst = prstGeom?.getAttribute("prst") || "rect";

              ctx.save();
              if (rect.rotDeg) {
                const cx = rect.x + rect.w / 2;
                const cy = rect.y + rect.h / 2;
                ctx.translate(cx, cy);
                ctx.rotate((rect.rotDeg * Math.PI) / 180);
                ctx.translate(-cx, -cy);
              }
              buildPresetShapePath(ctx, prst, rect.x, rect.y, rect.w, rect.h);
              applyFillToContext(ctx, fillSpec, rect.x, rect.y, rect.w, rect.h);

              const stroke = resolveStrokeFromNode(
                spPr,
                activeTheme,
                findDirectChild(node, "style")
              );
              if (stroke && stroke.widthEmu > 0) {
                ctx.strokeStyle = rgbaToCss(stroke.color);
                ctx.lineWidth = Math.max(1, stroke.widthEmu * emuToPxScale);
                ctx.stroke();
              }
              ctx.restore();
              if (!isMasterOrLayout) imageCounter++;
            }
            continue;
          }

          if (ln === "sp" || ln === "cxnSp") {
            const spPr = findDirectChild(node, "spPr");
            const styleNode = findDirectChild(node, "style");
            const xfrm = findDirectChild(spPr, "xfrm");

            const boxEmu =
              parseXfrm(xfrm) ||
              (phDef?.idx ? layoutPhMap.get(`idx:${phDef.idx}`) : undefined) ||
              (phDef?.type ? layoutPhMap.get(`type:${phDef.type}`) : undefined) ||
              (phDef?.idx ? masterPhMap.get(`idx:${phDef.idx}`) : undefined) ||
              (phDef?.type ? masterPhMap.get(`type:${phDef.type}`) : undefined) ||
              (phDef
                ? getFallbackPlaceholderBox(
                    phDef.type,
                    phDef.idx,
                    slideWidthEmu,
                    slideHeightEmu
                  )
                : undefined);

            if (!boxEmu) continue;

            const rect = mapBoxToCanvas(boxEmu);
            const prstGeom = findDirectChild(spPr, "prstGeom");
            const prst =
              prstGeom?.getAttribute("prst") ||
              (ln === "cxnSp" ? "line" : "rect");

            // Check adjustment value if any (e.g. roundRect corner radius)
            const avLst = findDirectChild(prstGeom, "avLst");
            const gd = findDirectChild(avLst, "gd");
            const fmla = gd?.getAttribute("fmla") || "";
            const adjVal = fmla.startsWith("val ")
              ? parseInt(fmla.replace("val ", ""), 10)
              : undefined;

            const fillSpec = await resolveFillFromNode(
              spPr,
              activeTheme,
              rels,
              zip,
              imgCache,
              styleNode
            );
            const strokeSpec = resolveStrokeFromNode(spPr, activeTheme, styleNode);

            ctx.save();
            if (rect.rotDeg) {
              const cx = rect.x + rect.w / 2;
              const cy = rect.y + rect.h / 2;
              ctx.translate(cx, cy);
              ctx.rotate((rect.rotDeg * Math.PI) / 180);
              ctx.translate(-cx, -cy);
            }

            if (fillSpec.type !== "none" || strokeSpec) {
              buildPresetShapePath(ctx, prst, rect.x, rect.y, rect.w, rect.h, adjVal);
              if (fillSpec.type !== "none") {
                applyFillToContext(ctx, fillSpec, rect.x, rect.y, rect.w, rect.h);
              }
              if (strokeSpec) {
                ctx.strokeStyle = rgbaToCss(strokeSpec.color);
                ctx.lineWidth = Math.max(1, strokeSpec.widthEmu * emuToPxScale);
                if (strokeSpec.dash && strokeSpec.dash !== "solid") {
                  ctx.setLineDash([6, 4]);
                }
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }

            // Render text body (<p:txBody>) if present
            const txBody = findDirectChild(node, "txBody");
            if (txBody) {
              const rawText = Array.from(txBody.getElementsByTagName("*"))
                .filter((el) => el.localName === "t")
                .map((el) => el.textContent || "")
                .join(" ")
                .trim();

              if (rawText) {
                if (
                  !isMasterOrLayout &&
                  !slideTitle &&
                  (phDef?.type === "title" ||
                    phDef?.type === "ctrTitle" ||
                    rawText.length < 90)
                ) {
                  slideTitle = rawText;
                }

                const fontRef = findDirectChild(styleNode, "fontRef");
                const styleFontColor = resolveColorFromContainer(fontRef, activeTheme);
                const shapeDarkBg =
                  fillSpec.type === "solid"
                    ? isColorDark(fillSpec.color)
                    : bgDark;

                drawRichTextBody(
                  ctx,
                  txBody,
                  rect,
                  emuToPxScale,
                  ptToPxScale,
                  activeTheme,
                  phDef?.type || "",
                  shapeDarkBg,
                  styleFontColor
                );
              }
            }

            ctx.restore();
            if (!isMasterOrLayout) shapeCounter++;
            continue;
          }

          if (ln === "graphicFrame") {
            // Render OpenXML Table (<a:tbl>) if present
            const xfrm = findDirectChild(node, "xfrm");
            const boxEmu = parseXfrm(xfrm);
            const tbl = findFirstDescendant(node, "tbl");
            if (boxEmu && tbl) {
              const rect = mapBoxToCanvas(boxEmu);
              const tblGrid = findDirectChild(tbl, "tblGrid");
              const gridCols = findDirectChildren(tblGrid, "gridCol");
              const colWidthsEmu = gridCols.map((c) =>
                parseInt(c.getAttribute("w") || "1000000", 10)
              );
              const totalColEmu = Math.max(
                1,
                colWidthsEmu.reduce((a, b) => a + b, 0)
              );

              const trNodes = findDirectChildren(tbl, "tr");
              let curY = rect.y;

              for (let rIdx = 0; rIdx < trNodes.length; rIdx++) {
                const tr = trNodes[rIdx];
                const rowHEmu = parseInt(tr.getAttribute("h") || "457200", 10);
                const rowHPx = Math.max(20, rowHEmu * emuToPxScale);
                const tcNodes = findDirectChildren(tr, "tc");

                let curX = rect.x;
                for (let cIdx = 0; cIdx < tcNodes.length; cIdx++) {
                  const tc = tcNodes[cIdx];
                  const colW =
                    ((colWidthsEmu[cIdx] || totalColEmu / Math.max(1, tcNodes.length)) /
                      totalColEmu) *
                    rect.w;

                  const tcPr = findDirectChild(tc, "tcPr");
                  const cellFill = await resolveFillFromNode(
                    tcPr,
                    activeTheme,
                    rels,
                    zip,
                    imgCache
                  );

                  ctx.save();
                  ctx.beginPath();
                  ctx.rect(curX, curY, colW, rowHPx);
                  if (cellFill.type !== "none") {
                    applyFillToContext(ctx, cellFill, curX, curY, colW, rowHPx);
                  } else {
                    // Default subtle table banding
                    ctx.fillStyle =
                      rIdx === 0
                        ? rgbaToCss(activeTheme.schemeColors.accent1)
                        : rIdx % 2 === 1
                        ? "rgba(241, 245, 249, 0.9)"
                        : "rgba(255, 255, 255, 0.95)";
                    ctx.fill();
                  }
                  ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
                  ctx.lineWidth = Math.max(1, 9525 * emuToPxScale);
                  ctx.stroke();
                  ctx.restore();

                  const txBody = findDirectChild(tc, "txBody");
                  if (txBody) {
                    const isCellDark =
                      cellFill.type === "solid"
                        ? isColorDark(cellFill.color)
                        : rIdx === 0;
                    drawRichTextBody(
                      ctx,
                      txBody,
                      { x: curX, y: curY, w: colW, h: rowHPx },
                      emuToPxScale,
                      ptToPxScale,
                      activeTheme,
                      "tableCell",
                      isCellDark
                    );
                  }

                  curX += colW;
                }
                curY += rowHPx;
              }
              if (!isMasterOrLayout) shapeCounter++;
            }
          }
        }
      };

      // Check whether slide or layout suppresses master shapes
      const sldRoot = slideDoc.documentElement;
      const layoutRoot = layoutDoc?.documentElement;
      const showMasterOnSlide = sldRoot?.getAttribute("showMasterSp") !== "0";
      const showMasterOnLayout = layoutRoot?.getAttribute("showMasterSp") !== "0";

      if (showMasterOnSlide && showMasterOnLayout && masterSpTree) {
        await renderShapeTree(masterSpTree, masterRels, true);
      }
      if (showMasterOnSlide && layoutSpTree) {
        await renderShapeTree(layoutSpTree, layoutRels, true);
      }
      if (slideSpTree) {
        await renderShapeTree(slideSpTree, slideRels, false);
      }

      // Extract optional speaker notes (ppt/notesSlides/notesSlideN.xml)
      let notesText = "";
      const notesFile = zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`);
      if (notesFile) {
        try {
          const notesXml = await notesFile.async("string");
          const notesDoc = parser.parseFromString(notesXml, "application/xml");
          const tNodes = Array.from(notesDoc.getElementsByTagName("*")).filter(
            (el) => el.localName === "t"
          );
          const rawNotes = tNodes
            .map((t) => t.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (rawNotes && rawNotes !== String(slideNum)) {
            notesText = rawNotes;
          }
        } catch {
          // Ignore notes error
        }
      }

      // Capture high-DPI slide screenshot from the rendered canvas
      const mimeType: "image/jpeg" | "image/png" =
        format === "PNG_LOSSLESS" ? "image/png" : "image/jpeg";
      const screenshotDataUrl =
        mimeType === "image/jpeg"
          ? canvas.toDataURL("image/jpeg", 0.95)
          : canvas.toDataURL("image/png");

      const base64Data = screenshotDataUrl.split(",")[1] || "";
      const binaryStr = atob(base64Data);
      const screenshotBytes = new Uint8Array(binaryStr.length);
      for (let bIdx = 0; bIdx < binaryStr.length; bIdx++) {
        screenshotBytes[bIdx] = binaryStr.charCodeAt(bIdx);
      }

      renderedSlides.push({
        slideNumber: slideNum,
        title: slideTitle || `Slide ${slideNum}`,
        notes: notesText,
        widthPx: targetWidthPx,
        heightPx: targetHeightPx,
        aspectRatio: slideWidthEmu / slideHeightEmu,
        screenshotDataUrl,
        screenshotBytes,
        mimeType,
        shapeCount: shapeCounter,
        imageCount: imageCounter,
      });
    }

    return renderedSlides;
  };

  const initialSlides = await renderDeckWithConfig(
    initialDpi,
    initialFormat,
    onProgress
  );

  return {
    slideWidthEmu,
    slideHeightEmu,
    aspectRatio: slideWidthEmu / slideHeightEmu,
    slides: initialSlides,
    reRenderAtOptions: (dpi, format, progressCb) =>
      renderDeckWithConfig(dpi, format, progressCb),
  };
}
