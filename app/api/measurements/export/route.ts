import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { MEASUREMENT_UNIT, PLANT_TIME_ZONE } from "@/lib/config";
import { RANGES } from "@/lib/dashboard/metrics";
import { chartStats, exportName, fmt3, fmtCpk, lastReadings, parseReadings } from "@/lib/measure-chart";
import { POINT_GROUPS, judge, toleranceOf, type Judgement } from "@/lib/measure-judge";
import { dashView } from "@/lib/server/dashView";
import { errorResponse } from "@/lib/server/http";
import { allMeasurements, parseMeasurementParams, toCsv, wideMeasurements } from "@/lib/server/measurements";
import { Page, hex, pdf } from "@/lib/server/pdf";
import { zip } from "@/lib/server/zip";

// Platform colours only.
const C = {
  primary: hex("#10b981"),
  primaryInk: hex("#047857"),
  soft: hex("#ecfdf5"),
  line: hex("#a7f3d0"),
  amber: hex("#f59e0b"),
  red: hex("#dc2626"),
  ink: hex("#1f2937"),
  muted: hex("#6b7280"),
  grid: hex("#e5e7eb"),
  page: hex("#f9fafb"),
  white: hex("#ffffff"),
};
const TONE: Record<Judgement, typeof C.primary> = { in: C.primary, near: C.amber, out: C.red };
const WORD: Record<Judgement, string> = { in: "in tolerance", near: "near limit", out: "out of tolerance" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: PLANT_TIME_ZONE });
const dayOnly = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: PLANT_TIME_ZONE });

/**
 * Export from /dashboard/measurements: ?format=csv (one row per reading, current filters), pdf (the selected point's
 * control chart and its readings, A4 landscape) or zip (both). Quality Engineer or admin only. Real checks only.
 */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  try {
    const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
    const { f, params } = await dashView({ ...sp, sample: "0" });
    const m = parseMeasurementParams(sp);
    const group = POINT_GROUPS.find((g) => g.id === sp.group) ?? POINT_GROUPS[0];
    const point = (group.points as readonly string[]).includes(sp.point) ? sp.point : group.points[0];
    const n = parseReadings(sp.n);
    const date = new Date().toISOString().slice(0, 10);
    const name = exportName(params.station, point, date);
    const format = sp.format === "pdf" || sp.format === "zip" ? sp.format : "csv";

    const csv = async () => new TextEncoder().encode(toCsv(await allMeasurements({ f: { ...f, includeSample: false }, step: m.step, source: m.source, sort: m.sort, dir: m.dir })));
    const chart = async () => {
      const { rows } = await wideMeasurements(f, m.source);
      const series = lastReadings(
        [...(rows ?? [])].reverse().flatMap((r) => (r.cells[point] ? [{ value: r.cells[point].latest, at: r.cells[point].at }] : [])),
        n,
      );
      const range = RANGES.find((r) => r.id === params.range)?.label ?? params.range;
      return chartPdf({ point, station: params.station, range, shift: params.shift ? `Shift ${params.shift}` : "All shifts", n: n === "all" ? "all" : `last ${n}`, series });
    };
    const send = (body: Uint8Array, type: string, file: string) =>
      new Response(body as BodyInit, { headers: { "content-type": type, "content-disposition": `attachment; filename="${file}"` } });

    if (format === "csv") return send(await csv(), "text/csv; charset=utf-8", `${name}.csv`);
    if (format === "pdf") return send(await chart(), "application/pdf", `${name}.pdf`);
    const [a, b] = await Promise.all([csv(), chart()]);
    return send(zip([{ name: `${name}.csv`, data: a }, { name: `${name}.pdf`, data: b }]), "application/zip", `${name}.zip`);
  } catch (e) {
    return errorResponse(e);
  }
}

