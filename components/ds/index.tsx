// FactoryLens AI design system, in the AI platform's style (docs/theme). Colours come only from the
// tokens in docs/theme/tokens.css, through the Tailwind names in app/globals.css.
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Button ----------

export type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-on-strong hover:bg-primary-hover hover:border-primary-hover",
  secondary: "border-line-strong bg-surface text-ink hover:bg-surface-2",
  danger: "border-red bg-surface text-red-ink hover:bg-red-soft",
};

/** At least 56 px tall: the check app is used with gloves. */
export function buttonClass(variant: ButtonVariant = "secondary", className?: string) {
  return cx(
    "inline-flex min-h-[56px] min-w-[56px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--fl-radius-md)] border px-5 text-[17px] font-semibold shadow-card transition",
    "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-subtle disabled:shadow-none",
    BUTTON[variant],
    className,
  );
}

export function Button({ variant = "secondary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" {...rest} className={buttonClass(variant, className)} />;
}

export function ButtonLink({ variant = "secondary", className, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; href: string }) {
  return <Link href={href} {...rest} className={buttonClass(variant, className)} />;
}

// ---------- Card ----------

export type Accent = "green" | "amber" | "red" | "blue" | "gray";
const ACCENT: Record<Accent, string> = {
  green: "border-l-primary",
  amber: "border-l-amber",
  red: "border-l-red",
  blue: "border-l-blue",
  gray: "border-l-line-strong",
};

export function Card({ children, className, accent, testId }: { children: ReactNode; className?: string; accent?: Accent; testId?: string }) {
  return (
    <div data-testid={testId} className={cx("print-card rounded-card border border-line bg-surface shadow-card", accent && "border-l-[5px]", accent && ACCENT[accent], className)}>
      {children}
    </div>
  );
}

// ---------- Chip ----------

export type ChipTone = "green" | "amber" | "red" | "blue" | "gray" | "violet" | "teal";
const CHIP: Record<ChipTone, string> = {
  green: "border-primary-line bg-primary-soft text-primary-ink",
  amber: "border-amber-line bg-amber-soft text-amber-ink",
  red: "border-red-line bg-red-soft text-red-ink",
  blue: "border-blue-line bg-blue-soft text-blue-ink",
  gray: "border-line bg-surface-2 text-ink-2",
  violet: "border-line bg-tile-violet text-violet-ink",
  teal: "border-line bg-teal-soft text-teal-ink",
};

export function Chip({ tone = "gray", children, size = "md", className }: { tone?: ChipTone; children: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "px-2.5 py-0.5 text-[13px]", md: "px-3 py-1 text-[15px]", lg: "px-4 py-1 text-[17px]" }[size];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full border font-semibold", s, CHIP[tone], className)}>{children}</span>;
}

// ---------- Input ----------

const FIELD = "min-h-[56px] w-full rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[17px] text-ink placeholder:text-subtle disabled:bg-surface-2 disabled:text-subtle";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(FIELD, className)} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(FIELD, "w-auto pr-8", className)} />;
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-[15px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

// ---------- Tabs ----------

/** Link tabs: the active one has a green label and a green underline. */
export function Tabs({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "-mb-px inline-flex min-h-[48px] items-center border-b-2 px-3 text-[16px] font-medium",
            t.active ? "border-primary text-primary-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// ---------- Table ----------

export function Table({ children, className, testId, minWidth = 760 }: { children: ReactNode; className?: string; testId?: string; minWidth?: number }) {
  return (
    <div className={cx("print-card overflow-x-auto rounded-card border border-line bg-surface shadow-card print:overflow-visible", className)}>
      <table data-testid={testId} className="w-full text-left text-[15px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...rest} className={cx("bg-surface-2 px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-muted", className)} />;
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} className={cx("border-t border-line px-4 py-3 align-top text-ink", className)} />;
}

// ---------- NavItem ----------

/** Sidebar item: the active one is pale green with a thin green border. */
export function NavItem({ href, icon, children, active, onClick }: { href: string; icon?: ReactNode; children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-[52px] items-center gap-3 rounded-[12px] border px-4 text-[16px]",
        active ? "border-primary-line bg-primary-soft font-semibold text-primary-ink" : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

// ---------- StatTile ----------

export type TileTone = "green" | "blue" | "amber" | "violet" | "red";
const TILE: Record<TileTone, string> = {
  green: "bg-tile-green text-primary-ink",
  blue: "bg-tile-blue text-blue-ink",
  amber: "bg-tile-amber text-amber-ink",
  violet: "bg-tile-violet text-violet-ink",
  red: "bg-red-soft text-red-ink",
};

/** A pastel icon tile, a big number and a grey label. */
export function StatTile({
  icon, tone = "green", value, label, sub, testId, valueTone,
}: {
  icon: ReactNode;
  tone?: TileTone;
  value: ReactNode;
  label: string;
  sub?: ReactNode;
  testId?: string;
  valueTone?: "green" | "amber" | "red";
}) {
  const v = valueTone ? { green: "text-primary-ink", amber: "text-amber-ink", red: "text-red-ink" }[valueTone] : "text-ink";
  return (
    <Card className="flex min-w-0 items-start gap-3 px-4 py-4">
      <span className={cx("flex size-11 flex-none items-center justify-center rounded-[12px]", TILE[tone])}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className={cx("text-[28px] font-bold leading-tight", v)} data-testid={testId}>
          {value}
        </span>
        <span className="text-[14px] text-ink-2">{label}</span>
        {sub !== undefined && <span className="text-[13px] text-muted">{sub}</span>}
      </span>
    </Card>
  );
}

// ---------- Avatar and UserCard ----------

export function Avatar({ name, tone = "green", size = 36 }: { name: string; tone?: "green" | "pink" | "blue"; size?: number }) {
  const initials = name.split(/[\s(]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const bg = { green: "bg-primary", pink: "bg-pink", blue: "bg-blue" }[tone];
  return (
    <span aria-hidden className={cx("relative flex flex-none items-center justify-center rounded-full text-[13px] font-bold text-on-strong", bg)} style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

export function UserCard({ name, role, action }: { name: string; role: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-3 py-3 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink" title={name}>
            {name}
          </span>
          <span className="truncate text-[13px] text-primary-ink">{role}</span>
        </span>
      </div>
      {action}
    </div>
  );
}

// ---------- StateBanner ----------

export type StateTone = "green" | "amber" | "red" | "blue" | "gray";
const STATE: Record<StateTone, string> = {
  green: "border-primary-line bg-primary-soft text-primary-ink",
  amber: "border-amber-line bg-amber-soft text-amber-ink",
  red: "border-red-line bg-red-soft text-red-ink",
  blue: "border-blue-line bg-blue-soft text-blue-ink",
  gray: "border-line bg-surface-2 text-ink-2",
};

/** A light banner that says what state something is in. The words carry the meaning; colour only supports it. */
export function StateBanner({ tone, title, children, testId, role = "status", className }: { tone: StateTone; title?: ReactNode; children?: ReactNode; testId?: string; role?: "status" | "alert"; className?: string }) {
  return (
    <div role={role} data-testid={testId} className={cx("print-card rounded-card border px-5 py-3", STATE[tone], className)}>
      {title && <span className="text-[18px] font-semibold">{title}</span>}
      {title && children ? <span className="text-[15px]"> · </span> : null}
      {children && <span className="text-[15px]">{children}</span>}
    </div>
  );
}
