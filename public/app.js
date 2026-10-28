/* Betopia AI Cloud - customer control center (ECharts). Account state persists in localStorage until the API is wired. */
(() => {
const GPUS = {
  rtxpro6000: { name: 'NVIDIA RTX PRO 6000 Blackwell Server Edition', short: 'RTX PRO 6000 SE', arch: 'Blackwell', mem: 96, vcpu: 16, ram: 192, price: 190, tdp: 600, tag: 'Best value', status: 'available' },
  h100: { name: 'NVIDIA H100 80GB SXM', short: 'H100 80GB', arch: 'Hopper', mem: 80, vcpu: 20, ram: 256, price: 320, tdp: 700, tag: 'Fastest', status: 'available' },
  // Catalog is data-driven: flip status to 'available' and add zone capacity to enable more GPUs.
  h200: { name: 'NVIDIA H200 141GB SXM', short: 'H200 141GB', arch: 'Hopper', mem: 141, vcpu: 24, ram: 384, price: 440, tdp: 700, tag: 'Coming soon', status: 'soon' },
  a100: { name: 'NVIDIA A100 80GB', short: 'A100 80GB', arch: 'Ampere', mem: 80, vcpu: 12, ram: 128, price: 210, tdp: 400, tag: 'Coming soon', status: 'soon' },
  l40s: { name: 'NVIDIA L40S 48GB', short: 'L40S 48GB', arch: 'Ada', mem: 48, vcpu: 8, ram: 96, price: 120, tdp: 350, tag: 'Coming soon', status: 'soon' },
};
// Bangladesh data-centre zones. cap = total GPUs installed, used = GPUs already allocated to other customers.
const ZONES = {
  dhaka: { name: 'Dhaka', site: 'Dhaka Metro DC · Tejgaon', park: 'Capital metro, BDIX peering', lat: 23.81, lng: 90.41, ping: 2, tier: 'Tier III', pue: 1.45, cap: { rtxpro6000: 32, h100: 40 }, used: { rtxpro6000: 19, h100: 29 } },
  gazipur: { name: 'Gazipur', site: 'Bangladesh Hi-Tech Park · Kaliakair', park: 'Bangladesh Hi-Tech Park Authority', lat: 24.07, lng: 90.22, ping: 4, tier: 'Tier III', pue: 1.30, cap: { rtxpro6000: 96, h100: 128 }, used: { rtxpro6000: 52, h100: 87 } },
  jashore: { name: 'Jashore', site: 'Jashore Software Technology Park', park: 'Jashore STP · Bangladesh Hi-Tech Park Authority', lat: 23.17, lng: 89.21, ping: 9, tier: 'Tier III', pue: 1.35, cap: { rtxpro6000: 24, h100: 16 }, used: { rtxpro6000: 9, h100: 12 } },
};
const ZONE_IDS = Object.keys(ZONES);
const PAY = ['bKash', 'Nagad', 'Rocket', 'Visa / Mastercard', 'Bank transfer'];
const IMAGES = ['Ubuntu 22.04 + CUDA 12.4', 'Ubuntu 22.04 + PyTorch 2.4', 'Ubuntu 24.04 + TensorFlow 2.17', 'Debian 12 + CUDA 12.4', 'Ubuntu 22.04 (bare)'];
const KEY = 'gpuvm-console-v2';
const $ = (s, r = document) => r.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const money = n => '৳' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyR = n => money(n).replace(/\.\d\d$/, '');
const kfmt = v => '৳' + (Math.abs(v) >= 1e5 ? +(v / 1e5).toFixed(1) + 'L' : Math.abs(v) >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : v);
const freeGpus = (z, g) => ZONES[z].cap[g] - ZONES[z].used[g] - S.vms.filter(v => v.status !== 'terminated' && v.region === z && v.gpu === g).reduce((a, v) => a + v.gpuCount, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 8);
const ip = () => `103.${Math.floor(rnd(100, 250))}.${Math.floor(rnd(1, 254))}.${Math.floor(rnd(2, 254))}`;

/* ---------- state ---------- */
function seed() {
  const mk = (name, gpu, n, region, status, accrued, load) => ({
    id: 'vm-' + uid(), name, gpu, gpuCount: n, region, status, image: IMAGES[1], disk: 500,
    ip: status === 'running' ? ip() : '-', created: Date.now() - rnd(2, 40) * 864e5, accrued, load, hist: null,
  });
  return {
    vms: [
      mk('llm-train-01', 'h100', 8, 'gazipur', 'running', 1184200.5, 0.92),
      mk('finetune-h100', 'h100', 4, 'dhaka', 'running', 392440.2, 0.74),
      mk('render-farm', 'rtxpro6000', 4, 'gazipur', 'running', 168702.7, 0.58),
      mk('inference-api', 'rtxpro6000', 2, 'jashore', 'running', 74188.4, 0.41),
      mk('dev-sandbox', 'rtxpro6000', 1, 'dhaka', 'stopped', 9936.9, 0),
    ],
    snapshots: [
      { id: 'snap-' + uid(), name: 'llm-train-01-ckpt', vm: 'llm-train-01', size: 420, created: Date.now() - 3 * 864e5 },
      { id: 'snap-' + uid(), name: 'dev-baseline', vm: 'dev-sandbox', size: 38, created: Date.now() - 12 * 864e5 },
    ],
    keys: [{ id: 'key-' + uid(), name: 'my-laptop', fp: 'SHA256:3f:9a:1c:7d:e2:55:b0:42' }],
    rules: [
      { id: 'r' + uid(), proto: 'TCP', port: '22', source: '0.0.0.0/0', note: 'SSH' },
      { id: 'r' + uid(), proto: 'TCP', port: '8888', source: '0.0.0.0/0', note: 'Jupyter' },
      { id: 'r' + uid(), proto: 'TCP', port: '443', source: '0.0.0.0/0', note: 'HTTPS API' },
    ],
    daily: Array.from({ length: 30 }, (_, i) => +(rnd(62000, 84000) + i * 900).toFixed(2)),
    wallet: 420000,
    invoices: [['INV-2026-05', 412000, 'Paid'], ['INV-2026-06', 538000, 'Paid'], ['INV-2026-07', 655000, 'Paid'], ['INV-2026-08', 781000, 'Paid'], ['INV-2026-09', 902000, 'Paid']].map(([n, a, st], i) => ({ id: n, amount: a, status: st, date: Date.now() - (150 - i * 30) * 864e5 })),
    payments: [{ id: 'PAY-' + uid(), method: 'bKash', amount: 500000, date: Date.now() - 9 * 864e5 }, { id: 'PAY-' + uid(), method: 'Bank transfer', amount: 1000000, date: Date.now() - 34 * 864e5 }],
    events: [{ t: Date.now() - 36e5, kind: 'info', msg: 'Account active · Pro plan · Bangladesh zones' }, { t: Date.now() - 5 * 864e5, kind: 'ok', msg: 'llm-train-01 started in Gazipur' }],
    theme: 'dark',
  };
}
let S = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
const save = () => localStorage.setItem(KEY, JSON.stringify(S, (k, v) => (k === 'hist' ? undefined : v)));
const hist = vm => vm.hist || (vm.hist = initHist(vm));
function initHist(vm) {
  const h = { t: [], util: [], mem: [], temp: [], power: [], netIn: [], netOut: [] };
  for (let i = 0; i < 60; i++) push(vm, h, Date.now() - (60 - i) * 2000);
  return h;
}
function push(vm, h, t) {
  const on = vm.status === 'running', g = GPUS[vm.gpu], L = on ? vm.load : 0;
  const util = on ? clamp(L * 100 + rnd(-8, 8), 2, 100) : 0;
  const lim = h.util.length >= 60;
  const add = (k, v) => { h[k].push(+v.toFixed(1)); if (lim) h[k].shift(); };
  add('t', 0); h.t[h.t.length - 1] = t;
  add('util', util);
  add('mem', on ? clamp(L * g.mem * 0.95 + rnd(-2, 2), 0.5, g.mem) : 0);
  add('temp', on ? 32 + util * 0.5 + rnd(-1.5, 1.5) : 26);
  add('power', on ? (60 + (g.tdp - 60) * util / 100 + rnd(-10, 10)) * vm.gpuCount : 0);
  add('netIn', on ? rnd(20, 400) * L : 0);
  add('netOut', on ? rnd(10, 250) * L : 0);
}
const rate = vm => GPUS[vm.gpu].price * vm.gpuCount;
const running = () => S.vms.filter(v => v.status === 'running');
const live = () => S.vms.filter(v => v.status !== 'terminated');
const fmtTime = t => new Date(t).toLocaleTimeString([], { hour12: false });
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- motion helpers ---------- */
const { animate, stagger } = Motion;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 };
const dur = d => (reduce ? 0 : d);
// Staggered entrance for cards / rows inside a container (view change only, never on live refresh)
function enter(root) {
  if (reduce) return;
  const cards = root.querySelectorAll('.card, .vm');
  if (cards.length) animate(cards, { opacity: [0, 1], y: [8, 0] }, { duration: 0.25, ease: 'easeOut', delay: stagger(0.03) });
  const rows = root.querySelectorAll('tbody tr');
  if (rows.length) animate(rows, { opacity: [0, 1] }, { duration: 0.25, ease: 'easeOut', delay: stagger(0.015, { startDelay: 0.1 }) });
}
// Count a number up/down smoothly from whatever is currently displayed
function setNum(id, to, fmt = v => Math.round(v)) {
  const el = typeof id === 'string' ? document.getElementById(id) : id; if (!el) return;
  const from = el._v ?? 0;
  if (from === to) { el.textContent = fmt(to); return; }
  el._v = to;
  if (el._a) el._a.stop();
  el._a = animate(from, to, { duration: dur(from === 0 ? 0.6 : 0.4), ease: 'easeOut', onUpdate: v => { el.textContent = fmt(v); } });
}
function setBar(id, pct) { const el = document.getElementById(id); if (el) animate(el, { width: clamp(pct, 0, 100) + '%' }, { duration: dur(0.7), ease: 'easeOut' }); }

/* ---------- UI helpers ---------- */
function toast(msg) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('#toasts').append(d);
  animate(d, { opacity: [0, 1], x: [16, 0] }, { duration: dur(0.2), ease: 'easeOut' });
  setTimeout(() => animate(d, { opacity: 0, x: 32 }, { duration: dur(0.25) }).finished.then(() => d.remove()), 3000);
}
function openModal(html) {
  const m = $('#modal'), was = m.classList.contains('hidden');
  m.innerHTML = `<div class="dialog">${html}</div>`; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  if (was) { animate(m, { opacity: [0, 1] }, { duration: dur(0.2) }); animate(m.firstChild, { opacity: [0, 1], y: [8, 0] }, { duration: dur(0.2), ease: 'easeOut' }); }
}
function closeModal() {
  const m = $('#modal'); if (m.classList.contains('hidden')) return;
  animate(m, { opacity: 0 }, { duration: dur(0.18) }).finished.then(() => m.classList.add('hidden'));
}
let drawerVm = null, drawerTab = 'metrics', tabX = null;
function closeDrawer() {
  const d = $('#drawer'); drawerVm = null; tabX = null; disposeGroup('drawer');
  if (d.classList.contains('hidden')) return;
  animate(d.firstChild, { x: 40, opacity: 0 }, { duration: dur(0.18), ease: 'easeIn' });
  animate(d, { opacity: 0 }, { duration: dur(0.22) }).finished.then(() => { if (!drawerVm) d.classList.add('hidden'); });
}

