// Placeholder camera view: a B-pillar outer on the fixture, with the features of the current step highlighted.
// Illustration only. Nothing here is a measurement.

type Feature = "pads" | "pins" | "clamps" | "holes" | "edge" | "flange" | "part";

const HIGHLIGHT: Record<number, Feature[]> = {
  1: [], 2: ["pads", "pins"], 3: ["pads"], 4: ["pins"], 5: ["clamps"], 6: ["clamps"], 7: ["holes"],
  8: ["holes"], 9: ["edge"], 10: ["flange"], 11: ["part"], 12: ["clamps"],
};

const PILLAR = "M12 8 C20 120 45 190 75 215 L80 488 L178 488 L168 440 L142 300 L135 215 C120 170 80 90 62 6 Z";
const HI = "#FFE08A";

export function PartDrawing({ step, className }: { step: number; className?: string }) {
  const active = HIGHLIGHT[step] ?? [];
  const on = (f: Feature) => active.includes(f);
  const outline = on("edge") || on("part") ? { stroke: HI, strokeWidth: 4 } : { stroke: "#4A5E72", strokeWidth: 2.5 };
  const flange = on("flange") || on("part") ? { stroke: HI, strokeWidth: 3 } : { stroke: "#6F8397", strokeWidth: 2 };
  const ring = (f: Feature, c: string) => (on(f) ? { stroke: HI, strokeWidth: 3 } : { stroke: c, strokeWidth: 1.5 });

  return (
    <svg viewBox="380 300 530 210" role="img" aria-label="Placeholder view of the part on the fixture" className={className}>
      <rect x="380" y="300" width="530" height="210" fill="#0B1114" />
      <g transform="translate(640,410) rotate(90) translate(-95,-248)">
        <path d={PILLAR} transform="translate(12,0)" fill="#4A5E72" />
        <path d={PILLAR} fill="#8FA3B5" {...outline} />
        <path d={PILLAR} transform="translate(110,0) scale(.62,1) translate(-110,0)" fill="#B9C8D6" {...flange} />
        <path d="M108 235 L119 470 M124 228 L134 440" stroke="#6F8397" strokeWidth="2" fill="none" />
        {[[108, 262], [110, 300], [118, 345], [110, 395]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#2B3138" {...ring("holes", "#D85A30")} />
        ))}
        <circle cx="102" cy="448" r="6" fill="#2B3138" {...ring("pins", "#7F77DD")} />
        <ellipse cx="97" cy="180" rx="4" ry="9" fill="#2B3138" {...ring("pins", "#7F77DD")} />
        {[[172, 440], [144, 280], [106, 140]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y - 11} width="9" height="22" fill="#378ADD" {...(on("pads") ? { stroke: HI, strokeWidth: 2 } : {})} />
        ))}
        {[[160, 455], [150, 400], [140, 340], [130, 285], [124, 230], [100, 175]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="#3E4A52" {...(on("clamps") ? { stroke: HI, strokeWidth: 2 } : {})} />
        ))}
      </g>
    </svg>
  );
}
