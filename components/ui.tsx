// Shared pieces of the check app screens. Colours come from the tokens (docs/theme/tokens.css).
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type Tone = "blue" | "amber" | "red" | "green";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- icons ----------

export function Tick({ size = 28, tone = "green" }: { size?: number; tone?: "green" | "amber" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="13" fill={tone === "green" ? "var(--fl-primary)" : "var(--fl-amber)"} />
      <path d="M8 14.5 l4 4 l8 -9" fill="none" stroke="var(--fl-on-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({ n, size = 28, active = false }: { n?: number | string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="12" fill="none" stroke={active ? "var(--fl-blue)" : "var(--fl-border-strong)"} strokeWidth="2" />
      {n !== undefined && (
        <text x="14" y="18.5" textAnchor="middle" fontSize={String(n).length > 1 ? 12 : 14} fontWeight="500" fill={active ? "var(--fl-blue-ink)" : "var(--fl-text-muted)"}>
          {n}
        </text>
      )}
    </svg>
  );
}

export function Current({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="12" fill="none" stroke="var(--fl-blue)" strokeWidth="2.5" />
      <circle cx="14" cy="14" r="5" fill="var(--fl-blue)" />
    </svg>
  );
}

export function Warn({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="13" fill="var(--fl-amber)" />
      <path d="M14 7 v9 M14 19.5 v1.5" stroke="var(--fl-on-amber)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Cross({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="12" fill="var(--fl-red-soft)" stroke="var(--fl-red)" strokeWidth="2.5" />
      <path d="M10 10 L18 18 M18 10 L10 18" stroke="var(--fl-red)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Speaker({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="flex-none">
      <path d="M8 18 h8 l12 -10 v28 l-12 -10 h-8 z" fill="none" stroke="var(--fl-primary)" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M33 16 q6 6 0 12" fill="none" stroke="var(--fl-primary)" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Bars({ live = true }: { live?: boolean }) {
  return (
    <svg width="40" height="30" viewBox="0 0 40 30" aria-hidden className="flex-none">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          className={live ? "eq-bar" : undefined}
          style={live ? { animationDelay: `${i * 0.15}s` } : undefined}
          x={2 + 8 * i} y="4" width="4" height="22" rx="2" fill="var(--fl-primary)"
        />
      ))}
    </svg>
  );
}