/* ---------- charts ---------- */
const charts = {};
function disposeGroup(g) { for (const k of Object.keys(charts)) if (charts[k].g === g) { charts[k].c.dispose(); delete charts[k]; } }
function mount(id, group, opt, key) {
  const el = document.getElementById(id); if (!el) return;
  if (charts[id] && charts[id].c.getDom() !== el) { charts[id].c.dispose(); delete charts[id]; }
  if (!charts[id]) charts[id] = { c: echarts.init(el), g: group };
  if (key !== undefined) { if (charts[id].k === key) return; charts[id].k = key; }
  charts[id].c.setOption(opt, true);
}
function logEv(msg, kind = 'info') { S.events.unshift({ t: Date.now(), kind, msg }); S.events.length = Math.min(S.events.length, 200); save(); }
const palette = () => ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(css);
function base() {
  const t2 = css('--text-2'), grid = css('--grid'), surface = css('--surface');
  return {
    t2, grid, surface,
    common: {
      animation: false, color: palette(), textStyle: { color: t2, fontFamily: 'inherit' },
      grid: { left: 48, right: 14, top: 28, bottom: 38 },
      tooltip: { trigger: 'axis', backgroundColor: surface, borderColor: css('--border'), textStyle: { color: css('--text') }, axisPointer: { type: 'line', lineStyle: { color: t2 } } },
      legend: { top: 0, right: 0, textStyle: { color: t2 }, itemWidth: 12, itemHeight: 3 },
    },
    xAxis: (data) => ({ type: 'category', data, boundaryGap: false, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: t2, hideOverlap: true } }),
    yAxis: (o = {}) => ({ type: 'value', splitLine: { lineStyle: { color: grid } }, axisLabel: { color: t2 }, ...o }),
  };
}
function lineOpt(times, series, unit, yMax) {
  const b = base(); const cols = palette();
  return {
    ...b.common,
    tooltip: { ...b.common.tooltip, valueFormatter: v => v.toFixed(1) + ' ' + unit },
    legend: series.length > 1 ? b.common.legend : { show: false },
    xAxis: b.xAxis(times.map(fmtTime)),
    yAxis: b.yAxis({ max: yMax, min: 0, axisLabel: { color: b.t2, formatter: '{value}' + (unit.length < 3 ? unit : '') } }),
    series: series.map((s, i) => ({
      name: s.name, type: 'line', data: s.data, showSymbol: false, smooth: false, lineStyle: { width: 2, color: cols[i] }, itemStyle: { color: cols[i] },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: cols[i] + (series.length === 1 ? '2e' : '18') }, { offset: 1, color: cols[i] + '00' }]) }, emphasis: { disabled: false },
    })),
  };
}
function aggregate() {
  const rs = running(); const n = 60;
  const t = rs.length ? hist(rs[0]).t : [];
  const util = Array.from({ length: n }, (_, i) => rs.length ? +(rs.reduce((a, v) => a + (hist(v).util[i] ?? 0), 0) / rs.length).toFixed(1) : 0);
  const power = Array.from({ length: n }, (_, i) => +rs.reduce((a, v) => a + (hist(v).power[i] ?? 0), 0).toFixed(0));
  return { t, util, power };
}

/* ---------- views ---------- */
const views = {};
// Watchtower: every module renders on one page, in this order (also the top-bar index order).
const SECTIONS = ['overview', 'instances', 'zones', 'monitoring', 'storage', 'network', 'keys', 'billing', 'activity'];
const titles = { overview: 'Overview', instances: 'Instances', zones: 'Zones & Capacity', monitoring: 'Monitoring', storage: 'Snapshots & Disks', network: 'Firewall', keys: 'SSH Keys', billing: 'Billing & Wallet', activity: 'Activity Log' };
const subtitles = { overview: 'Your GPU fleet across Bangladesh at a glance', instances: 'Launch, control and connect to your GPU virtual machines', zones: 'Data-centre zones in Dhaka, Gazipur and Jashore with live GPU availability', monitoring: 'Real-time GPU telemetry per instance', storage: 'Back up and manage disks', network: 'Control inbound traffic to your instances', keys: 'Manage access to your machines', billing: 'Wallet, payments, invoices and cost forecast (BDT)', activity: 'Audit trail of everything that happened in your account' };
// Builds every section into one page, then wires and paints them all.
function renderAll() {
  disposeGroup('view');
  const view = $('#view');
  view.innerHTML = SECTIONS.map(v => `<section class="wt-sec" id="sec-${v}"><div class="sec-h"><h2>${titles[v]}</h2><span>${subtitles[v]}</span></div>${views[v].html()}</section>`).join('');
  SECTIONS.forEach(v => views[v].init && views[v].init());
  SECTIONS.forEach(v => views[v].update && views[v].update(true));
  enter(view);
}
const card = (t, sub, id, cls = '') => `<div class="card"><h3>${t}</h3><div class="sub">${sub}</div><div id="${id}" class="chart ${cls}"></div></div>`;
const ICONS = {
  server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 15M12 6v1.5M12 16.5V18"/>',
};
const kpi = (l, id, note = '', icon = 'server', color = 'var(--s1)', extra = '') => `<div class="card kpi" style="--c:${color}"><div class="card-h"><div class="lbl">${l}</div><div class="ico"><svg viewBox="0 0 24 24">${ICONS[icon]}</svg></div></div><div class="val" id="${id}">0</div><div class="note">${note}</div>${extra}</div>`;
// Re-render a table/card container unless the pointer is over it (keeps clicks reliable during live refresh)
const paint = (el, html, force) => { if (!el || el._h === html) return false; if (!force && el.matches(':hover')) return false; el._h = html; el.innerHTML = html; return true; };
const monthCost = () => S.vms.reduce((a, v) => a + v.accrued, 0);

