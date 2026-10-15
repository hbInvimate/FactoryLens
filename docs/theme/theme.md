# FactoryLens AI theme

Taken from the AI platform the app is built on: `platform-home.png` and `platform-content.png`.

- **Look:** a light grey page (`--fl-bg`), white cards and a white left sidebar with 1px dividers (`--fl-border`), near-black text, Inter.
- **Brand:** green. Primary buttons are solid green. The active nav item is pale green (`--fl-primary-soft`) with a thin green border (`--fl-primary-border`). The active tab has a green label and underline. Green text always uses `--fl-primary-ink` for contrast.
- **Stat tiles:** a pastel icon tile (green, blue, amber, violet), a big number and a grey label.
- **States** (strong and meaningful in the check app): amber = a skipped step, red = a wrong action, a stop or a hold, green = correct or complete, blue = in progress.
- **Rules:** colours live only in `tokens.css`. Components use Tailwind names mapped to the tokens (`app/globals.css`) or `var(--fl-...)` in SVG. Touch targets stay at least 56 px. There is no dark theme.

`after/` holds before and after screenshots of the start page, a live check, the deviation view, the hold screen, `/dashboard` and a session report.
