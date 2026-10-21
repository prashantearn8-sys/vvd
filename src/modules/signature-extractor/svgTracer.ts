/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lazy-loaded SVG contour/run-length vector tracer for extracted signatures.
 * Converts an extracted transparent signature ImageData into a compact, scalable <svg> string
 * with zero network calls.
 */

export function traceSignatureToSvg(
  imageData: ImageData,
  inkColor: string = "#000000"
): string {
  const { data, width, height } = imageData;
  const paths: string[] = [];

  // Build horizontal scanline sub-paths merged vertically where possible for crisp vector output
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let x = 0;
    while (x < width) {
      const alpha = data[(rowOffset + x) * 4 + 3];
      if (alpha >= 64) {
        const startX = x;
        while (x < width && data[(rowOffset + x) * 4 + 3] >= 64) {
          x++;
        }
        const runLen = x - startX;
        paths.push(`M${startX} ${y}h${runLen}v1h-${runLen}Z`);
      } else {
        x++;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="geometricPrecision">`,
    `  <path fill="${inkColor}" d="${paths.join("")}" />`,
    `</svg>`,
  ].join("\n");
}
