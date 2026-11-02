// A minimal PDF writer: A4 landscape pages with lines, rectangles, circles and Helvetica text. No package needed.
// Text is WinAnsi (Latin-1), so "·" and "±" work; other characters are replaced with "?".
import "server-only";

export type RGB = [number, number, number];
export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const A4_LANDSCAPE = { w: 842, h: 595 };
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/[\\()]/g, (c) => `\\${c}`);

export class Page {
  readonly w = A4_LANDSCAPE.w;
  readonly h = A4_LANDSCAPE.h;
  ops: string[] = [];
  /** y is measured from the top, as on screen. */
  private Y = (y: number) => this.h - y;
  fill(c: RGB) {
    this.ops.push(`${c.map(n).join(" ")} rg`);
    return this;
  }
  stroke(c: RGB, width = 1, dash: number[] = []) {
    this.ops.push(`${c.map(n).join(" ")} RG ${n(width)} w [${dash.join(" ")}] 0 d`);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, mode: "f" | "S" | "B" = "f") {
    this.ops.push(`${n(x)} ${n(this.Y(y + h))} ${n(w)} ${n(h)} re ${mode}`);
    return this;
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    this.ops.push(`${n(x1)} ${n(this.Y(y1))} m ${n(x2)} ${n(this.Y(y2))} l S`);
    return this;
  }
  polyline(pts: [number, number][]) {
    if (pts.length < 2) return this;
    this.ops.push(pts.map(([x, y], i) => `${n(x)} ${n(this.Y(y))} ${i ? "l" : "m"}`).join(" ") + " S");
    return this;
  }
  circle(cx: number, cy: number, r: number, mode: "f" | "S" | "B" = "B") {
    const k = 0.5523 * r;
    const y = this.Y(cy);
    this.ops.push(
      `${n(cx + r)} ${n(y)} m ${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c ${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c ${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c ${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c ${mode}`,
    );
    return this;
  }
  text(x: number, y: number, s: string, size = 10, opts: { bold?: boolean; align?: "left" | "center" | "right" } = {}) {
    // Helvetica is about 0.5 em per character on average: good enough to centre or right-align short labels.
    const w = s.length * size * (opts.bold ? 0.56 : 0.52);
    const left = opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x;
    this.ops.push(`BT /${opts.bold ? "F2" : "F1"} ${n(size)} Tf ${n(left)} ${n(this.Y(y))} Td (${esc(s)}) Tj ET`);
    return this;
  }
}

/** The PDF bytes for these pages. */
export function pdf(pages: Page[]): Uint8Array {
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const kids: string[] = [];
  pages.forEach((p, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const stream = p.ops.join("\n");
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    kids.push(`${pageId} 0 R`);
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