ICONS.wallet = '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/>';
function zoneStats(z) {
  const zc = ZONES[z], tot = Object.keys(zc.cap).reduce((a, g) => a + zc.cap[g], 0), free = Object.keys(zc.cap).reduce((a, g) => a + freeGpus(z, g), 0);
  const mine = S.vms.filter(v => v.status === 'running' && v.region === z).reduce((a, v) => a + v.gpuCount, 0);
  return { tot, free, mine };
}
function zoneMapOpt() {
  // BGD_DIV = 8 official divisions (geoBoundaries); their borders draw the national outline.
  if (!echarts.getMap('BGD')) echarts.registerMap('BGD', window.BGD_DIV);
  const b = base(), cols = palette(), mono = 'DM Mono, ui-monospace, monospace';
  const data = ZONE_IDS.map((z, i) => { const st = zoneStats(z); return { name: ZONES[z].name, zone: z, value: [ZONES[z].lng, ZONES[z].lat, st.free], st, itemStyle: { color: cols[i] }, label: { position: z === 'gazipur' ? 'top' : z === 'jashore' ? 'left' : 'right' } }; });
  return { animation: true,
    tooltip: { trigger: 'item', backgroundColor: b.surface, borderColor: css('--border'), textStyle: { color: css('--text') },
      formatter: p => `<b>${p.name}</b> · ${ZONES[p.data.zone].tier}<br>${ZONES[p.data.zone].site}<br>Free GPUs: <b>${p.data.st.free}</b> / ${p.data.st.tot}<br>Your running GPUs: <b>${p.data.st.mine}</b><br>Latency from Dhaka: ~${ZONES[p.data.zone].ping} ms` },
    geo: { map: 'BGD', roam: false, silent: true, layoutCenter: ['50%', '50%'], layoutSize: '100%',
      itemStyle: { areaColor: css('--surface-2'), borderColor: css('--border'), borderWidth: 1 },
      emphasis: { disabled: true }, label: { show: false } },
    series: [{ type: 'effectScatter', coordinateSystem: 'geo', data, symbol: 'rect', symbolSize: 11, showEffectOn: 'render', rippleEffect: { brushType: 'stroke', scale: 3.2, period: 4 }, zlevel: 2,
      itemStyle: { borderColor: b.surface, borderWidth: 2 },
      label: { show: true, distance: 10, formatter: p => `{n|${p.data.name}}\n{s|${p.data.st.free} free · ${ZONES[p.data.zone].ping} ms}`,
        rich: { n: { color: css('--text'), fontWeight: 600, fontSize: 13, lineHeight: 18 }, s: { color: css('--text-2'), fontFamily: mono, fontSize: 11, lineHeight: 15 } } } }] };
}
const mapKey = () => S.theme + ZONE_IDS.map(z => { const st = zoneStats(z); return st.free + ':' + st.mine; }).join();
function addFundsDialog() {
  openModal(`<h2>Add funds to wallet</h2><div class="sub">Prepaid wallet - instances bill per hour from your balance</div>
  <label>Payment method</label><div class="gpu-opts" id="pm">${PAY.map((m, i) => `<div class="opt ${i ? '' : 'sel'}" data-m="${m}" tabindex="0"><b>${m}</b><span>${i < 3 ? 'Mobile banking' : i === 3 ? 'Card' : 'Manual (1 business day)'}</span></div>`).join('')}</div>
  <label>Amount (BDT)</label><input id="amt" type="number" min="500" step="500" value="50000">
  <div class="toolbar" style="margin-top:12px">${[10000, 50000, 100000, 500000].map(a => `<button class="btn sm" data-q="${a}">${money(a).replace('.00', '')}</button>`).join('')}</div>
  <div class="est"><div><span class="sub">Current balance</span><br><b>${money(S.wallet)}</b></div><div><button class="btn" id="fc">Cancel</button> <button class="btn primary" id="fok">Pay now</button></div></div>`);
  let method = PAY[0];
  document.querySelectorAll('#pm .opt').forEach(o => o.onclick = () => { method = o.dataset.m; document.querySelectorAll('#pm .opt').forEach(x => x.classList.toggle('sel', x === o)); });
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { $('#amt').value = b.dataset.q; });
  $('#fc').onclick = closeModal;
  $('#fok').onclick = () => { const a = +$('#amt').value; if (!(a >= 500)) return toast('Minimum top-up is ৳500'); S.wallet += a; S.payments.unshift({ id: 'PAY-' + uid().toUpperCase(), method, amount: a, date: Date.now() }); logEv(`Wallet topped up ${money(a)} via ${method}`, 'ok'); save(); closeModal(); toast(`${money(a)} added via ${method}`); refresh(); };
}

