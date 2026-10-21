/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
  processSignature,
  processSignatureBuffer,
  createImageDataSafe,
} from "../signatureProcessor";

/**
 * Generates a synthetic RGBA image simulating uneven shadowed paper (gradient from 235 down to 135)
 * with a dark signature stroke in the center and optional 1x1 / 2x2 noise specks.
 */
function createSyntheticSignatureImage(
  width: number,
  height: number,
  options?: {
    drawStroke?: boolean;
    drawNoiseSpecks?: boolean;
    strokeLuminance?: number;
  }
): {
  rgba: Uint8ClampedArray;
  strokeBox: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const {
    drawStroke = true,
    drawNoiseSpecks = false,
    strokeLuminance = 25,
  } = options || {};

  const rgba = new Uint8ClampedArray(width * height * 4);

  // 1. Fill paper background with a diagonal illumination shadow gradient (235 -> 140)
  for (let y = 0; y < height; y++) {
    const gy = y / height;
    for (let x = 0; x < width; x++) {
      const gx = x / width;
      const paperVal = Math.round(235 - 60 * gx - 35 * gy);
      const idx = (y * width + x) * 4;
      rgba[idx] = paperVal;
      rgba[idx + 1] = paperVal;
      rgba[idx + 2] = paperVal - 4; // slight warm paper tint
      rgba[idx + 3] = 255;
    }
  }

  // 2. Draw a horizontal + diagonal signature stroke inside [40..150, 35..75]
  const minX = 40;
  const maxX = 150;
  const minY = 35;
  const maxY = 75;

  if (drawStroke) {
    for (let x = minX; x <= maxX; x++) {
      const t = (x - minX) / (maxX - minX);
      const centerY = Math.round(minY + t * (maxY - minY - 6));
      for (let dy = 0; dy <= 5; dy++) {
        const y = centerY + dy;
        const idx = (y * width + x) * 4;
        rgba[idx] = strokeLuminance;
        rgba[idx + 1] = strokeLuminance;
        rgba[idx + 2] = strokeLuminance + 10;
        rgba[idx + 3] = 255;
      }
    }
  }

  // 3. Draw isolated 1px and 2x2 dark dust specks near corners (area <= 4 px)
  if (drawNoiseSpecks) {
    const specks = [
      [8, 8],
      [9, 8],
      [width - 10, 10],
      [12, height - 12],
    ];
    for (const [sx, sy] of specks) {
      const idx = (sy * width + sx) * 4;
      rgba[idx] = 15;
      rgba[idx + 1] = 15;
      rgba[idx + 2] = 15;
      rgba[idx + 3] = 255;
    }
  }

  return {
    rgba,
    strokeBox: { minX, minY, maxX, maxY },
  };
}

describe("signatureProcessor 9-step pipeline", () => {
  it("normalizes shadowed background to transparent (alpha = 0) and auto-crops with padding", async () => {
    const width = 220;
    const height = 120;
    const padding = 16;
    const { rgba, strokeBox } = createSyntheticSignatureImage(width, height, {
      drawStroke: true,
    });

    const inputImgData = createImageDataSafe(rgba, width, height);
    const output = await processSignature(inputImgData, {
      padding,
      inkColor: "#000000",
    });

    // Expected tight bounding box dimensions + 2 * padding
    const expectedCropW = strokeBox.maxX - strokeBox.minX + 1 + padding * 2;
    const expectedCropH = strokeBox.maxY - strokeBox.minY + 1 + padding * 2;

    expect(output.width).toBeGreaterThanOrEqual(expectedCropW - 4);
    expect(output.width).toBeLessThanOrEqual(expectedCropW + 4);
    expect(output.height).toBeGreaterThanOrEqual(expectedCropH - 4);
    expect(output.height).toBeLessThanOrEqual(expectedCropH + 4);

    // Padding corners must be 100% transparent (alpha === 0)
    expect(output.data[3]).toBe(0);
    const bottomRightIdx = (output.width * output.height - 1) * 4;
    expect(output.data[bottomRightIdx + 3]).toBe(0);

    // Ensure non-zero opaque ink pixels exist inside the cropped signature
    let opaqueCount = 0;
    for (let i = 3; i < output.data.length; i += 4) {
      if (output.data[i] > 200) opaqueCount++;
    }
    expect(opaqueCount).toBeGreaterThan(200);
  });

  it("removes isolated dust specks via connected-component labeling", () => {
    const width = 220;
    const height = 120;
    const { rgba, strokeBox } = createSyntheticSignatureImage(width, height, {
      drawStroke: true,
      drawNoiseSpecks: true,
    });

    // Total pixels = 26,400. Default 0.0005 ratio => minArea = 13 pixels, removing 1-4px specks
    const result = processSignatureBuffer(rgba, width, height, {
      minComponentAreaRatio: 0.0005,
      padding: 0,
    });

    expect(result.empty).toBe(false);
    expect(result.boundingBox).not.toBeNull();
    // Because corner specks at (8,8) and (210,10) were removed, boundingBox starts near strokeBox.minX (40)
    expect(result.boundingBox!.minX).toBeGreaterThanOrEqual(strokeBox.minX - 2);
    expect(result.boundingBox!.maxX).toBeLessThanOrEqual(strokeBox.maxX + 2);
  });

  it("applies custom inkColor and handles slider extremes sanely", () => {
    const width = 200;
    const height = 100;
    const { rgba } = createSyntheticSignatureImage(width, height, {
      drawStroke: true,
    });

    // Dilate (+2 thickness) vs Erode (-2 thickness)
    const thinRes = processSignatureBuffer(rgba, width, height, {
      thickness: -2,
      sensitivity: 10,
      inkColor: "#0A2463", // Archival Blue: R=10, G=36, B=99
    });
    const boldRes = processSignatureBuffer(rgba, width, height, {
      thickness: 2,
      sensitivity: 90,
      inkColor: "#0A2463",
    });

    const countInkPixels = (buf: Uint8ClampedArray) => {
      let count = 0;
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 50) {
          expect(buf[i]).toBe(10);
          expect(buf[i + 1]).toBe(36);
          expect(buf[i + 2]).toBe(99);
          count++;
        }
      }
      return count;
    };

    const thinInk = countInkPixels(thinRes.data);
    const boldInk = countInkPixels(boldRes.data);
    expect(boldInk).toBeGreaterThan(thinInk);
  });

  it("detects blank paper and throws NO_SIGNATURE_DETECTED in headless processSignature", async () => {
    const width = 160;
    const height = 90;
    const { rgba } = createSyntheticSignatureImage(width, height, {
      drawStroke: false,
    });
    const blankImgData = createImageDataSafe(rgba, width, height);

    await expect(
      processSignature(blankImgData, { sensitivity: 20 })
    ).rejects.toThrow(/NO_SIGNATURE_DETECTED/);
  });
});
