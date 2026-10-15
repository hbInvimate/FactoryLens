// Placeholder camera view: a B-pillar outer on the fixture, with the features of the current step highlighted.
// Illustration only. Nothing here is a measurement.

type Feature = "pads" | "pins" | "clamps" | "holes" | "edge" | "flange" | "part";

const HIGHLIGHT: Record<number, Feature[]> = {
  1: [], 2: ["pads", "pins"], 3: ["pads"], 4: ["pins"], 5: ["clamps"], 6: ["clamps"], 7: ["holes"],
  8: ["holes"], 9: ["edge"], 10: ["flange"], 11: ["part"], 12: ["clamps"],
};

const PILLAR = "M12 8 C20 120 45 190 75 215 L80 488 L178 488 L168 440 L142 300 L135 215 C120 170 80 90 62 6 Z";
const HI = "var(--fl-draw-highlight)";

export function PartDrawing({ step, className }: { step: number; className?: string }) {
  const active = HIGHLIGHT[step] ?? [];
  const on = (f: Feature) => active.includes(f);
  const outline = on("edge") || on("part") ? { stroke: HI, strokeWidth: 4 } : { stroke: "var(--fl-draw-part-dark)", strokeWidth: 2.5 };
  const flange = on("flange") || on("part") ? { stroke: HI, strokeWidth: 3 } : { stroke: "var(--fl-draw-part-dark)", strokeWidth: 2 };
  const ring = (f: Feature, c: string) => (on(f) ? { stroke: HI, strokeWidth: 3 } : { stroke: c, strokeWidth: 1.5 });

  return (
    <svg viewBox="380 300 530 210" role="img" aria-label="Placeholder view of the part on the fixture" className={className}>
      <rect x="380" y="300" width="530" height="210" fill="var(--fl-draw-bg)" />
      <g transform="translate(640,410) rotate(90) translate(-95,-248)">
        <path d={PILLAR} transform="translate(12,0)" fill="var(--fl-draw-part-dark)" />
        <path d={PILLAR} fill="var(--fl-draw-part)" {...outline} />
        <path d={PILLAR} transform="translate(110,0) scale(.62,1) translate(-110,0)" fill="var(--fl-draw-part-light)" {...flange} />
        <path d="M108 235 L119 470 M124 228 L134 440" stroke="var(--fl-draw-part-dark)" strokeWidth="2" fill="none" />
        {[[108, 262], [110, 300], [118, 345], [110, 395]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="var(--fl-draw-hole)" {...ring("holes", "var(--fl-surface)")} />
        ))}
        <circle cx="102" cy="448" r="6" fill="var(--fl-draw-hole)" {...ring("pins", "var(--fl-violet-ink)")} />
        <ellipse cx="97" cy="180" rx="4" ry="9" fill="var(--fl-draw-hole)" {...ring("pins", "var(--fl-violet-ink)")} />
        {[[172, 440], [144, 280], [106, 140]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y - 11} width="9" height="22" fill="var(--fl-blue)" {...(on("pads") ? { stroke: HI, strokeWidth: 2 } : {})} />
        ))}
        {[[160, 455], [150, 400], [140, 340], [130, 285], [124, 230], [100, 175]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="var(--fl-draw-hole)" {...(on("clamps") ? { stroke: HI, strokeWidth: 2 } : {})} />
        ))}
      </g>
    </svg>
  );
}