const jumpTo = sec => document.getElementById('sec-' + sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const availGpus = () => Object.keys(GPUS).filter(g => GPUS[g].status === 'available');
// Live checks that need a human decision. Each item links to the module that fixes it.
function attentionItems() {
  const items = [];
  running().forEach(v => { const u = hist(v).util.at(-1); if (u >= 90) items.push(['warn', `${esc(v.name)} is at ${u.toFixed(0)}% GPU utilization`, 'Consider more GPUs or a second instance for this workload', 'instances']); });
  ZONE_IDS.forEach(z => availGpus().forEach(g => { const tot = ZONES[z].cap[g], f = freeGpus(z, g); if (f <= Math.max(1, Math.round(tot * .15))) items.push(['warn', `${ZONES[z].name} · ${GPUS[g].short} is nearly full`, `${f} of ${tot} GPUs free — new launches may be limited`, 'zones']); }));
  const rr = running().reduce((a, v) => a + rate(v), 0);
  if (rr) { const days = S.wallet / (rr * 24); if (days < 7) items.push([days < 2 ? 'bad' : 'warn', `Wallet runway ${days < 1 ? Math.floor(days * 24) + ' hours' : days.toFixed(1) + ' days'}`, 'Top up before the balance runs out to avoid interruption', 'billing']); }
  return items;
}
function attention() {
  const items = attentionItems();
  if (!items.length) return '<div class="feed-item ok"><b>All clear</b><span>No instances or zones need attention right now.</span></div>';
  return items.map(([k, t, s, sec]) => `<div class="feed-item ${k}" data-sec="${sec}"><b>${t}</b><span>${s}</span></div>`).join('');
}
// Top-bar status reflects the live alert count, not a fixed label.
function updateStatus() {
  const n = attentionItems().length, el = $('#status');
  el.innerHTML = `<i></i>${n ? n + (n === 1 ? ' open alert' : ' open alerts') : 'All systems operational'}`;
  el.classList.toggle('warn', !!n);
}
function zoneCapacityHtml() {
  const cols = palette();
  return ZONE_IDS.map((z, i) => {
    const tot = availGpus().reduce((a, g) => a + ZONES[z].cap[g], 0), used = tot - availGpus().reduce((a, g) => a + freeGpus(z, g), 0), pct = tot ? used / tot * 100 : 0;
    const tone = pct >= 85 ? 'var(--bad)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)';
    return `<div class="zc-row" data-sec="zones"><div class="zc-h"><b><span class="dot" style="background:${cols[i]}"></span>${ZONES[z].name}</b><span>${used} / ${tot} GPUs · ${pct.toFixed(0)}%</span></div><div class="bar"><i style="width:${pct.toFixed(1)}%;--c:${tone}"></i></div></div>`;
  }).join('');
}

views.overview = {
  html: () => `<div class="grid kpis">${kpi('Running instances', 'k1', 'of <span id="k1b"></span> total', 'server', 'var(--s1)', '<div class="bar"><i id="k1bar"></i></div>')}${kpi('GPUs in use', 'k2', 'of <span id="k2b"></span> provisioned', 'chip', 'var(--s3)', '<div class="bar"><i id="k2bar"></i></div>')}${kpi('Avg GPU utilization', 'k3', 'Fleet average, live', 'pulse', 'var(--s7)', '<div id="sp-util" class="spark"></div>')}${kpi('Month-to-date spend', 'k4', 'Run rate <b id="k4b"></b>/hr', 'coin', 'var(--s2)', '<div id="sp-spend" class="spark"></div>')}${kpi('Wallet balance', 'k5', 'Runway <b id="k5b"></b> · click to add funds', 'wallet', 'var(--s4)', '<div class="bar"><i id="k5bar"></i></div>')}</div>
  <div class="grid cols-w">${card('GPU utilization', 'Average across running instances, live', 'c-util')}${card('Fleet load', 'Current average utilization', 'c-gauge')}</div>
  <div class="grid cols-2" style="margin-top:16px"><div class="card"><h3>Needs attention</h3><div class="sub">Live checks across instances, zones and wallet</div><div id="c-attn" class="feed"></div></div><div class="card"><h3>Zone capacity</h3><div class="sub">Share of installed GPUs in use, by zone</div><div id="c-zcap" class="feed"></div></div></div>
  <div class="grid cols-2" style="margin-top:16px">${card('Power draw', 'Total GPU power (W), live', 'c-power')}${card('Daily spend', 'Last 30 days (BDT)', 'c-daily')}</div>`,
  init() {
    // KPI tiles jump to the module that owns the number; wallet tile opens top-up.
    const jump = { k1: 'instances', k2: 'instances', k3: 'monitoring', k4: 'billing' };
    Object.entries(jump).forEach(([k, sec]) => { const c = $('#' + k).closest('.card'); c.style.cursor = 'pointer'; c.onclick = () => document.getElementById('sec-' + sec).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const c = $('#k5').closest('.card'); c.style.cursor = 'pointer'; c.onclick = addFundsDialog;
    ['c-attn', 'c-zcap'].forEach(id => document.getElementById(id).onclick = e => { const it = e.target.closest('[data-sec]'); if (it) jumpTo(it.dataset.sec); });
  },
  update(force) {
    const rs = running(), g = rs.reduce((a, v) => a + v.gpuCount, 0), tg = live().reduce((a, v) => a + v.gpuCount, 0), ag = aggregate(), uNow = rs.length ? ag.util[ag.util.length - 1] : 0, rr = rs.reduce((a, v) => a + rate(v), 0);
    setNum('k1', rs.length); $('#k1b').textContent = live().length; setBar('k1bar', live().length ? rs.length / live().length * 100 : 0);
    setNum('k2', g); $('#k2b').textContent = tg; setBar('k2bar', tg ? g / tg * 100 : 0);
    setNum('k3', uNow, v => v.toFixed(0) + '%');
    setNum('k4', monthCost(), moneyR); $('#k4b').textContent = money(rr);
    setNum('k5', S.wallet, moneyR); const days = rr ? S.wallet / (rr * 24) : Infinity; $('#k5b').textContent = rr ? (days < 1 ? Math.floor(days * 24) + ' hrs' : days.toFixed(1) + ' days') : '∞'; setBar('k5bar', rr ? days / 30 * 100 : 100);
    const sp = (data, color) => ({ animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) }, yAxis: { type: 'value', show: false, min: 'dataMin' },
      series: [{ type: 'line', data, showSymbol: false, smooth: false, lineStyle: { width: 2, color }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + '44' }, { offset: 1, color: color + '00' }]) } }] });
    mount('sp-util', 'view', sp(ag.util, css('--s7'))); mount('sp-spend', 'view', sp(S.daily.slice(-14), css('--s2')));
    mount('c-gauge', 'view', { animation: false, series: [{ type: 'gauge', startAngle: 205, endAngle: -25, min: 0, max: 100, radius: '92%', center: ['50%', '58%'],
      progress: { show: true, width: 14, roundCap: false, itemStyle: { color: css('--s1') } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      axisLine: { roundCap: false, lineStyle: { width: 14, color: [[1, css('--surface-2')]] } },
      detail: { valueAnimation: false, offsetCenter: [0, '4%'], fontSize: 38, fontWeight: 700, color: css('--text'), formatter: v => v.toFixed(0) + '%' },
      title: { offsetCenter: [0, '34%'], color: css('--text-3'), fontSize: 12 }, data: [{ value: +uNow.toFixed(1), name: rs.length + ' instances running' }] }] });
    mount('c-util', 'view', lineOpt(ag.t, [{ name: 'Avg utilization', data: ag.util }], '%', 100));
    mount('c-power', 'view', lineOpt(ag.t, [{ name: 'Power', data: ag.power }], 'W'));
    const b = base(), days30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 864e5); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); });
    mount('c-daily', 'view', { ...b.common, legend: { show: false }, tooltip: { ...b.common.tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => money(v) },
      xAxis: { ...b.xAxis(days30), boundaryGap: true }, yAxis: b.yAxis({ axisLabel: { color: b.t2, formatter: kfmt } }),
      series: [{ type: 'bar', data: S.daily, barMaxWidth: 14, itemStyle: { color: css('--s1'), borderRadius: [2, 2, 0, 0] } }] });
    paint($('#c-attn'), attention(), force);
    paint($('#c-zcap'), zoneCapacityHtml(), force);
  },
};

