/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId } from "react";
import { RetroView } from "../types";

interface ModuleIconBadgeProps {
  view: RetroView;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function ModuleIconBadge({
  view,
  size = "md",
  className = "",
}: ModuleIconBadgeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `cutout_${view}_${uid}`;

  const sizeClasses =
    size === "sm"
      ? "w-7 h-7"
      : size === "lg"
      ? "w-12 h-12 sm:w-14 sm:h-14"
      : "w-10 h-10 sm:w-11 sm:h-11";

  return (
    <span
      className={`module-2d-logo relative inline-flex items-center justify-center shrink-0 select-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 ${sizeClasses} ${className}`}
    >
      {render2DCreativeLogo(view, maskId)}
    </span>
  );
}

function render2DCreativeLogo(view: RetroView, maskId: string) {
  const svgClass = "w-full h-full overflow-visible";

  switch (view) {
    case "sign_pdf":
      // Soft Sky document page + Vibrant Cobalt Fountain Pen Nib signing a fluid curve
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Document with signature wave */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="21" height="22" rx="5.5" fill="#dbeafe" />
            <path d="M7 8.5H16.5M7 12.5H13" stroke="#1e40af" strokeWidth="2.1" strokeLinecap="round" />
            <path
              d="M7 17.5C8.8 15.5 10.5 19 12.5 16.8"
              stroke="#2563eb"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Cobalt Fountain Pen Nib */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#2563eb" />
          <path
            d="M32.5 21.5L29 31.5L21.5 33L23 25.5L32.5 21.5Z"
            fill="#ffffff"
            fillOpacity="0.2"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M32.5 21.5L26.8 27.2" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="26.2" cy="27.8" r="1.3" fill="#ffffff" />
        </svg>
      );

    case "compress_img":
      // 4-Tile 2D Pinwheel: 2 Soft Mint Squeeze Arrow Tiles + 2 Emerald Landscape Photo Tiles
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          {/* Top-Left Mint Tile (Squeeze Arrow ↘) */}
          <rect x="2.5" y="2.5" width="16" height="16" rx="4.5" fill="#d1fae5" />
          <path
            d="M7 7L13.5 13.5M13.5 13.5V8.2M13.5 13.5H8.2"
            stroke="#047857"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Top-Right Emerald Tile (Sun & Sky) */}
          <rect x="21.5" y="2.5" width="16" height="16" rx="4.5" fill="#10b981" />
          <circle cx="29.5" cy="10.5" r="3.2" fill="#ffffff" />
          {/* Bottom-Left Emerald Tile (Mountain Peaks) */}
          <rect x="2.5" y="21.5" width="16" height="16" rx="4.5" fill="#059669" />
          <path
            d="M5.5 33.5L9.5 27L12.5 31L14.2 29L16 33.5H5.5Z"
            fill="#ffffff"
          />
          {/* Bottom-Right Mint Tile (Squeeze Arrow ↖) */}
          <rect x="21.5" y="21.5" width="16" height="16" rx="4.5" fill="#d1fae5" />
          <path
            d="M33 33L26.5 26.5M26.5 26.5V31.8M26.5 26.5H31.8"
            stroke="#047857"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "compress_pdf":
      // Diagonal Dual Coral Tiles Pressing Inward Across a Dotted Seam
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="15.5" y="15.5" width="24" height="24" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Top-Left Coral Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20" height="20" rx="5.5" fill="#fca5a5" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#991b1b"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Bottom-Right Vivid Red Tile */}
          <rect x="18" y="18" width="19.5" height="19.5" rx="5.5" fill="#ef4444" />
          <path
            d="M32 32L25.5 25.5M25.5 25.5V30.8M25.5 25.5H30.8"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Diagonal Compression Seam Dots */}
          <circle cx="14" cy="26" r="1.4" fill="#ef4444" />
          <circle cx="17" cy="23" r="1.3" fill="#fca5a5" />
          <circle cx="26" cy="14" r="1.4" fill="#ef4444" />
        </svg>
      );

    case "convert_img":
      // Warm Amber & Vivid Orange Overlapping Image Tiles + Dual Orbital Loop Arrows
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Amber */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20" height="20" rx="5.5" fill="#fde68a" />
            <circle cx="9" cy="9" r="2.2" fill="#b45309" />
            <path d="M6 17.5L10.5 12L14.5 17.5H6Z" fill="#b45309" />
          </g>
          {/* Front Tile: Vivid Orange */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#f59e0b" />
          <circle cx="23.5" cy="23.2" r="2" fill="#ffffff" />
          <path d="M20.5 33L25.5 26.8L29 30.5L31.5 28L34.5 33H20.5Z" fill="#ffffff" />
          {/* Top-Right & Bottom-Left Orbital Sync Arrows */}
          <path
            d="M25.5 6.5H30.5C32.2 6.5 33.5 7.8 33.5 9.5V13M33.5 13L31 10.5M33.5 13L36 10.5"
            stroke="#f59e0b"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.5 33.5H9.5C7.8 33.5 6.5 32.2 6.5 30.5V27M6.5 27L9 29.5M6.5 27L4 29.5"
            stroke="#fbbf24"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "image_to_pdf":
      // Soft Peach Photo Tile -> Vibrant Terracotta Folded-Corner PDF Document
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="13.5" width="25" height="26" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Photo Frame */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#ffedd5" />
            <circle cx="9" cy="8.8" r="2" fill="#c2410c" />
            <path d="M6 17.5L10.5 12L15 17.5H6Z" fill="#c2410c" />
          </g>
          {/* Front Tile: Folded-Corner PDF Document */}
          <path
            d="M17 20C17 17.8 18.8 16 21 16H30.5L37 22.5V33.5C37 35.7 35.2 37.5 33 37.5H21C18.8 37.5 17 35.7 17 33.5V20Z"
            fill="#ea580c"
          />
          <path d="M30 16V23H37" fill="#fdba74" />
          <path
            d="M21.5 27.5H32.5M21.5 31.8H28.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "merge_pdf":
      // Two Interlocking Cerulean Tiles Converging Together
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="15" y="15" width="24.5" height="24.5" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Top-Left Soft Cyan Page Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#bae6fd" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#0369a1"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Bottom-Right Deep Ocean Page Tile */}
          <rect x="17.5" y="17.5" width="20" height="20" rx="5.5" fill="#0284c7" />
          <path
            d="M32 32L25.5 25.5M25.5 25.5V30.8M25.5 25.5H30.8"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "pdf_to_images":
      // Soft Lavender PDF Tile -> Bold Violet Photo Frame Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Lavender Document with Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#ede9fe" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#6d28d9"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vivid Violet Photo Landscape */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#7c3aed" />
          <circle cx="23.2" cy="23.2" r="2.1" fill="#ffffff" />
          <path
            d="M20.2 33L25.2 26.8L28.8 30.5L31.4 27.8L34.5 33H20.2Z"
            fill="#ffffff"
          />
        </svg>
      );

    case "remove_pdf_pages":
      // Soft Rose Document Stack + Bold Crimson Page Cutout with White 'X'
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Rose Document */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#ffe4e6" />
            <path
              d="M7.5 9H16M7.5 13H12.5"
              stroke="#be123c"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Vivid Crimson Delete Tile */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#e11d48" />
          <path
            d="M23.5 23.5L31 31M31 23.5L23.5 31"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case "organize_pdf":
      // 4-Tile Bento Grid with Lifted/Tilted Mint Tile & Directional Reorder Arrows
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          {/* Top-Left Teal Page Tile */}
          <rect x="2.5" y="2.5" width="16" height="16" rx="4.5" fill="#0d9488" />
          <path d="M6.8 8.5H14M6.8 12.2H11.5" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
          {/* Top-Right Tilted Mint Tile */}
          <rect
            x="21.5"
            y="2.5"
            width="16"
            height="16"
            rx="4.5"
            transform="rotate(8 29.5 10.5)"
            fill="#99f6e4"
          />
          <path
            d="M26.5 13L32 7.5M32 7.5H27.5M32 7.5V12"
            stroke="#0f766e"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom-Left Mint Tile */}
          <rect x="2.5" y="21.5" width="16" height="16" rx="4.5" fill="#99f6e4" />
          <path
            d="M13 26.5L7.5 32M7.5 32H12M7.5 32V27.5"
            stroke="#0f766e"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom-Right Teal Page Tile */}
          <rect x="21.5" y="21.5" width="16" height="16" rx="4.5" fill="#0d9488" />
          <path d="M25.8 27.5H33M25.8 31.2H30.5" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );

    case "watermark_pdf":
      // Soft Cyan Document Tile + Bold Cyan Verification Seal Stamp
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <circle cx="27" cy="27" r="13" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Cyan Page with Diagonal Watermark Bars */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="21.5" height="21.5" rx="5.5" fill="#cffafe" />
            <path
              d="M7.5 14.5L16.5 9M7.5 18.5L14 14.5"
              stroke="#0e7490"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Circular Verification Seal */}
          <circle cx="27" cy="27" r="10.5" fill="#0891b2" />
          <circle
            cx="27"
            cy="27"
            r="7.5"
            stroke="#ffffff"
            strokeOpacity="0.45"
            strokeWidth="1.3"
            strokeDasharray="2.2 1.8"
          />
          <path
            d="M23.5 27.2L26 29.7L30.8 24.8"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "word_to_pdf":
      // Soft Blue 'W' Monogram Tile -> Bold Cobalt Folded-Corner PDF Document
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="13.5" width="25" height="26" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Sky 'W' Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#dbeafe" />
            <path
              d="M6.8 8L8.8 15.5L11.5 10.2L14.2 15.5L16.2 8"
              stroke="#1e40af"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Folded-Corner PDF Sheet */}
          <path
            d="M17 20C17 17.8 18.8 16 21 16H30.5L37 22.5V33.5C37 35.7 35.2 37.5 33 37.5H21C18.8 37.5 17 35.7 17 33.5V20Z"
            fill="#3b82f6"
          />
          <path d="M30 16V23H37" fill="#93c5fd" />
          <path
            d="M21.5 27.5H32.5M21.5 31.8H28.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "word_to_jpg":
      // Soft Indigo 'W' Tile -> Vivid Indigo Landscape Photo Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Indigo 'W' */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#e0e7ff" />
            <path
              d="M6.8 8L8.8 15.5L11.5 10.2L14.2 15.5L16.2 8"
              stroke="#3730a3"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vivid Indigo Photo Landscape */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#6366f1" />
          <circle cx="23.2" cy="23.2" r="2.1" fill="#ffffff" />
          <path
            d="M20.2 33L25.2 26.8L28.8 30.5L31.4 27.8L34.5 33H20.2Z"
            fill="#ffffff"
          />
        </svg>
      );

    case "pdf_to_word":
      // Soft Sky Arrow Tile -> Bold Royal Blue 'W' Monogram Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Sky with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#dbeafe" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#1e40af"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Blue with White 'W' */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#4f75c8" />
          <path
            d="M21.5 22.5L24 32L27.25 25.2L30.5 32L33 22.5"
            stroke="#ffffff"
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "excel_to_pdf":
      // Soft Mint 'X' Spreadsheet Tile -> Bold Emerald Folded-Corner PDF Document
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="13.5" width="25" height="26" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint 'X' */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#dcfce7" />
            <path
              d="M8 8L14.8 14.8M14.8 8L8 14.8"
              stroke="#166534"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Folded-Corner PDF Document */}
          <path
            d="M17 20C17 17.8 18.8 16 21 16H30.5L37 22.5V33.5C37 35.7 35.2 37.5 33 37.5H21C18.8 37.5 17 35.7 17 33.5V20Z"
            fill="#16a34a"
          />
          <path d="M30 16V23H37" fill="#86efac" />
          <path
            d="M21.5 27.5H32.5M21.5 31.8H28.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "pdf_to_excel":
      // Soft Mint Arrow Tile -> Bold Emerald 'X' Monogram Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#dcfce7" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#166534"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Emerald with White 'X' */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#16a34a" />
          <path
            d="M23.2 23.2L31.3 31.3M31.3 23.2L23.2 31.3"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case "ppt_to_pdf":
      // Soft Peach 'P' Tile -> Bold Coral Folded-Corner PDF Document
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="13.5" width="25" height="26" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Peach 'P' */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#ffedd5" />
            <path
              d="M9 15.5V7.8H12.8C14.4 7.8 15.5 8.8 15.5 10.3C15.5 11.8 14.4 12.8 12.8 12.8H9"
              stroke="#c2410c"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Folded-Corner PDF Document */}
          <path
            d="M17 20C17 17.8 18.8 16 21 16H30.5L37 22.5V33.5C37 35.7 35.2 37.5 33 37.5H21C18.8 37.5 17 35.7 17 33.5V20Z"
            fill="#f97316"
          />
          <path d="M30 16V23H37" fill="#fed7aa" />
          <path
            d="M21.5 27.5H32.5M21.5 31.8H28.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "pdf_to_ppt":
      // Soft Peach Arrow Tile -> Bold Coral 'P' Monogram Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Peach with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#fde6db" />
            <path
              d="M8 8L14.5 14.5M14.5 14.5V9.2M14.5 14.5H9.2"
              stroke="#c2410c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vibrant Coral with White 'P' */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#ff7448" />
          <path
            d="M24 32.2V22.2H28C30 22.2 31.4 23.4 31.4 25.2C31.4 27 30 28.2 28 28.2H24"
            stroke="#ffffff"
            strokeWidth="2.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "lock_pdf":
      // Soft Amber Cipher Tile + Bold Amber Vault Lock Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Amber with Cipher Dots */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#fef3c7" />
            <circle cx="8" cy="11" r="1.7" fill="#b45309" />
            <circle cx="12.5" cy="11" r="1.7" fill="#b45309" />
            <circle cx="17" cy="11" r="1.7" fill="#b45309" />
          </g>
          {/* Front Tile: Bold Amber with Closed Padlock */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#d97706" />
          <rect x="22.5" y="26.5" width="9.5" height="7" rx="2" fill="#ffffff" />
          <path
            d="M24.2 26.5V24C24.2 22.3 25.5 21.2 27.25 21.2C29 21.2 30.3 22.3 30.3 24V26.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="27.25" cy="30" r="1.1" fill="#d97706" />
        </svg>
      );

    case "unlock_pdf":
      // Soft Mint Tile + Bold Emerald Open Padlock Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint with Checkmark */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#d1fae5" />
            <path
              d="M8 11.5L11 14.5L16.5 8.5"
              stroke="#047857"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Emerald with Open Shackle Padlock */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#10b981" />
          <rect x="22.5" y="26.5" width="9.5" height="7" rx="2" fill="#ffffff" />
          <path
            d="M24.2 26.5V23.5C24.2 21.8 25.5 20.8 27.25 20.8C28.8 20.8 30 21.7 30.3 23"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="27.25" cy="30" r="1.1" fill="#10b981" />
        </svg>
      );

    case "passport_photo":
      // Soft Lime Biometric Viewfinder Tile + Bold Sage Portrait Bust Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Lime with Biometric Reticle Brackets */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#ecfccb" />
            <path
              d="M7.5 13V9C7.5 8.2 8.2 7.5 9 7.5H13"
              stroke="#4d7c0f"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Bold Sage Green with Portrait Silhouette */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#84b84c" />
          <circle cx="27.25" cy="24" r="3" fill="#ffffff" />
          <path
            d="M21.8 33.5C21.8 30.3 24.2 28.5 27.25 28.5C30.3 28.5 32.7 30.3 32.7 33.5"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case "watermark_remover":
    case "pdf_watermark_remover":
      // Soft Fuchsia Stamp Page + Bold Magenta Eraser Sparkle Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Fuchsia Page with Faded Diagonal Stamp */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#fae8ff" />
            <path
              d="M7.5 14.5L16.5 9M7.5 18L13.5 14"
              stroke="#a21caf"
              strokeWidth="2.1"
              strokeDasharray="2.5 2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Vivid Fuchsia Eraser & Sparkle */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#d946ef" />
          <path
            d="M22.5 29.5L27.8 24.2C28.6 23.4 29.8 23.4 30.6 24.2L32.3 25.9C33.1 26.7 33.1 27.9 32.3 28.7L28.5 32.5H24.2L22.5 30.8C22 30.3 22 29.9 22.5 29.5Z"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <path d="M25.5 26.5L29.8 30.8" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M22 32.5H33" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );

    case "image_watermark_remover":
      // Soft Rose Photo Landscape Tile + Bold Rose/Pink Magic Eraser Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Pink Landscape Photo */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#fce7f3" />
            <circle cx="9" cy="9" r="2.1" fill="#be185d" />
            <path d="M6 17.5L10.5 12L15 17.5H6Z" fill="#be185d" />
          </g>
          {/* Front Tile: Vivid Pink Magic Eraser */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#ec4899" />
          <path
            d="M22.5 29.5L27.8 24.2C28.6 23.4 29.8 23.4 30.6 24.2L32.3 25.9C33.1 26.7 33.1 27.9 32.3 28.7L28.5 32.5H24.2L22.5 30.8C22 30.3 22 29.9 22.5 29.5Z"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <path d="M25.5 26.5L29.8 30.8" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M22 32.5H33" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );

    case "audio_converter":
      // Soft Mint Waveform Tile + Vibrant Emerald Musical Note / Equalizer Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint Waveform */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#d1fae5" />
            <path
              d="M6.5 13V10.5M9.5 15.5V8M12.5 16.5V7M15.5 14V9.5"
              stroke="#047857"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Emerald Audio Studio Note */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#10b981" />
          <path
            d="M25.5 30.5V22.5L32 21V29"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23.8" cy="30.5" r="2.2" fill="#ffffff" />
          <circle cx="30.3" cy="29" r="2.2" fill="#ffffff" />
        </svg>
      );

    case "video_converter":
      // Soft Sky Film Frame Tile + Vibrant Cyan/Blue Clapper Play Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Sky Film Strip */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#e0f2fe" />
            <rect x="6" y="7" width="13" height="10" rx="2" stroke="#0369a1" strokeWidth="2" />
          </g>
          {/* Front Tile: Vivid Sky Blue Play Triangle */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#0284c7" />
          <path
            d="M24.5 22.8L32 27.25L24.5 31.7V22.8Z"
            fill="#ffffff"
            stroke="#ffffff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "audio_extractor":
      // Soft Amber Video Frame Tile + Bold Amber Extracted Soundwave Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Amber Video Frame */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#fef3c7" />
            <path d="M10 8.5L15.5 12L10 15.5V8.5Z" fill="#b45309" />
          </g>
          {/* Front Tile: Vivid Amber Audio Waveform */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#f59e0b" />
          <path
            d="M21.5 29V25.5M24.5 31.5V23M27.5 33V21.5M30.5 30.5V24M33.5 28.5V26"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "audio_editor":
      // Soft Purple Waveform Tile + Vivid Purple Equalizer Faders Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Purple Waveform */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#f3e8ff" />
            <path
              d="M6.5 13V10.5M9.5 15.5V8M12.5 16.5V7M15.5 14V9.5"
              stroke="#7e22ce"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Vivid Purple Studio EQ Sliders */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#9333ea" />
          <path
            d="M22.5 22V32.5M27.25 22V32.5M32 22V32.5"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="22.5" cy="25.5" r="2" fill="#ffffff" />
          <circle cx="27.25" cy="29.5" r="2" fill="#ffffff" />
          <circle cx="32" cy="24.5" r="2" fill="#ffffff" />
        </svg>
      );

    case "video_extractor":
      // Soft Cyan Video Film Tile + Bold Cyan Camera Frame Snapshot Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Cyan Video Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#cffafe" />
            <path d="M9.5 8.5L15 12L9.5 15.5V8.5Z" fill="#0e7490" />
          </g>
          {/* Front Tile: Vivid Cyan Frame Extractor */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#0891b2" />
          <rect
            x="21.5"
            y="22.5"
            width="11.5"
            height="9.5"
            rx="2"
            stroke="#ffffff"
            strokeWidth="2"
          />
          <circle cx="27.25" cy="27.25" r="2.2" fill="#ffffff" />
        </svg>
      );

    case "video_editor":
      // Soft Indigo Film Tile + Vivid Indigo Scissors/Timeline Studio Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="25" height="25" rx="7" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Indigo Film Strip */}
          <g mask={`url(#${maskId})`}>
            <rect x="2.5" y="2.5" width="20.5" height="20.5" rx="5.5" fill="#e0e7ff" />
            <rect x="6.5" y="7.5" width="12.5" height="9.5" rx="2" stroke="#4338ca" strokeWidth="2" />
          </g>
          {/* Front Tile: Vivid Indigo Timeline Trim & Filter Sliders */}
          <rect x="17" y="17" width="20.5" height="20.5" rx="5.5" fill="#4f46e5" />
          <path
            d="M22 24.5H32.5M22 29.8H32.5"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="25.5" cy="24.5" r="2.1" fill="#ffffff" />
          <circle cx="29.5" cy="29.8" r="2.1" fill="#ffffff" />
        </svg>
      );

    default:
      return null;
  }
}