export function TabletIcon() {
  return (
    <svg width="26" height="34" viewBox="0 0 30 38" aria-hidden className="flex-none">
      <rect x="3" y="3" width="24" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 29 h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Dot({ color }: { color: "green" | "red" | "amber" | "gray" | "blue" }) {
  const c = { green: "bg-primary", red: "bg-red", amber: "bg-amber", gray: "bg-muted", blue: "bg-blue" }[color];
  return <span aria-hidden className={cx("inline-block size-2.5 flex-none rounded-full", c)} />;
}

// ---------- chips and buttons ----------

const CHIP: Record<string, string> = {
  green: "bg-primary-soft text-primary-ink",
  amber: "bg-amber-soft text-amber-ink",
  red: "bg-red-soft text-red-ink",
  blue: "bg-blue-soft text-blue-ink",
  gray: "bg-surface-3 text-ink-2",
  violet: "bg-tile-violet text-violet-ink",
  teal: "bg-teal-soft text-teal-ink",
};

export function Chip({ tone = "gray", children, small = false }: { tone?: keyof typeof CHIP; children: ReactNode; small?: boolean }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full font-medium", small ? "px-3 py-0.5 text-sm" : "px-4 py-1 text-[17px]", CHIP[tone])}>
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-primary text-on-strong border-primary hover:bg-primary-hover",
  success: "bg-primary text-on-strong border-primary hover:bg-primary-hover",
  danger: "bg-surface text-red-ink border-red hover:bg-red-soft",
  ghost: "bg-surface text-ink border-line-strong hover:bg-surface-2",
  amber: "bg-amber-soft text-amber-ink border-amber hover:bg-tile-amber",
};

export function Btn({
  variant = "ghost",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--fl-radius-md)] border px-6 text-[20px] font-semibold shadow-card transition disabled:cursor-not-allowed disabled:opacity-40",
        BTN[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------- panels and stats ----------

export function Panel({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-2.5 rounded-card border border-line bg-surface px-5 py-4 shadow-card", className)}>
      {title && <h2 className="text-[20px] font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "green" | "amber" | "red" }) {
  const c = tone ? { green: "text-primary-ink", amber: "text-amber-ink", red: "text-red-ink" }[tone] : "text-ink";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface px-[18px] py-3.5 shadow-card">
      <span className="text-[15px] text-muted">{label}</span>
      <span className={cx("text-[40px] font-semibold leading-[1.1]", c)}>{value}</span>
      {sub !== undefined && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "green" | "amber" | "red" }) {
  const c = tone ? { green: "text-primary-ink", amber: "text-amber-ink", red: "text-red-ink" }[tone] : "text-ink";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-card border border-line bg-surface px-[18px] py-3 shadow-card">
      <span className="text-sm text-muted">{label}</span>
      <span className={cx("truncate text-[30px] font-semibold", c)}>{value}</span>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-[7px] text-[18px]">
      <span className="text-muted">{k}</span>
      <span className="text-right text-ink">{v}</span>
    </div>
  );
}

// ---------- banners and frames ----------

const BANNER: Record<Tone, { bg: string; ink: string; chip: string; ring: string }> = {
  blue: { bg: "bg-blue", ink: "text-on-strong", chip: "bg-surface text-blue-ink", ring: "shadow-[inset_0_0_0_10px_var(--fl-blue)]" },
  amber: { bg: "bg-amber", ink: "text-on-amber", chip: "bg-surface text-amber-ink", ring: "shadow-[inset_0_0_0_12px_var(--fl-amber)]" },
  red: { bg: "bg-red", ink: "text-on-strong", chip: "bg-surface text-red-ink", ring: "shadow-[inset_0_0_0_12px_var(--fl-red)]" },
  green: { bg: "bg-primary", ink: "text-on-strong", chip: "bg-surface text-primary-ink", ring: "shadow-[inset_0_0_0_10px_var(--fl-primary)]" },
};

export function Banner({ tone, title, sub, chip }: { tone: Tone; title: ReactNode; sub?: ReactNode; chip?: ReactNode }) {
  const t = BANNER[tone];
  return (
    <div role="status" className={cx("flex min-h-[84px] flex-none flex-wrap items-center gap-x-7 gap-y-1 px-8 py-2", t.bg)}>
      <h1 className={cx("text-[38px] font-semibold leading-tight", t.ink)}>{title}</h1>
      {sub && <span className={cx("text-[26px]", t.ink)}>{sub}</span>}
      <span className="flex-1" />
      {chip && <span className={cx("rounded-full px-[18px] py-1.5 text-[20px] font-semibold", t.chip)}>{chip}</span>}
    </div>
  );
}

/** The coloured frame around the whole screen during a deviation, lodge or hold. */
export function Frame({ tone }: { tone: Tone }) {
  return <div aria-hidden className={cx("pointer-events-none fixed inset-0 z-40", BANNER[tone].ring)} />;
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="truncate text-[17px] font-medium text-ink">{value}</span>
    </div>
  );
}

/** A full-screen message: loading, not found, could not load. */
export function PageCenter({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <Logo />
      <h1 className="text-[34px] font-semibold">{title}</h1>
      {body && <p className="max-w-[640px] text-[19px] text-ink-2">{body}</p>}
      {children}
    </div>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span aria-hidden className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-on-strong">FL</span>
      <span className="text-[20px] font-bold text-ink">FactoryLens AI</span>
    </span>
  );
}

export { cx };