function vmTable(list, actions, compact) {
  if (!list.length) return '<p class="sub">No instances yet. Launch your first GPU VM.</p>';
  return `<table><thead><tr><th>Name</th><th>Status</th><th>GPU</th>${compact ? '' : '<th>Region</th><th>IP</th>'}<th class="num">Util</th><th class="num">৳/hr</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${list.map(v => {
    const u = v.status === 'running' ? hist(v).util.at(-1) : 0;
    return `<tr class="click" data-vm="${v.id}"><td><b>${esc(v.name)}</b></td><td><span class="badge ${v.status}">${v.status}</span></td><td>${v.gpuCount}× ${GPUS[v.gpu].short}</td>${compact ? '' : `<td>${ZONES[v.region].name}</td><td>${v.ip}</td>`}<td class="num">${v.status === 'running' ? u.toFixed(0) + '%' : '-'}</td><td class="num">${money(rate(v))}</td>${actions ? `<td><div class="row-actions">${actionBtns(v)}</div></td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
}
function actionBtns(v) {
  const s = v.status;
  return `${s === 'stopped' ? `<button class="btn sm" data-act="start" data-id="${v.id}">Start</button>` : ''}${s === 'running' ? `<button class="btn sm" data-act="stop" data-id="${v.id}">Stop</button><button class="btn sm" data-act="reboot" data-id="${v.id}">Reboot</button>` : ''}${s !== 'terminated' && s !== 'pending' && s !== 'stopping' ? `<button class="btn sm danger" data-act="terminate" data-id="${v.id}">Terminate</button>` : ''}`;
}
function bindRows() {
  document.querySelectorAll('[data-vm]').forEach(r => r.onclick = e => { if (e.target.closest('button')) return; openDrawer(r.dataset.vm); });
  document.querySelectorAll('button[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); vmAction(b.dataset.id, b.dataset.act); });
}

function vmCard(v) {
  const g = GPUS[v.gpu], on = v.status === 'running', h = hist(v), u = on ? h.util.at(-1) : 0;
  const col = u > 85 ? 'var(--s2)' : 'var(--s1)';
  return `<div class="card vm ${on ? '' : 'off'}" data-vm="${v.id}"><div class="vm-top"><div><b>${esc(v.name)}</b><small>${ZONES[v.region].name} · ${v.id}</small></div><span class="badge ${v.status}">${v.status}</span></div>
  <div class="vm-mid"><div class="ring" style="--p:${u.toFixed(0)};--c:${col}"><b>${on ? u.toFixed(0) : '–'}<small>${on ? '%' : ''}</small></b></div>
  <div class="stats"><div>GPU<b>${v.gpuCount}× ${g.short}</b></div><div>VRAM<b>${on ? h.mem.at(-1).toFixed(0) : 0} / ${g.mem * v.gpuCount} GB</b></div><div>Temp<b>${on ? h.temp.at(-1).toFixed(0) + '°C' : '–'}</b></div><div>Power<b>${on ? h.power.at(-1).toFixed(0) + ' W' : '–'}</b></div></div></div>
  <div class="vm-foot"><div class="meta">${v.ip}<br><b>${money(rate(v))}</b>/hr</div><div class="row-actions">${actionBtns(v)}</div></div></div>`;
}
views.instances = {
  html: () => `<div class="toolbar"><input id="q" placeholder="Search instances…" style="min-width:240px"><select id="f"><option value="">All statuses</option><option>running</option><option>stopped</option><option>pending</option></select><span class="grow"></span><button class="btn primary" id="newVm"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New instance</button></div><div class="vm-grid" id="it"></div>`,
  init() { $('#q').oninput = $('#f').onchange = () => this.update(true); $('#newVm').onclick = () => launchDialog(); },
  update(force) {
    const q = $('#q').value.toLowerCase(), f = $('#f').value, list = S.vms.filter(v => v.status !== 'terminated' && v.name.toLowerCase().includes(q) && (!f || v.status === f));
    const el = $('#it'), sig = list.map(v => v.id + v.status).join();
    // structure unchanged -> patch in place so hover/press states survive live refresh
    if (!force && el._sig === sig && el.children.length === list.length) {
      list.forEach((v, i) => { const c = el.children[i]; if (c.matches(':hover')) return; const n = document.createElement('div'); n.innerHTML = vmCard(v); const nn = n.firstElementChild;
        c.querySelector('.ring').style.cssText = nn.querySelector('.ring').style.cssText; c.querySelector('.ring').innerHTML = nn.querySelector('.ring').innerHTML; c.querySelector('.stats').innerHTML = nn.querySelector('.stats').innerHTML; });
      return;
    }
    el._sig = sig;
    el.innerHTML = list.length ? list.map(vmCard).join('') : '<div class="empty card">No instances match. Launch a GPU VM to get started.</div>';
    bindRows();
    if (!force && !reduce) animate(el.querySelectorAll('.vm'), { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.3 });
  },
};

views.monitoring = {
  html: () => `<div class="toolbar"><select id="mvm"></select></div><div class="grid cols-2">${card('GPU utilization', '%', 'm-util')}${card('GPU memory used', 'GB', 'm-mem')}${card('GPU temperature', '°C', 'm-temp')}${card('Power draw', 'W', 'm-power')}${card('Network', 'MB/s in / out', 'm-net')}${card('Fleet utilization by instance', 'Now', 'm-fleet')}</div>`,
  sel: null,
  init() { $('#mvm').onchange = e => { this.sel = e.target.value; this.update(true); }; },
  update() {
    const l = live(); if (!this.sel || !l.find(v => v.id === this.sel)) this.sel = (running()[0] || l[0] || {}).id;
    paint($('#mvm'), l.map(v => `<option value="${v.id}" ${v.id === this.sel ? 'selected' : ''}>${esc(v.name)}</option>`).join(''));
    const vm = S.vms.find(v => v.id === this.sel); if (!vm) return;
    metricCharts(vm, 'm-', 'view');
    const b = base(), rs = running();
    mount('m-fleet', 'view', { ...b.common, grid: { left: 110, right: 40, top: 6, bottom: 6 }, legend: { show: false }, tooltip: { ...b.common.tooltip, trigger: 'item', valueFormatter: v => v.toFixed(0) + '%' },
      xAxis: { type: 'value', max: 100, show: false }, yAxis: { type: 'category', inverse: true, data: rs.map(v => v.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: b.t2 } },
      series: [{ type: 'bar', data: rs.map(v => +hist(v).util.at(-1).toFixed(0)), barMaxWidth: 14, showBackground: true, backgroundStyle: { color: css('--surface-2'), borderRadius: 4 }, itemStyle: { color: css('--s1'), borderRadius: 0 }, label: { show: true, position: 'right', color: css('--text'), formatter: '{c}%' } }] });
  },
};
function metricCharts(vm, p, group) {
  const h = hist(vm), g = GPUS[vm.gpu];
  mount(p + 'util', group, lineOpt(h.t, [{ name: 'Utilization', data: h.util }], '%', 100));
  mount(p + 'mem', group, lineOpt(h.t, [{ name: 'Memory', data: h.mem }], 'GB', g.mem));
  mount(p + 'temp', group, lineOpt(h.t, [{ name: 'Temperature', data: h.temp }], '°C', 100));
  mount(p + 'power', group, lineOpt(h.t, [{ name: 'Power', data: h.power }], 'W'));
  mount(p + 'net', group, lineOpt(h.t, [{ name: 'In', data: h.netIn }, { name: 'Out', data: h.netOut }], 'MB/s'));
}

views.zones = {
  html: () => `<div class="grid cols-w">${card('Bangladesh data-centre zones', 'Live GPU availability per site', 'z-map', 'xl')}${card('Network', 'Latency from Dhaka over BDIX', 'z-lat', 'lg')}</div>
  <div class="grid" id="z-cards" style="margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"></div>
  <div style="margin-top:16px">${card('GPU capacity by zone', 'Other customers · You · Free', 'z-cap', 'lg')}</div>`,
  update(force) {
    const b = base(), cols = palette();
    mount('z-map', 'view', zoneMapOpt(), mapKey());
    mount('z-lat', 'view', { ...b.common, legend: { show: false }, grid: { left: 80, right: 50, top: 10, bottom: 10 }, tooltip: { ...b.common.tooltip, trigger: 'item', valueFormatter: v => v + ' ms' },
      xAxis: { type: 'value', show: false }, yAxis: { type: 'category', inverse: true, data: ZONE_IDS.map(z => ZONES[z].name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: b.t2 } },
      series: [{ type: 'bar', barMaxWidth: 18, data: ZONE_IDS.map((z, i) => ({ value: ZONES[z].ping, itemStyle: { color: cols[i], borderRadius: [0, 2, 2, 0] } })), label: { show: true, position: 'right', color: css('--text'), formatter: p => p.value + ' ms' } }] }, S.theme);
    const html = ZONE_IDS.map((z, i) => { const zc = ZONES[z], st = zoneStats(z);
      return `<div class="card zone"><div class="card-h"><div><h3 style="font-size:16px"><span class="dot" style="background:${cols[i]}"></span>${zc.name}</h3><div class="sub">${zc.site}</div></div><span class="badge running">Operational</span></div>
      <dl class="dl" style="grid-template-columns:100px 1fr"><dt>Park</dt><dd>${zc.park}</dd><dt>Tier / PUE</dt><dd>${zc.tier} · PUE ${zc.pue}</dd><dt>Latency</dt><dd>~${zc.ping} ms from Dhaka</dd><dt>Your GPUs</dt><dd>${st.mine} running</dd></dl>
      ${Object.keys(GPUS).filter(g => GPUS[g].status === 'available').map(g => { const tot = zc.cap[g], free = freeGpus(z, g); return `<div class="cap"><div><b>${GPUS[g].short}</b><span>${free} free / ${tot}</span></div><div class="bar"><i style="width:${(tot - free) / tot * 100}%;--c:${cols[i]}"></i></div></div>`; }).join('')}
      <div class="sub" style="margin:10px 0 0">Coming soon: ${Object.keys(GPUS).filter(g => GPUS[g].status === 'soon').map(g => GPUS[g].short).join(' · ')}</div>
      <div style="margin-top:12px"><button class="btn sm primary" data-launch-zone="${z}">Launch in ${zc.name}</button></div></div>`; }).join('');
    if (paint($('#z-cards'), html, force)) document.querySelectorAll('[data-launch-zone]').forEach(btn => btn.onclick = () => launchDialog(btn.dataset.launchZone));
    const cats = [], other = [], mine = [], free = [];
    ZONE_IDS.forEach(z => Object.keys(GPUS).filter(g => GPUS[g].status === 'available').forEach(g => { const m = S.vms.filter(v => v.status !== 'terminated' && v.region === z && v.gpu === g).reduce((a, v) => a + v.gpuCount, 0); cats.push(ZONES[z].name + ' · ' + GPUS[g].short); other.push(ZONES[z].used[g]); mine.push(m); free.push(freeGpus(z, g)); }));
    const seg = (name, data, color, last) => ({ name, type: 'bar', stack: 'c', data, barMaxWidth: 22, itemStyle: { color, borderColor: b.surface, borderWidth: 1, borderRadius: last ? [0, 4, 4, 0] : 0 } });
    mount('z-cap', 'view', { ...b.common, grid: { left: 170, right: 20, top: 30, bottom: 10 }, tooltip: { ...b.common.tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => v + ' GPUs' },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: b.grid } }, axisLabel: { color: b.t2 } }, yAxis: { type: 'category', inverse: true, data: cats, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: b.t2, interval: 0 } },
      series: [seg('Other customers', other, css('--surface-3')), seg('You', mine, cols[0]), seg('Free', free, cols[2], true)] }, S.theme + cats.length + other.join() + mine.join() + free.join());
  },
};

views.activity = {
  html: () => `<div class="card"><div class="tbl-wrap" id="ev"></div></div>`,
  update(force) {
    const kind = { ok: 'running', info: 'pending', warn: 'stopping' };
    paint($('#ev'), S.events.length ? `<table><thead><tr><th>Time</th><th>Type</th><th>Event</th></tr></thead><tbody>${S.events.map(e => `<tr><td>${new Date(e.t).toLocaleString()}</td><td><span class="badge ${kind[e.kind] || 'pending'}">${e.kind}</span></td><td>${esc(e.msg)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No activity yet.</p>', force);
  },
};

views.storage = {
  html: () => `<div class="grid cols-2"><div class="card"><div class="toolbar"><h3 style="margin:0;flex:1">Snapshots</h3><button class="btn sm primary" id="snapNew">Create snapshot</button></div><div id="snaps"></div></div>${card('Storage by instance', 'Boot disk GB + snapshots GB (stacked)', 'c-stor')}</div>`,
  init() { $('#snapNew').onclick = () => snapshotDialog(); },
  update(force) {
    if (paint($('#snaps'), S.snapshots.length ?`<table><thead><tr><th>Name</th><th>Source</th><th class="num">Size</th><th>Created</th><th></th></tr></thead><tbody>${S.snapshots.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.vm)}</td><td class="num">${s.size} GB</td><td>${fmtDate(s.created)}</td><td><div class="row-actions"><button class="btn sm" data-restore="${s.id}">Restore</button><button class="btn sm danger" data-del="${s.id}">Delete</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="sub">No snapshots.</p>', force)) {
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.snapshots = S.snapshots.filter(s => s.id !== b.dataset.del); save(); toast('Snapshot deleted'); this.update(true); });
    document.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => toast('Restore started - a new instance will appear shortly'));
    }
    const b = base(), names = live().map(v => v.name), cols = palette();
    mount('c-stor', 'view', { ...b.common, tooltip: { ...b.common.tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => v + ' GB' },
      xAxis: { ...b.xAxis(names), boundaryGap: true }, yAxis: b.yAxis({ axisLabel: { color: b.t2, formatter: '{value}' } }),
      series: [{ name: 'Boot disk', type: 'bar', stack: 's', barMaxWidth: 28, data: live().map(v => v.disk), itemStyle: { color: cols[0], borderColor: b.surface, borderWidth: 1 } },
        { name: 'Snapshots', type: 'bar', stack: 's', barMaxWidth: 28, data: live().map(v => S.snapshots.filter(s => s.vm === v.name).reduce((a, s) => a + s.size, 0)), itemStyle: { color: cols[1], borderColor: b.surface, borderWidth: 1, borderRadius: [2, 2, 0, 0] } }] });
  },
};
function snapshotDialog() {
  const l = live(); if (!l.length) return toast('No instances');
  openModal(`<h2>Create snapshot</h2><label>Instance</label><select id="sv">${l.map(v => `<option>${esc(v.name)}</option>`).join('')}</select><label>Name</label><input id="sn" placeholder="my-snapshot"><div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">Cancel</button><button class="btn primary" id="sok">Create</button></div>`);
  $('#sok').onclick = () => { const vm = l.find(v => v.name === $('#sv').value); S.snapshots.push({ id: 'snap-' + uid(), name: $('#sn').value.trim() || vm.name + '-snap', vm: vm.name, size: Math.round(vm.disk * rnd(.1, .6)), created: Date.now() }); save(); closeModal(); toast('Snapshot created'), logEv('Snapshot created', 'ok'); views.storage.update(true); };
}

