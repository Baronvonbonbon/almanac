import encodeQR from "qr";

/**
 * QR codes, drawn by almanac itself as one SVG path — no markup from elsewhere on the page. Medium
 * error correction, which a phone reads off another phone's screen even with a glare across it; and
 * the four-module quiet zone round the code that readers need to find it.
 */

export const QUIET_ZONE = 4;

/** The code's modules, quiet zone included: `true` is dark. */
export const qrModules = (text: string): boolean[][] => encodeQR(text, "raw", { ecc: "medium", border: QUIET_ZONE });

/** Every dark module as a unit square, joined along each row so the path stays short. */
export function qrPath(modules: boolean[][]): string {
  let d = "";
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return d;
}
