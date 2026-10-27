# memory.md

## 1. Current Project State & Architecture
- Product: GPU VM customer control panel (MVP), Bangladesh focus. Static SPA, no build step. Open `index.html` directly.
- Libraries (vendored in `vendor/`): `echarts.min.js` (Apache ECharts 5), `motion.js` (Motion 12 UMD, global `Motion`), `bgd.js` (Bangladesh GeoJSON as `window.BGD_GEO`).
- `index.html`: shell (sidebar nav with SVG icons + sliding indicator, header, modal, drawer, toasts).
- `styles.css`: light/dark tokens (validated dataviz palette slots s1-s8), dark navy sidebar, flat cards, VM cards, ring gauges, modals.
- `app.js` (IIFE):
  - Catalog `GPUS`: RTX PRO 6000 Blackwell Server Edition (96GB, available), H100 80GB (available), H200/A100/L40S (`status:'soon'`, disabled in the wizard). To enable a GPU: set `status:'available'` and add `cap`/`used` per zone.
  - `ZONES`: Dhaka (Tejgaon), Gazipur (Bangladesh Hi-Tech Park, Kaliakair), Jashore (Jashore Software Technology Park). Each has cap/used per GPU, latency, tier, PUE. `freeGpus(zone,gpu)` = cap - used by others - your VMs.
  - Currency BDT (`money`, `moneyR`, `kfmt`); prepaid wallet (`S.wallet`) is debited live in `tick()`. Payment methods: bKash, Nagad, Rocket, Card, Bank.
  - State `S` in localStorage key `gpuvm-console-v2`: vms, snapshots, keys, rules, daily, wallet, invoices, payments, events, theme.
  - Views: overview (5 KPIs, util line, gauge, power, daily spend, BD zone map, spend split, table), instances (VM cards), zones (map, latency, zone cards, capacity stack), monitoring, storage, network (firewall), keys, billing (wallet, add funds, invoices, payments), activity (audit log).
  - Motion usage (restrained, enterprise): short fade/translate `enter()` on view change (8px, 250ms), `setNum` count-ups, `setBar`, sliding nav/tab indicators (no bounce), drawer/modal/toast 200ms ease-out, 0.98 press feedback only (no hover scaling). `prefers-reduced-motion` respected.
  - Live refresh: `tick()` every 2s calls `refresh(false)`. `paint()` skips re-render while hovered or unchanged; `mount(..., key)` memoizes charts (map ripple).
  - Dev hook: URL hash `#view,theme` (e.g. `#zones,light`, `#drawer,dark`) opens a view/theme directly.

## 2. Completed Tasks & Recent Changes
- v1: initial ECharts panel (index.html, styles.css, app.js).
- v2 (Motion UI): full CSS redesign, vendored Motion, animations listed above, VM card grid, gauge + sparklines, drawer tabs.
- v3 (Bangladesh MVP): zones + map, RTX PRO 6000 SE / H100 catalog with ready-to-enable GPUs, BDT pricing, wallet/top-up/invoices/payments, activity log, capacity-aware launch wizard (zone cards, sold-out handling, wallet check).
- v4 (enterprise restyle): removed gradients, glow, blur, ping animations, bouncy springs, colored icon chips and pill shapes. Now: fixed dark navy sidebar, flat accent colour, 6-8px radii, uppercase KPI labels, dense tables with shaded header row, squared badges, straight (non-smoothed) chart lines, square gauge/bar ends. Files: styles.css (rewritten), app.js (motion/chart tweaks), index.html (chip text).
- Verified with headless Edge via CDP (`scratchpad/shot.mjs`): overview, instances, zones, billing, launch wizard render without console errors.

- Git: pushed to private repo https://github.com/lufi4s/gpuvm-control-panel (branch main). `.gitignore` excludes `.claude/` and `.mcp.json`. Repo-local git identity set to lufi4s / saiful.ops@zenexcloud.com.

- Git: canonical repo is https://github.com/lufi4s/gpuvm-control-panel (public, main). Duplicate repo gpuvm-control-panel-full is to be deleted (needs gh delete_repo scope). .claude/ and .mcp.json are intentionally not committed.

## 3. Pending / Next Tasks & Known Issues
- All data is mocked client-side. Replace `seed()`, `vmAction()`, wizard submit, `addFundsDialog`, `tick()` with real backend APIs (auth, VM lifecycle, metrics, billing, payment gateways).
- Zone capacity/prices are placeholders; confirm real GPU prices, DC names and addresses.
- `bgd.js` outline is coarse (36 points); swap in a higher-resolution GeoJSON if needed.
- Demo billing months history (invoices/monthly bars) is not consistent with current month spend.
- Not yet visually checked: Monitoring, Snapshots, Firewall, SSH Keys, Activity, drawer in light theme, mobile layout.
- Ideas: login/org/team roles, API keys, alerts/budgets, resize instance, volumes attach/detach, web console, support tickets, Bangla language toggle (currently English only).

## 4. Context for Resume
- User writes Banglish. AGENTS.md requires: read/update this file every task, surgical edits, final output exactly `Done ✨`.
- Palette rules: fixed categorical order, text uses text tokens, one axis per chart, thin marks.