views.network = {
  html: () => `<div class="card"><div class="toolbar"><h3 style="margin:0;flex:1">Inbound rules</h3></div><div id="rules"></div>
  <div class="toolbar" style="margin-top:14px"><select id="rp"><option>TCP</option><option>UDP</option><option>ICMP</option></select><input id="rport" placeholder="Port (e.g. 8080)" style="width:140px"><input id="rsrc" placeholder="Source CIDR" value="0.0.0.0/0" style="width:160px"><input id="rnote" placeholder="Description"><button class="btn primary" id="radd">Add rule</button></div></div>`,
  init() { $('#radd').onclick = () => { const port = $('#rport').value.trim(); if (!port) return toast('Enter a port'); S.rules.push({ id: 'r' + uid(), proto: $('#rp').value, port, source: $('#rsrc').value.trim() || '0.0.0.0/0', note: $('#rnote').value.trim() }); save(); toast('Rule added'), logEv('Firewall rule added'); this.update(true); }; },
  update(force) {
    if (paint($('#rules'),`<table><thead><tr><th>Protocol</th><th>Port</th><th>Source</th><th>Description</th><th></th></tr></thead><tbody>${S.rules.map(r => `<tr><td>${r.proto}</td><td>${esc(r.port)}</td><td>${esc(r.source)}</td><td>${esc(r.note)}</td><td class="num"><button class="btn sm danger" data-rd="${r.id}">Remove</button></td></tr>`).join('')}</tbody></table>`, force)) document.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => { S.rules = S.rules.filter(r => r.id !== b.dataset.rd); save(); this.update(true); });
  },
};

views.keys = {
  html: () => `<div class="card"><div id="keys"></div><label>Name</label><input id="kn" placeholder="work-laptop" style="max-width:320px"><label>Public key</label><input id="kv" placeholder="ssh-ed25519 AAAA..."><div style="margin-top:12px"><button class="btn primary" id="kadd">Add key</button></div></div>`,
  init() { $('#kadd').onclick = () => { const n = $('#kn').value.trim(), v = $('#kv').value.trim(); if (!n || !v.startsWith('ssh-')) return toast('Enter a name and a valid public key'); S.keys.push({ id: 'key-' + uid(), name: n, fp: 'SHA256:' + Array.from({ length: 8 }, () => Math.floor(rnd(16, 255)).toString(16)).join(':') }); save(); toast('Key added'), logEv('SSH key added'); this.update(true); }; },
  update(force) {
    if (paint($('#keys'), `<table><thead><tr><th>Name</th><th>Fingerprint</th><th></th></tr></thead><tbody>${S.keys.map(k => `<tr><td><b>${esc(k.name)}</b></td><td><code>${esc(k.fp)}</code></td><td class="num"><button class="btn sm danger" data-kd="${k.id}">Delete</button></td></tr>`).join('')}</tbody></table>`, force)) document.querySelectorAll('[data-kd]').forEach(b => b.onclick = () => { S.keys = S.keys.filter(k => k.id !== b.dataset.kd); save(); this.update(true); });
  },
};