function chartPdf(o: { point: string; station: string; range: string; shift: string; n: string; series: { value: number; at: string }[] }): Uint8Array {
  const { point, series } = o;
  const t = toleranceOf(point);
  const st = chartStats(point, series.map((s) => s.value));
  const first = new Page();
  const pages = [first];
  const p = first;

  // Title.
  p.fill(C.ink).text(40, 48, `${point} · control chart`, 20, { bold: true });
  p.fill(C.muted).text(40, 66, `${o.station} · ${o.range}${series.length ? ` (${dayOnly(series[0].at)} to ${dayOnly(series[series.length - 1].at)})` : ""} · ${o.shift} · ${o.n} readings`, 10);
  if (t) p.text(40, 80, `Tolerance ${t.nominal.toFixed(2)} ± ${t.tol} ${MEASUREMENT_UNIT} (SOP)`, 10);
  p.fill(C.primaryInk).text(802, 48, "FactoryLens AI", 11, { bold: true, align: "right" });
  p.fill(C.muted).text(802, 64, `Exported ${when(new Date().toISOString())}`, 9, { align: "right" });

  // Chart.
  const L = 70;
  const R = 640;
  const T = 100;
  const B = 360;
  const vals = series.map((s) => s.value);
  const pad = t ? t.tol * 0.6 : 0.05;
  const lo = Math.min(...vals, t ? t.nominal - t.tol - pad : Infinity);
  const hi = Math.max(...vals, t ? t.nominal + t.tol + pad : -Infinity);
  const x = (i: number) => (series.length <= 1 ? (L + R) / 2 : L + (i * (R - L)) / (series.length - 1));
  const y = (v: number) => T + (B - T) * (1 - (v - lo) / (hi - lo || 1));
  p.stroke(C.grid, 0.8).rect(L - 10, T - 10, R - L + 20, B - T + 20, "S");
  if (t) {
    p.fill(C.soft).rect(L - 10, y(t.nominal + t.tol), R - L + 20, y(t.nominal - t.tol) - y(t.nominal + t.tol));
    for (const [v, label, c, dash] of [
      [t.nominal + t.tol, "USL", C.red, [4, 3]],
      [t.nominal, "NOM", C.primary, []],
      [t.nominal - t.tol, "LSL", C.red, [4, 3]],
    ] as const) {
      p.stroke(c, 1, [...dash]).line(L - 10, y(v), R + 10, y(v));
      p.fill(c).text(R + 16, y(v) + 3, label, 9, { bold: true });
      p.fill(C.muted).text(L - 16, y(v) + 3, v.toFixed(2), 8, { align: "right" });
    }
  }
  if (!series.length) p.fill(C.muted).text((L + R) / 2, (T + B) / 2, `No readings for ${point} in this view.`, 12, { align: "center" });
  p.stroke(C.muted, 1).polyline(series.map((s, i) => [x(i), y(s.value)]));
  const many = series.length > 25;
  const every = Math.max(1, Math.ceil(series.length / 8));
  series.forEach((s, i) => {
    const j = judge(point, s.value) ?? "in";
    const last = i === series.length - 1;
    p.fill(C.white).stroke(TONE[j], many ? 1 : 1.5).circle(x(i), y(s.value), many ? (j === "in" ? 1.8 : 2.6) : 3.5);
    if (!many || last || j === "out") p.fill(TONE[j]).text(x(i), y(s.value) + (j === "out" || (t && s.value < t.nominal) ? 13 : -6), s.value.toFixed(2), 8, { bold: true, align: "center" });
    if (i % every === 0 || last) p.fill(C.muted).text(x(i), B + 24, dayOnly(s.at), 8, { align: "center" });
  });

  // Numbers.
  p.fill(C.page).stroke(C.grid, 0.8).rect(680, T - 10, 122, 190, "B");
  [
    ["n", String(st.n)],
    ["Mean", fmt3(st.mean)],
    ["Min", fmt3(st.min)],
    ["Max", fmt3(st.max)],
    ["Cpk", fmtCpk(st.cpk)],
  ].forEach(([k, v], i) => {
    p.fill(C.muted).text(694, T + 12 + i * 36, k, 9);
    p.fill(k === "Cpk" && st.cpk !== null ? (st.cpk < 1 ? C.red : st.cpk < 1.33 ? C.amber : C.primaryInk) : C.ink).text(694, T + 28 + i * 36, v, 14, { bold: true });
  });

  // Readings, newest first, in three columns; more pages as needed.
  const rows = [...series].reverse();
  let page = p;
  let top = 410;
  let perCol = Math.floor((560 - top) / 14);
  let i = 0;
  const header = (pg: Page, y0: number) => {
    pg.fill(C.ink).text(40, y0 - 14, "Readings, newest first", 11, { bold: true });
    for (let c = 0; c < 3; c++) {
      const x0 = 40 + c * 260;
      pg.fill(C.muted).text(x0, y0, "#", 8, { bold: true }).text(x0 + 24, y0, "Recorded", 8, { bold: true }).text(x0 + 130, y0, `Value (${MEASUREMENT_UNIT})`, 8, { bold: true }).text(x0 + 190, y0, "Status", 8, { bold: true });
    }
  };
  header(page, top);
  while (i < rows.length) {
    for (let c = 0; c < 3 && i < rows.length; c++) {
      for (let r = 0; r < perCol && i < rows.length; r++, i++) {
        const s = rows[i];
        const j = judge(point, s.value) ?? "in";
        const x0 = 40 + c * 260;
        const y0 = top + 14 + r * 14;
        page.fill(C.muted).text(x0, y0, String(i + 1), 8);
        page.fill(C.ink).text(x0 + 24, y0, when(s.at), 8);
        page.fill(TONE[j]).text(x0 + 130, y0, s.value.toFixed(3), 8, { bold: true });
        page.fill(C.muted).text(x0 + 190, y0, WORD[j], 8);
      }
    }
    if (i < rows.length) {
      page = new Page();
      pages.push(page);
      page.fill(C.ink).text(40, 40, `${point} · control chart (continued)`, 12, { bold: true });
      top = 72;
      perCol = Math.floor((560 - top) / 14);
      header(page, top);
    }
  }
  pages.forEach((pg, k) => pg.fill(C.muted).text(802, 580, `${o.station} · ${point} · page ${k + 1} of ${pages.length}`, 8, { align: "right" }));
  return pdf(pages);
}
