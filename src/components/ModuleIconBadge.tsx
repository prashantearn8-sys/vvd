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
  const uid = useId().replace(/:/g, "");
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
      // 2D Duotone: Soft Sky page tile + Bold Blue Fountain Nib & Signature tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14" y="14" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Ice Blue with deep blue signature wave */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="21" height="21" rx="5.5" fill="#dbeafe" />
            <path
              d="M7.5 11.5C9.5 9 11 14 13 11.5C14.5 9.8 16 12.5 18.5 10.5"
              stroke="#1d4ed8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M7.5 16H13" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
          </g>
          {/* Front Tile: Vibrant Cobalt with White Nib */}
          <rect x="16.5" y="16.5" width="20.5" height="20.5" rx="5.5" fill="#2563eb" />
          <path
            d="M31.5 21.5L28.5 31.5L21.5 32.5L22.5 25.5L31.5 21.5Z"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M31.5 21.5L26 27" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="25.5" cy="27.5" r="1.2" fill="#ffffff" />
        </svg>
      );

    case "compress_img":
      // 2D 4-Tile Pinwheel: 2 Mint arrow tiles + 2 Emerald image tiles squeezing inward
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          {/* Top-Left Mint Tile (Inward Arrow ↘) */}
          <rect x="3" y="3" width="15.5" height="15.5" rx="4.5" fill="#d1fae5" />
          <path
            d="M7.5 7.5L13.5 13.5M13.5 13.5V8.5M13.5 13.5H8.5"
            stroke="#047857"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Top-Right Emerald Tile (Sun & Frame) */}
          <rect x="21.5" y="3" width="15.5" height="15.5" rx="4.5" fill="#10b981" />
          <circle cx="29.2" cy="10.8" r="3" fill="#ffffff" />
          {/* Bottom-Left Emerald Tile (Mountain Peaks) */}
          <rect x="3" y="21.5" width="15.5" height="15.5" rx="4.5" fill="#059669" />
          <path
            d="M6.5 33L10.2 27.5L15 33H6.5Z"
            fill="#ffffff"
          />
          {/* Bottom-Right Mint Tile (Inward Arrow ↖) */}
          <rect x="21.5" y="21.5" width="15.5" height="15.5" rx="4.5" fill="#d1fae5" />
          <path
            d="M32.5 32.5L26.5 26.5M26.5 26.5V31.5M26.5 26.5H31.5"
            stroke="#047857"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "compress_pdf":
      // 2D Diagonal Squeeze: Two Coral Red blocks pressing inward on a dotted seam
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="16" y="16" width="22" height="22" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Top-Left Soft Coral Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20" height="20" rx="5.5" fill="#fee2e2" />
            <path
              d="M8.5 8.5L15 15M15 15V9.5M15 15H9.5"
              stroke="#dc2626"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Bottom-Right Vivid Coral Red Tile */}
          <rect x="18" y="18" width="19" height="19" rx="5.5" fill="#ef4444" />
          <path
            d="M31.5 31.5L25 25M25 25V30.5M25 25H30.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Diagonal compression dots */}
          <circle cx="15.5" cy="24.5" r="1.3" fill="#ef4444" />
          <circle cx="24.5" cy="15.5" r="1.3" fill="#ef4444" />
        </svg>
      );

    case "convert_img":
      // 2D Duotone Morph: Warm Amber Circle + Vibrant Orange Rounded Tile with Sync Arrows
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Amber with dark-amber cycle arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="6" fill="#fef3c7" />
            <path
              d="M8.5 13.5C8.5 10.5 10.8 8.2 13.8 8.2H16M16 8.2L13.5 6M16 8.2L13.5 10.5"
              stroke="#b45309"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vivid Orange with white landscape mountain & cycle arrow */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#f59e0b" />
          <circle cx="23.5" cy="23.5" r="2" fill="#ffffff" />
          <path
            d="M20.5 32.5L25.5 26.5L29 30L31.5 27.5L34 32.5H20.5Z"
            fill="#ffffff"
          />
        </svg>
      );

    case "image_to_pdf":
      // 2D Duotone: Soft Peach Image Tile -> Vibrant Terracotta PDF Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Peach Photo Frame */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#ffedd5" />
            <circle cx="9.5" cy="9.5" r="2" fill="#c2410c" />
            <path
              d="M6.5 18L11 12.5L15.5 18H6.5Z"
              fill="#c2410c"
            />
          </g>
          {/* Front Tile: Terracotta Orange PDF Tile */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#ea580c" />
          <path
            d="M22 23.5H29.5M22 27.5H32M22 31.5H27.5"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "merge_pdf":
      // 2D Interlocking: Two Cyan Tiles merging with diagonal arrows toward center
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="15" y="15" width="22.5" height="22.5" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Top-Left Soft Sky Tile */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#e0f2fe" />
            <path
              d="M8.5 8.5L14.5 14.5M14.5 14.5V9.5M14.5 14.5H9.5"
              stroke="#0369a1"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Bottom-Right Deep Cerulean Tile */}
          <rect x="17.5" y="17.5" width="19.5" height="19.5" rx="5.5" fill="#0284c7" />
          <path
            d="M23.5 27.2H31M27.25 23.5V31"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case "pdf_to_images":
      // 2D Duotone: Soft Lavender PDF Tile -> Bold Violet Photo Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Lavender with outward arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#ede9fe" />
            <path
              d="M8.5 8.5L14.5 14.5M14.5 14.5V9.5M14.5 14.5H9.5"
              stroke="#6d28d9"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vivid Purple Image Tile */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#8b5cf6" />
          <circle cx="23.2" cy="23.2" r="2" fill="#ffffff" />
          <path
            d="M20.5 32.5L25.2 26.8L28.8 30.2L31.2 27.8L34 32.5H20.5Z"
            fill="#ffffff"
          />
        </svg>
      );

    case "remove_pdf_pages":
      // 2D Duotone: Soft Rose Tile + Tilted Crimson Delete Tile with White Cross
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Rose Page */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#ffe4e6" />
            <path
              d="M8 9.5H16M8 13.5H13"
              stroke="#be123c"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Bold Crimson with White X */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#e11d48" />
          <path
            d="M23.5 23.5L30.5 30.5M30.5 23.5L23.5 30.5"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "organize_pdf":
      // 2D 4-Tile Bento Grid with one tilted active Mint tile & directional arrows
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          {/* Top-Left Teal Tile */}
          <rect x="3" y="3" width="15.5" height="15.5" rx="4.5" fill="#0d9488" />
          <path d="M7.5 9H14M7.5 12.5H11.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          {/* Top-Right Tilted Mint Tile (Being Reordered) */}
          <rect
            x="21.5"
            y="3"
            width="15.5"
            height="15.5"
            rx="4.5"
            transform="rotate(7 29.25 10.75)"
            fill="#ccfbf1"
          />
          <path
            d="M26.5 13L31.5 8M31.5 8H27.5M31.5 8V12"
            stroke="#0f766e"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom-Left Mint Tile */}
          <rect x="3" y="21.5" width="15.5" height="15.5" rx="4.5" fill="#ccfbf1" />
          <path
            d="M13 26.5L8 31.5M8 31.5H12M8 31.5V27.5"
            stroke="#0f766e"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom-Right Teal Tile */}
          <rect x="21.5" y="21.5" width="15.5" height="15.5" rx="4.5" fill="#0d9488" />
          <path d="M26 27.5H32.5M26 31H30" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "watermark_pdf":
      // 2D Duotone: Soft Cyan Page Tile + Bold Cyan Circular Stamp Badge
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <circle cx="27" cy="27" r="12.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Cyan Page */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="21" height="21" rx="5.5" fill="#cffafe" />
            <path
              d="M8 14.5L16.5 9.5M8 18.5L14 15"
              stroke="#0e7490"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Bold Cyan Stamp Circle */}
          <circle cx="27" cy="27" r="10.2" fill="#0891b2" />
          <path
            d="M23.2 27.2L25.8 29.8L31 24.5"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "word_to_pdf":
      // 2D Duotone: Bold Blue 'W' Tile -> Soft Sky & Cobalt Arrow Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Blue with 'W' */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#dbeafe" />
            <path
              d="M7.2 8.5L9.2 15.5L11.8 10.5L14.4 15.5L16.4 8.5"
              stroke="#1e40af"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Cobalt PDF Tile with outward arrow & lines */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#3b82f6" />
          <path
            d="M23 23L30 30M30 30V24.5M30 30H24.5"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "word_to_jpg":
      // 2D Duotone: Soft Indigo 'W' Tile -> Bold Indigo Image Viewfinder Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Indigo with 'W' */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#e0e7ff" />
            <path
              d="M7.2 8.5L9.2 15.5L11.8 10.5L14.4 15.5L16.4 8.5"
              stroke="#3730a3"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vivid Indigo Photo Tile */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#6366f1" />
          <circle cx="23.2" cy="23.2" r="2" fill="#ffffff" />
          <path
            d="M20.5 32.5L25.5 26.8L29 30.2L31.5 27.8L34 32.5H20.5Z"
            fill="#ffffff"
          />
        </svg>
      );

    case "pdf_to_word":
      // 2D Duotone: Soft Sky Arrow Tile -> Bold Blue 'W' Monogram Tile (Inspired by reference)
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Sky Blue with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#dbeafe" />
            <path
              d="M8.5 8.5L14.5 14.5M14.5 14.5V9.5M14.5 14.5H9.5"
              stroke="#1e40af"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Royal Blue with crisp White 'W' */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#4f75c8" />
          <path
            d="M21.5 22.5L24 31.5L27 25L30 31.5L32.5 22.5"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "excel_to_pdf":
      // 2D Duotone: Soft Mint 'X' Tile -> Bold Forest Green PDF Arrow Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint with Green 'X' */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#dcfce7" />
            <path
              d="M8.5 8.5L15 15M15 8.5L8.5 15"
              stroke="#166534"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Vivid Green with White PDF Lines & Arrow */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#22c55e" />
          <path
            d="M23 23L30 30M30 30V24.5M30 30H24.5"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "pdf_to_excel":
      // 2D Duotone: Soft Mint Arrow Tile -> Bold Green 'X' Monogram Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#dcfce7" />
            <path
              d="M8.5 8.5L14.5 14.5M14.5 14.5V9.5M14.5 14.5H9.5"
              stroke="#166534"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Emerald with crisp White 'X' */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#16a34a" />
          <path
            d="M23 23L31 31M31 23L23 31"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "ppt_to_pdf":
      // 2D Duotone: Soft Peach 'P' Tile -> Bold Coral Slide/PDF Arrow Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Peach with 'P' */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#ffedd5" />
            <path
              d="M9.5 15.5V8H13C14.5 8 15.5 9 15.5 10.5C15.5 12 14.5 13 13 13H9.5"
              stroke="#c2410c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Coral Orange with White ↘ Arrow */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#f97316" />
          <path
            d="M23 23L30 30M30 30V24.5M30 30H24.5"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "pdf_to_ppt":
      // 2D Duotone: Soft Peach Arrow Tile -> Bold Coral 'P' Monogram Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Peach with ↘ Arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#fde6db" />
            <path
              d="M8.5 8.5L14.5 14.5M14.5 14.5V9.5M14.5 14.5H9.5"
              stroke="#c2410c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Vibrant Coral with White 'P' */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#ff7448" />
          <path
            d="M24 32V22H28C30 22 31.2 23.2 31.2 25C31.2 26.8 30 28 28 28H24"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "lock_pdf":
      // 2D Duotone: Soft Amber Cipher Tile + Bold Amber Vault Lock Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Warm Amber with asterisks/dots */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#fef3c7" />
            <circle cx="8.5" cy="11.5" r="1.6" fill="#b45309" />
            <circle cx="13" cy="11.5" r="1.6" fill="#b45309" />
            <circle cx="17.5" cy="11.5" r="1.6" fill="#b45309" />
          </g>
          {/* Front Tile: Bold Amber with White Padlock */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#d97706" />
          <rect x="22.5" y="26.5" width="9" height="6.5" rx="1.8" fill="#ffffff" />
          <path
            d="M24.2 26.5V24.2C24.2 22.6 25.4 21.5 27 21.5C28.6 21.5 29.8 22.6 29.8 24.2V26.5"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );

    case "unlock_pdf":
      // 2D Duotone: Soft Mint Tile + Bold Sage Open Padlock Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Mint with unlock arrow */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#d1fae5" />
            <path
              d="M14.5 14.5L8.5 8.5M8.5 8.5V13.5M8.5 8.5H13.5"
              stroke="#047857"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Front Tile: Bold Emerald with Open Shackle Padlock */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#10b981" />
          <rect x="22.5" y="26.5" width="9" height="6.5" rx="1.8" fill="#ffffff" />
          <path
            d="M24.2 26.5V23.8C24.2 22.2 25.4 21 27 21C28.4 21 29.5 21.9 29.8 23.2"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );

    case "passport_photo":
      // 2D Duotone: Soft Lime Viewfinder Tile + Bold Olive Portrait Silhouette Tile
      return (
        <svg viewBox="0 0 40 40" fill="none" className={svgClass} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="40" height="40" fill="white" />
              <rect x="14.5" y="14.5" width="23" height="23" rx="6.5" fill="black" />
            </mask>
          </defs>
          {/* Back Tile: Soft Lime with crop corner bracket */}
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="20.5" height="20.5" rx="5.5" fill="#ecfccb" />
            <path
              d="M8 14V9.5C8 8.7 8.7 8 9.5 8H14"
              stroke="#4d7c0f"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
          {/* Front Tile: Bold Sage Green with White Portrait Bust */}
          <rect x="17" y="17" width="20" height="20" rx="5.5" fill="#84b84c" />
          <circle cx="27" cy="24.2" r="2.8" fill="#ffffff" />
          <path
            d="M22 33C22 30.2 24.2 28.5 27 28.5C29.8 28.5 32 30.2 32 33"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </svg>
      );

    default:
      return null;
  }
}