views.billing = {
  html: () => `<div class="toolbar"><span class="grow"></span><button class="btn primary" id="addFunds"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add funds</button></div>
  <div class="grid kpis">${kpi('Wallet balance', 'b0', 'Runway <b id="b0b"></b>', 'wallet', 'var(--s4)')}${kpi('Month-to-date', 'b1', 'Billed hourly', 'coin', 'var(--s2)')}${kpi('Projected month-end', 'b2', 'At current run rate', 'pulse', 'var(--s7)')}${kpi('Current run rate', 'b3', 'per hour', 'server', 'var(--s1)')}${kpi('Avg cost / GPU-hour', 'b4', 'Running instances', 'chip', 'var(--s3)')}</div>
  <div class="grid cols-2">${card('Spend by month', 'Last 6 months (BDT)', 'b-month')}${card('Run-rate by GPU type', 'BDT per hour, running instances', 'b-gpu')}</div>
  <div class="grid cols-2" style="margin-top:16px"><div class="card"><h3>Cost per instance</h3><div class="sub">Month to date</div><div class="tbl-wrap" id="b-table"></div></div><div class="card"><h3>Payments</h3><div class="sub">Wallet top-ups</div><div class="tbl-wrap" id="b-pay"></div></div></div>
  <div class="card" style="margin-top:16px"><h3>Invoices</h3><div class="sub">Monthly statements</div><div class="tbl-wrap" id="b-inv"></div></div>`,
  init() { $('#addFunds').onclick = addFundsDialog; },
  update(force) {
    const rs = running(), rr = rs.reduce((a, v) => a + rate(v), 0), gp = rs.reduce((a, v) => a + v.gpuCount, 0), d = new Date(), left = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate();
    setNum('b0', S.wallet, moneyR); const days = rr ? S.wallet / (rr * 24) : Infinity; $('#b0b').textContent = rr ? (days < 1 ? Math.floor(days * 24) + ' hrs' : days.toFixed(1) + ' days') : '∞';
    setNum('b1', monthCost(), moneyR); setNum('b2', monthCost() + rr * 24 * left, moneyR); setNum('b3', rr, moneyR); setNum('b4', gp ? rr / gp : 0, moneyR);
    const b = base(), months = Array.from({ length: 6 }, (_, i) => new Date(d.getFullYear(), d.getMonth() - 5 + i, 1).toLocaleDateString(undefined, { month: 'short' })), vals = [412000, 538000, 655000, 781000, 902000, +monthCost().toFixed(2)];
    mount('b-month', 'view', { ...b.common, legend: { show: false }, tooltip: { ...b.common.tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => money(v) }, xAxis: { ...b.xAxis(months), boundaryGap: true }, yAxis: b.yAxis({ axisLabel: { color: b.t2, formatter: kfmt } }),
      series: [{ type: 'bar', data: vals, barMaxWidth: 36, itemStyle: { color: css('--s1'), borderRadius: [2, 2, 0, 0] } }] });
    const by = {}; rs.forEach(v => by[GPUS[v.gpu].short] = (by[GPUS[v.gpu].short] || 0) + rate(v));
    const ks = Object.keys(by), cols = palette();
    mount('b-gpu', 'view', { ...b.common, legend: { show: true, bottom: 0, top: 'auto', textStyle: { color: b.t2 } }, tooltip: { ...b.common.tooltip, trigger: 'item', valueFormatter: v => money(v) + '/hr' },
      series: [{ type: 'pie', radius: ['52%', '75%'], center: ['50%', '45%'], itemStyle: { borderColor: b.surface, borderWidth: 2, borderRadius: 0 }, label: { color: css('--text'), formatter: '{b}\n{d}%' }, data: ks.map((k, i) => ({ name: k, value: +by[k].toFixed(2), itemStyle: { color: cols[i] } })) }] }, S.theme + ks.join() + Object.values(by).join());
    paint($('#b-table'), `<table><thead><tr><th>Instance</th><th>Config</th><th class="num">৳/hr</th><th class="num">Month-to-date</th></tr></thead><tbody>${S.vms.filter(v => v.accrued > 0).map(v => `<tr><td><b>${esc(v.name)}</b></td><td>${v.gpuCount}× ${GPUS[v.gpu].short}</td><td class="num">${money(rate(v))}</td><td class="num">${money(v.accrued)}</td></tr>`).join('')}</tbody></table>`, force);
    paint($('#b-pay'), `<table><thead><tr><th>Date</th><th>Method</th><th>Ref</th><th class="num">Amount</th></tr></thead><tbody>${S.payments.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${p.method}</td><td><code>${p.id}</code></td><td class="num">${money(p.amount)}</td></tr>`).join('')}</tbody></table>`, force);
    if (paint($('#b-inv'), `<table><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead><tbody>${S.invoices.map(i => `<tr><td><b>${i.id}</b></td><td>${fmtDate(i.date)}</td><td><span class="badge running">${i.status}</span></td><td class="num">${money(i.amount)}</td><td class="num"><button class="btn sm" data-inv="${i.id}">Download</button></td></tr>`).join('')}</tbody></table>`, force)) document.querySelectorAll('[data-inv]').forEach(btn => btn.onclick = () => toast('Invoice ' + btn.dataset.inv + ' downloaded'));
  },
};

/* ---------- VM actions ---------- */
function vmAction(id, act) {
  const v = S.vms.find(x => x.id === id); if (!v) return;
  const done = (st, ipv, msg) => { v.status = st; v.ip = ipv; logEv(msg, 'ok'); save(); toast(msg); refresh(); };
  if (act === 'start') { v.status = 'pending'; refresh(); setTimeout(() => { v.load = v.load || rnd(.3, .9); done('running', ip(), v.name + ' is running'); }, 2000); }
  if (act === 'stop') { v.status = 'stopping'; refresh(); setTimeout(() => done('stopped', '-', v.name + ' stopped'), 1800); }
  if (act === 'reboot') { v.status = 'pending'; refresh(); setTimeout(() => done('running', v.ip, v.name + ' rebooted'), 2200); }
  if (act === 'terminate') {
    openModal(`<h2>Terminate ${esc(v.name)}?</h2><p class="sub">The instance and its boot disk will be permanently deleted. Snapshots are kept.</p><div class="toolbar" style="justify-content:flex-end"><button class="btn" id="tc">Cancel</button><button class="btn primary" style="background:var(--bad);border-color:var(--bad)" id="tok">Terminate</button></div>`);
    $('#tc').onclick = closeModal;
    $('#tok').onclick = () => { closeModal(); v.status = 'terminated'; v.ip = '-'; logEv(v.name + ' terminated', 'warn'); save(); toast(v.name + ' terminated'); if (drawerVm === id) closeDrawer(); refresh(); };
  }
}
function refresh(force = true) { SECTIONS.forEach(v => views[v].update && views[v].update(force)); updateStatus(); if (drawerVm) renderDrawer(); }

/* ---------- drawer ---------- */
function openDrawer(id) {
  drawerVm = id; drawerTab = 'metrics'; tabX = null; const d = $('#drawer'); d.classList.remove('hidden'); d.onclick = e => { if (e.target.id === 'drawer') closeDrawer(); };
  renderDrawer(true);
  animate(d, { opacity: [0, 1] }, { duration: dur(0.2) });
  animate(d.firstChild, { x: [40, 0], opacity: [0, 1] }, { duration: dur(0.25), ease: 'easeOut' });
}
function renderDrawer(full) {
  const v = S.vms.find(x => x.id === drawerVm); if (!v) return closeDrawer();
  const g = GPUS[v.gpu], d = $('#drawer');
  if (full || !$('#d-body')) {
    disposeGroup('drawer');
    d.innerHTML = `<div class="panel"><div class="toolbar"><div style="flex:1"><h2 style="margin:0">${esc(v.name)}</h2><span class="sub">${v.id}</span></div><span id="d-badge"></span><button class="btn" id="dx">Close</button></div><div class="row-actions" id="d-acts" style="justify-content:flex-start"></div>
    <div class="tabs"><button data-t="metrics">Metrics</button><button data-t="details">Details</button><button data-t="connect">Connect</button><span class="tab-ind" id="tabInd"></span></div><div id="d-body"></div></div>`;
    $('#dx').onclick = closeDrawer;
    d.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { drawerTab = b.dataset.t; renderDrawer(true); });
    d.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === drawerTab));
    { const on = d.querySelector('.tabs button.on'), ind = $('#tabInd'), x = on.offsetLeft, w = on.offsetWidth; ind.style.width = w + 'px';
      if (tabX === null || reduce) ind.style.transform = `translateX(${x}px)`; else animate(ind, { x: [tabX, x] }, { type: 'spring', visualDuration: 0.25, bounce: 0 }); tabX = x; }    const body = $('#d-body');
    if (drawerTab === 'metrics') body.innerHTML = `<div class="grid cols-2">${card('GPU utilization', '%', 'd-util', 'sm')}${card('GPU memory', 'GB', 'd-mem', 'sm')}${card('Temperature', '°C', 'd-temp', 'sm')}${card('Power', 'W', 'd-power', 'sm')}</div><div style="margin-top:14px">${card('Network', 'MB/s', 'd-net', 'sm')}</div>`;
    if (drawerTab === 'details') body.innerHTML = `<div class="card"><dl class="dl"><dt>Status</dt><dd>${v.status}</dd><dt>GPU</dt><dd>${v.gpuCount}× ${g.name} (${g.mem * v.gpuCount} GB VRAM total)</dd><dt>vCPU / RAM</dt><dd>${g.vcpu * v.gpuCount} vCPU / ${g.ram * v.gpuCount} GB</dd><dt>Boot disk</dt><dd>${v.disk} GB NVMe</dd><dt>Image</dt><dd>${esc(v.image)}</dd><dt>Zone</dt><dd>${ZONES[v.region].name} · ${ZONES[v.region].site}</dd><dt>Latency</dt><dd>~${ZONES[v.region].ping} ms from Dhaka (BDIX)</dd><dt>Public IP</dt><dd>${v.ip}</dd><dt>Price</dt><dd>${money(rate(v))}/hr</dd><dt>Month-to-date</dt><dd>${money(v.accrued)}</dd><dt>Created</dt><dd>${fmtDate(v.created)}</dd></dl>
      <div class="toolbar"><button class="btn" id="dsnap">Create snapshot</button><button class="btn" id="dren">Rename</button></div></div>`;
    if (drawerTab === 'connect') body.innerHTML = `<div class="card"><h3>SSH</h3><div class="sub">Use one of your registered SSH keys</div><div class="code"><span>ssh ubuntu@${v.ip}</span><button class="btn sm" data-copy="ssh ubuntu@${v.ip}">Copy</button></div><h3 style="margin-top:16px">Jupyter tunnel</h3><div class="code"><span>ssh -L 8888:localhost:8888 ubuntu@${v.ip}</span><button class="btn sm" data-copy="ssh -L 8888:localhost:8888 ubuntu@${v.ip}">Copy</button></div><h3 style="margin-top:16px">nvidia-smi</h3><div class="code"><span>watch -n1 nvidia-smi</span></div></div>`;
    enter(body);
    d.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); });
    $('#dsnap') && ($('#dsnap').onclick = () => { S.snapshots.push({ id: 'snap-' + uid(), name: v.name + '-snap', vm: v.name, size: Math.round(v.disk * rnd(.1, .6)), created: Date.now() }); save(); toast('Snapshot created'), logEv('Snapshot created', 'ok'); });
    $('#dren') && ($('#dren').onclick = () => { const n = prompt('New name', v.name); if (n && n.trim()) { v.name = n.trim(); save(); renderDrawer(true); refresh(); } });
  }
  $('#d-badge').innerHTML = `<span class="badge ${v.status}">${v.status}</span>`;
  $('#d-acts').innerHTML = actionBtns(v);
  d.querySelectorAll('#d-acts [data-act]').forEach(b => b.onclick = () => vmAction(b.dataset.id, b.dataset.act));
  if (drawerTab === 'metrics') metricCharts(v, 'd-', 'drawer');
}

/* ---------- launch wizard ---------- */
function launchDialog(zone) {
  const st = { gpu: 'rtxpro6000', n: 1, region: ZONES[zone] ? zone : 'gazipur', image: IMAGES[0], disk: 200, name: 'gpu-vm-' + uid(), key: (S.keys[0] || {}).name };
  const sync = () => { if (!$('#ln')) return; st.n = +$('#ln').value || 1; st.image = $('#li').value; st.disk = clamp(+$('#ld').value || 200, 50, 4000); st.name = $('#lname').value; st.key = $('#lk').value; };
  const draw = () => {
    const g = GPUS[st.gpu];
    if (freeGpus(st.region, st.gpu) < 1) st.region = ZONE_IDS.find(z => freeGpus(z, st.gpu) > 0) || st.region;
    const maxFree = freeGpus(st.region, st.gpu), counts = [1, 2, 4, 8].filter(n => n <= maxFree); if (!counts.includes(st.n)) st.n = counts.at(-1) || 1;
    const total = g.price * st.n, ok = counts.length > 0;
    openModal(`<h2>Launch GPU VM</h2><div class="sub">Pick hardware, a Bangladesh zone and an image</div>
    <label>GPU</label><div class="gpu-opts">${Object.entries(GPUS).map(([k, x]) => `<div class="opt ${k === st.gpu ? 'sel' : ''} ${x.status === 'soon' ? 'dis' : ''}" data-g="${k}" tabindex="0"><em>${x.tag}</em><b>${x.short}</b><span>${x.mem} GB ${x.arch} · ${money(x.price)}/GPU/hr</span></div>`).join('')}</div>
    <label>Zone</label><div class="gpu-opts">${ZONE_IDS.map(z => { const f = freeGpus(z, st.gpu); return `<div class="opt ${z === st.region ? 'sel' : ''} ${f < 1 ? 'dis' : ''}" data-z="${z}" tabindex="0"><em>${ZONES[z].tier} · ~${ZONES[z].ping} ms</em><b>${ZONES[z].name}</b><span>${ZONES[z].site}<br>${f < 1 ? 'Sold out' : f + ' ' + g.short + ' free'}</span></div>`; }).join('')}</div>
    <div class="grid cols-3"><div><label>GPU count</label><select id="ln">${counts.map(n => `<option ${n === st.n ? 'selected' : ''}>${n}</option>`).join('') || '<option>-</option>'}</select></div><div><label>Boot disk (GB NVMe)</label><input id="ld" type="number" min="50" max="4000" step="50" value="${st.disk}"></div><div><label>SSH key</label><select id="lk">${S.keys.map(k => `<option ${k.name === st.key ? 'selected' : ''}>${esc(k.name)}</option>`).join('') || '<option value="">(none)</option>'}</select></div></div>
    <label>Image</label><select id="li">${IMAGES.map(i => `<option ${i === st.image ? 'selected' : ''}>${i}</option>`).join('')}</select>
    <label>Name</label><input id="lname" value="${esc(st.name)}">
    <div class="est"><div><span class="sub">${st.n}× ${g.short} · ${g.vcpu * st.n} vCPU · ${g.ram * st.n} GB RAM · ${g.mem * st.n} GB VRAM · ${ZONES[st.region].name}</span><br><b>${money(total)}/hr</b> <span class="sub">≈ ${money(total * 730)}/month · wallet ${money(S.wallet)}</span></div><div><button class="btn" id="lc">Cancel</button> <button class="btn primary" id="lok" ${ok ? '' : 'disabled'}>Launch</button></div></div>`);
    document.querySelectorAll('[data-g]').forEach(o => o.onclick = () => { if (o.classList.contains('dis')) return toast(GPUS[o.dataset.g].short + ' is coming soon'); sync(); st.gpu = o.dataset.g; draw(); });
    document.querySelectorAll('[data-z]').forEach(o => o.onclick = () => { if (o.classList.contains('dis')) return toast('No capacity in ' + ZONES[o.dataset.z].name); sync(); st.region = o.dataset.z; draw(); });
    $('#ln').onchange = () => { sync(); draw(); };
    $('#lc').onclick = closeModal;
    $('#lok').onclick = () => {
      sync(); if (!S.keys.length) return toast('Add an SSH key first');
      if (S.wallet < total) return toast('Insufficient wallet balance - add funds');
      const nm = st.name.trim() || 'gpu-vm-' + uid(); closeModal();
      const vm = { id: 'vm-' + uid(), name: nm, gpu: st.gpu, gpuCount: st.n, region: st.region, status: 'pending', image: st.image, disk: st.disk, ip: '-', created: Date.now(), accrued: 0, load: rnd(.35, .9), hist: null };
      S.vms.unshift(vm); logEv(`Launching ${nm} (${st.n}× ${g.short}) in ${ZONES[st.region].name}`); save(); toast('Launching ' + nm + '…'); refresh();
      setTimeout(() => { vm.status = 'running'; vm.ip = ip(); logEv(nm + ' is running', 'ok'); save(); toast(nm + ' is running'); refresh(); }, 2500);
    };
  };
  draw();
}

/* ---------- loop & boot ---------- */
function tick() {
  const now = Date.now();
  S.vms.forEach(v => {
    if (v.status === 'terminated') return;
    if (v.status === 'running') { v.load = clamp(v.load + rnd(-.04, .04), .15, .98); const inc = rate(v) * (2 / 3600) * 30; v.accrued += inc; S.wallet = Math.max(0, S.wallet - inc); }
    push(v, hist(v), now);
  });
  S.daily[S.daily.length - 1] = +(S.daily[S.daily.length - 1] + running().reduce((a, v) => a + rate(v), 0) * (2 / 3600) * 30).toFixed(2);
  if (!document.activeElement || document.activeElement.tagName !== 'INPUT') refresh(false);
}
function applyTheme() { document.documentElement.dataset.theme = S.theme; }
$('#launchBtn').onclick = () => launchDialog();
$('#themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); refresh(); if (drawerVm) renderDrawer(true); };
window.addEventListener('resize', () => Object.values(charts).forEach(c => c.c.resize()));
// Subtle press feedback only (no hover scaling) - enterprise-grade restraint
const PRESS = '.btn:not(:disabled), .opt';
const unpress = e => { const t = e.target.closest(PRESS); if (t && !reduce) animate(t, { scale: 1 }, { duration: 0.12, ease: 'easeOut' }); };
document.addEventListener('pointerdown', e => { const t = e.target.closest(PRESS); if (t && !reduce) animate(t, { scale: 0.98 }, { duration: 0.08 }); });
document.addEventListener('pointerup', unpress); document.addEventListener('pointerout', unpress);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });
{ const [hv, ht] = location.hash.slice(1).split(','); if (ht) S.theme = ht; applyTheme(); renderAll(); updateStatus(); if (views[hv]) document.getElementById('sec-' + hv)?.scrollIntoView(); if (hv === 'drawer') openDrawer(S.vms[0].id); }
 setInterval(tick, 2000); setInterval(save, 10000);
})();
