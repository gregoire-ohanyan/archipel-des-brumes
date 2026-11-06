// L'Archipel des Brumes — interface
(function () {
'use strict';
const E = window.ARCHIPEL, D = E.D;
const { GOODS, G, RECIPES, STRATA, STRATA_NAMES, ISLANDS, I, FACTIONS, OPTION_GOODS, OPTION_SIZE, STAGES, ROLE_NAMES, STYLE_NAMES, TRAITS } = D;
const SAVE_KEY = 'archipel-des-brumes-v1';
const HOURS_PER_SEC = 24 / 20; // une journée = 20 s à vitesse 1

const ui = {
  sel: 'port', tab: 'bourse', good: null, speed: 0, lastSpeed: 1, acc: 0, modalQueue: [], dirty: true, lastRender: 0,
  form: { qty: 10, price: '', from: null, to: null, mode: 'fret', shipId: null, escort: false, smuggle: false, cargo: {},
    optGood: 'cereales', optExp: 0, optN: 1, rIsl: 'port', rGood: 'rations', rDir: 1, don: 200, fadIsl: 'port', fadGood: 'lanterne', wRecipe: 'farine' },
};
const S = () => E.S;
const P = () => E.S.player;
const PA = () => E.S.accounts.player;

// ---------------------------------------------------------------- formats
const fmt = x => (x == null || isNaN(x)) ? '—' : Math.round(x).toLocaleString('fr-FR');
const fp = x => x == null || isNaN(x) ? '—' : (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x).toLocaleString('fr-FR')).replace('.', ',');
const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + ' %';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

function dateStr() {
  const gd = E.gday(), si = E.seasonIdx();
  return `An ${E.year()} · ${D.SEASONS[si]} · jour ${(((gd % 90) + 90) % 90) + 1}`;
}

// ---------------------------------------------------------------- notifications
function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 3800);
}
function act(res) {
  if (!res) return;
  toast(res.msg, !res.ok);
  ui.dirty = true;
  render(true);
}
function pumpAlerts() {
  const al = S().alerts;
  if (!al.length) return;
  S().alerts = [];
  al.forEach(a => {
    if (a.pause) ui.modalQueue.push(a);
    else toast(a.title ? `${a.title} — ${a.text}` : a.text);
  });
  if (ui.modalQueue.length && !$('modal').classList.contains('on')) {
    if (ui.speed > 0) { ui.lastSpeed = ui.speed; setSpeed(0); }
    showAlert();
  }
}
function showAlert() {
  const a = ui.modalQueue.shift();
  if (!a) { closeModal(); return; }
  const more = ui.modalQueue.length;
  openModal(`<div class="kicker">Jour ${E.gday()} · ${esc(a.cat || 'nouvelle')}</div><h1>${esc(a.title)}</h1><p>${esc(a.text)}</p>
    <div class="actions">${more ? `<button class="btn" data-act="alert-all">Tout passer (${more})</button><button class="btn" data-act="alert-next">Suivante</button>` : ''}
    <button class="btn primary" data-act="alert-resume">Reprendre</button></div>`);
}
function openModal(html, wide) { $('modal').innerHTML = `<div class="box${wide ? ' wide' : ''}">${html}</div>`; $('modal').classList.add('on'); }
function closeModal() { $('modal').classList.remove('on'); $('modal').innerHTML = ''; }

// ---------------------------------------------------------------- sauvegarde
function save(silent) {
  try { localStorage.setItem(SAVE_KEY, E.save()); if (!silent) toast('Partie sauvegardée dans ce navigateur.'); }
  catch (e) { if (!silent) toast("Sauvegarde impossible dans ce navigateur.", true); }
}
function loadSave() {
  try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; E.load(JSON.parse(s)); return true; }
  catch (e) { return false; }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

// ---------------------------------------------------------------- vitesse & boucle
function setSpeed(v) {
  ui.speed = v;
  document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
}
let lastT = performance.now(), lastDay = -1;
function frame(t) {
  const dt = Math.min(0.25, (t - lastT) / 1000);
  lastT = t;
  if (S() && ui.speed > 0 && !$('modal').classList.contains('on')) {
    ui.acc += dt * ui.speed * HOURS_PER_SEC;
    let n = 0;
    while (ui.acc >= 1 && n < 60) { E.tick(); ui.acc -= 1; n++; }
    if (n) {
      ui.dirty = true;
      pumpAlerts();
      if (E.day() !== lastDay) { lastDay = E.day(); if (E.gday() % 5 === 0) save(true); }
    }
  }
  if (S()) {
    drawShips();
    if (ui.dirty && t - ui.lastRender > 450) render();
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- carte
const NS = 'http://www.w3.org/2000/svg';
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function blob(cx, cy, r, seed) {
  const n = 16, pts = [];
  let h = seed;
  const rnd = () => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; };
  const k1 = rnd() * 6.28, k2 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const rr = r * (1 + 0.16 * Math.sin(a * 2 + k1) + 0.1 * Math.sin(a * 3 + k2) + (rnd() - 0.5) * 0.22);
    pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.85]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
const RAW_ICON = { cereales: 'blé', poisson: 'poisson', bois: 'bois', minerai: 'fer', houille: 'houille', sel: 'sel', cristal: 'cristal', champignon: 'champignons' };
// en portrait sur téléphone, la carte pivote d'un quart de tour pour remplir l'écran
function mp(x, y) { return ui.portrait ? [700 - y, x] : [x, y]; }
function PI(id) { const i = I[id]; const [x, y] = mp(i.x, i.y); return Object.assign({}, i, { x, y }); }
function islR(i) { return (24 + i.pop.reduce((a, b) => a + b, 0) / 280) * (ui.portrait ? 1.25 : 1); }
function buildMap() {
  const svg = $('map');
  const W = ui.portrait ? 700 : 1000, H = ui.portrait ? 1000 : 700;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const fog = (cx, cy, rx, ry, cls, op) => { const [x, y] = mp(cx, cy); return `<ellipse class="${cls}" cx="${x}" cy="${y}" rx="${ui.portrait ? ry : rx}" ry="${ui.portrait ? rx : ry}" fill="#e8f0ec" filter="url(#soft)" opacity="${op}"/>`; };
  const [cpx, cpy] = ui.portrait ? [620, 930] : [925, 610];
  let h = `<defs>
    <radialGradient id="seaG" cx="45%" cy="45%" r="75%"><stop offset="0" stop-color="#2c626a"/><stop offset=".6" stop-color="#1d4a51"/><stop offset="1" stop-color="#11292d"/></radialGradient>
    <pattern id="waves" width="46" height="22" patternUnits="userSpaceOnUse"><path d="M0 11 q11.5 -7 23 0 t23 0" fill="none" stroke="rgba(220,235,230,.06)" stroke-width="1.2"/></pattern>
    <radialGradient id="landG" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="#e9d9ad"/><stop offset=".7" stop-color="#cdb684"/><stop offset="1" stop-color="#a88f5e"/></radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="shore" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feColorMatrix in="n" type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .07"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#seaG)"/><rect width="${W}" height="${H}" fill="url(#waves)"/>
  <g id="routes"></g>
  <g id="islands"></g>
  <g id="ships"></g>
  <g pointer-events="none" opacity=".5">
    ${fog(560, 640, 230, 70, 'fog', .5)}${fog(330, 560, 170, 55, 'fog b', .35)}${fog(700, 580, 150, 45, 'fog', .3)}${fog(640, 280, 120, 40, 'fog b', .18)}
  </g>
  <g transform="translate(${cpx},${cpy}) rotate(${ui.portrait ? 90 : 0})" opacity=".75" pointer-events="none">
    <circle r="34" fill="none" stroke="#d8b26a" stroke-width="1"/><circle r="26" fill="none" stroke="#d8b26a" stroke-width=".6" stroke-dasharray="2 3"/>
    <path d="M0 -40 L6 0 L0 40 L-6 0Z" fill="#d8b26a"/><path d="M-40 0 L0 6 L40 0 L0 -6Z" fill="#a88a4f"/>
    <text y="-44" text-anchor="middle" font-family="Cinzel" font-size="12" fill="#d8b26a" transform="rotate(${ui.portrait ? -90 : 0} 0 -48)">N</text>
  </g>
  <text x="24" y="38" font-family="Cinzel" font-size="22" fill="rgba(240,226,190,.55)" letter-spacing="4">L'ARCHIPEL DES BRUMES</text>`;
  svg.innerHTML = h;
  // îles
  let isl = '';
  ISLANDS.map(z => PI(z.id)).forEach(i => {
    const r = islR(i);
    const d = blob(i.x, i.y, r, hash(i.id));
    isl += `<g class="isl" data-act="sel-isl" data-isl="${i.id}"><circle cx="${i.x}" cy="${i.y + 12}" r="${r * 2}" fill="transparent"/>
      <path d="${d}" transform="translate(0,4)" fill="rgba(0,0,0,.3)" filter="url(#shore)"/>
      <path d="${blob(i.x, i.y, r * 1.18, hash(i.id))}" fill="rgba(170,210,200,.18)"/>
      <path class="land" d="${d}" fill="url(#landG)" stroke="#6b5532" stroke-width="1.4" filter="url(#paper)"/>
      <circle id="sel-${i.id}" cx="${i.x}" cy="${i.y}" r="${r * 1.55}" fill="none" stroke="#f3d48a" stroke-width="2" stroke-dasharray="5 5" opacity="0"/>
      <text class="isl-label" x="${i.x}" y="${i.y + r * 0.85 + (ui.portrait ? 30 : 22)}" text-anchor="middle">${esc(i.name)}</text>
      <text class="isl-sub" id="sub-${i.id}" x="${i.x}" y="${i.y + r * 0.85 + (ui.portrait ? 52 : 38)}" text-anchor="middle"></text>
      <g id="mk-${i.id}"></g>
    </g>`;
  });
  $('islands').innerHTML = isl;
}
function drawRoutes() {
  let h = '';
  Object.values(E.ROUTE_INFO).forEach(r => {
    const a = PI(r.a), b = PI(r.b);
    const emb = E.embargoed(r.a, r.b);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${emb ? '#e07a62' : 'rgba(240,222,180,.32)'}" stroke-width="${emb ? 2 : 1.4}" stroke-dasharray="${emb ? '3 5' : '6 7'}"/>
      <g transform="translate(${mx},${my})"><rect x="-14" y="-9" width="28" height="17" rx="8" fill="rgba(15,34,38,.75)" stroke="rgba(216,178,106,.45)"/>
      <text y="4" text-anchor="middle" font-size="11.5" fill="${emb ? '#f0a08c' : '#e8dbbb'}" font-family="EB Garamond">${emb ? '✕' : r.days + ' j'}</text></g>`;
  });
  $('routes').innerHTML = h;
}
function drawMarkers() {
  ISLANDS.map(z => PI(z.id)).forEach(i => {
    const st = S().isl[i.id], r = islR(i);
    $('sel-' + i.id).setAttribute('opacity', ui.sel === i.id ? 1 : 0);
    const pres = E.present(i.id);
    const raws = Object.keys(i.raw).map(g => RAW_ICON[g]).join(', ');
    $('sub-' + i.id).textContent = raws || 'finance et commerce';
    let m = '';
    let x = i.x + r * 1.05, y = i.y - r * 0.85;
    if (pres) m += `<g transform="translate(${x},${y})"><circle r="11" fill="#b0843a" stroke="#2a1d12" stroke-width="1.5"/><text y="4.5" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="12" fill="#1c140c">C</text><title>Votre comptoir</title></g>`;
    else {
      const d = E.infoDelay(i.id);
      m += `<g transform="translate(${x},${y})"><rect x="-17" y="-10" width="34" height="19" rx="9" fill="rgba(232,240,236,.85)" stroke="#6d8a8c"/><text y="4" text-anchor="middle" font-size="12" fill="#2f4d52" font-family="EB Garamond">${d} j</text><title>Vos nouvelles de cette île ont ${d} jour(s) de retard</title></g>`;
    }
    let bx = i.x - r * 1.15;
    const badge = (txt, col, title) => { m += `<g transform="translate(${bx},${y})"><circle r="10" fill="${col}" stroke="#1b2e31" stroke-width="1"/><text y="4" text-anchor="middle" font-size="11" fill="#fff" font-family="EB Garamond" font-weight="700">${txt}</text><title>${esc(title)}</title></g>`; bx -= 23; };
    if (E.striking(i.id)) badge('G', '#9a2f22', 'Grève en cours');
    if (st.fads.some(f => f.until > E.gday())) badge('★', '#a77c1c', 'Une mode fait rage');
    if (st.suspicion > 60) badge('!', '#6b2a8a', 'Enquête sur vos affaires');
    if (P().informants.includes(i.id) && !pres) badge('i', '#2d6474', 'Informateur');
    $('mk-' + i.id).innerHTML = m;
  });
}
const shipEls = new Map();
function shipPos(sh) {
  const now = S().hour + ui.acc;
  const p = Math.max(0, Math.min(1, (now - sh.dep) / Math.max(1, sh.arr - sh.dep)));
  const nodes = sh.nodes;
  const segs = [];
  let tot = 0;
  for (let k = 0; k < nodes.length - 1; k++) { const d = E.ROUTE_INFO[E.rkey(nodes[k], nodes[k + 1])].days; segs.push(d); tot += d; }
  let t = p * tot, k = 0;
  while (k < segs.length - 1 && t > segs[k]) { t -= segs[k]; k++; }
  const f = segs.length ? t / segs[k] : 1;
  const a = PI(nodes[k]), b = PI(nodes[Math.min(k + 1, nodes.length - 1)]);
  const off = ((sh.id * 7919) % 17) - 8;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return { x: a.x + (b.x - a.x) * f - Math.sin(ang) * off, y: a.y + (b.y - a.y) * f + Math.cos(ang) * off, ang: ang * 180 / Math.PI };
}
function drawShips() {
  const g = $('ships');
  if (!g) return;
  const seen = new Set();
  S().shipments.forEach(sh => {
    seen.add(sh.id);
    let el = shipEls.get(sh.id);
    if (!el) {
      el = document.createElementNS(NS, 'g');
      if (sh.owner === 'cab') el.innerHTML = `<circle r="2.2" fill="rgba(240,226,190,.55)"/>`;
      else if (sh.owner === 'player') el.innerHTML = `<g class="hull"><path d="M-11,-4 L8,-4 L13,0 L8,4 L-11,4 Z" fill="#8f2b1e" stroke="#f6e3b5" stroke-width="1.2"/><path d="M-3,-4 L-3,-15 L6,-6 Z" fill="#f6e3b5"/></g><title>Votre navire</title>`;
      else el.innerHTML = `<g class="hull"><path d="M-8,-3 L6,-3 L10,0 L6,3 L-8,3 Z" fill="#5a3d22" stroke="#e7d3a6" stroke-width=".8"/><path d="M-2,-3 L-2,-11 L5,-4 Z" fill="#e7d3a6" opacity=".9"/></g><title>${esc(sh.npc ? S().npcs[sh.npc].name : '')}</title>`;
      g.appendChild(el); shipEls.set(sh.id, el);
    }
    const p = shipPos(sh);
    el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    const hull = el.querySelector('.hull');
    if (hull) hull.setAttribute('transform', `rotate(${p.ang.toFixed(0)}) ${Math.abs(p.ang) > 90 ? 'scale(1,-1)' : ''}`);
  });
  for (const [id, el] of shipEls) if (!seen.has(id)) { el.remove(); shipEls.delete(id); }
}

// ---------------------------------------------------------------- mode téléphone
const isM = () => window.matchMedia('(max-width: 760px), (max-height: 520px) and (pointer: coarse)').matches;
ui.mview = 'carte';
function applyMobile(force) {
  const m = isM();
  document.body.classList.toggle('m', m);
  document.body.dataset.view = ui.mview;
  const portrait = m && window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', portrait);
  if (portrait !== ui.portrait || force) {
    ui.portrait = portrait;
    buildMap(); shipEls.forEach(el => el.remove()); shipEls.clear(); ui.routesDay = null;
    if (S()) render(true);
  }
}
function setView(v, tab) {
  if (tab) ui.tab = tab;
  ui.mview = v;
  document.body.dataset.view = v;
  if (v === 'panel') $('panel').scrollTop = 0;
  render(true);
}
function renderMobile() {
  if (!isM()) return;
  document.querySelectorAll('#bnav button').forEach(b => {
    const v = b.dataset.v;
    b.classList.toggle('on', v === 'carte' ? ui.mview === 'carte' : v === 'plus' ? (ui.mview === 'journal' || (ui.mview === 'panel' && !['bourse', 'navigation', 'entrepots'].includes(ui.tab))) : (ui.mview === 'panel' && ui.tab === v));
  });
  const i = I[ui.sel], pres = E.present(ui.sel);
  const raws = Object.keys(i.raw).map(g => G[g].name.toLowerCase()).join(', ') || 'finance et commerce';
  $('mcard').innerHTML = `<div><b>${esc(i.name)}</b> <span class="note">· ${esc(raws)}</span><br><span class="note">${pres ? 'Votre comptoir · bourse en direct' : `Pas de comptoir · nouvelles vieilles de ${E.infoDelay(ui.sel)} j`}</span></div>
    <button class="btn primary" data-act="mnav" data-v="bourse">Bourse ›</button>`;
  const n = S().journal.length;
  const badge = $('jbadge'); if (badge) { const unread = Math.max(0, n - (ui.jSeen || 0)); badge.textContent = unread ? Math.min(99, unread) : ''; badge.style.display = unread && ui.mview !== 'journal' ? '' : 'none'; }
  if (ui.mview === 'journal') ui.jSeen = n;
}
function moreSheet() {
  const items = [['influence', 'Influence', 'Réputation, contrats, personnages'], ['conseils', 'Conseils', 'Votes et lois des îles'], ['rumeurs', 'Rumeurs', 'Ce qui se murmure'],
    ['ateliers', 'Ateliers', P().unlocked[3] ? 'Transformer des biens' : 'Stade Manufacturier'], ['options', 'Options', P().unlocked[4] ? 'Parier sur les prix' : 'Stade Spéculateur']];
  openModal(`<div class="kicker">Menu</div><h1>Plus</h1><div class="sheet">
    ${items.map(([t, n, d]) => `<button class="sheet-item" data-act="mnav" data-v="${t}"><b>${n}</b><span>${d}</span></button>`).join('')}
    <button class="sheet-item" data-act="mnav" data-v="journal"><b>Journal de bord</b><span>Tout ce qui vous est arrivé</span></button>
    </div><div class="actions"><button class="btn primary" data-act="close">Fermer</button></div>`);
}
function menuSheet() {
  openModal(`<div class="kicker">Votre compagnie</div><h1>${esc(STAGES[P().stage - 1].name)}</h1>
    <div class="kv" style="font-size:16px"><span>Sceaux ${q('sceaux')}</span><b>${fmt(PA().cash)} §</b><span>Valeur nette ${q('valeur')}</span><b>${fmt(E.netWorth())} §</b><span>Prestige ${q('prestige')}</span><b>${E.prestige()}</b><span>Date ${q('saisons')}</span><b>${dateStr()}</b></div>
    <div class="sheet" style="margin-top:14px">
      <button class="sheet-item" data-act="stage-info"><b>Progression</b><span>Les stades et leurs conditions</span></button>
      <button class="sheet-item" data-act="help"><b>Aide</b><span>Comment jouer, glossaire</span></button>
      <button class="sheet-item" data-act="save"><b>Sauvegarder</b><span>La partie est aussi sauvée tous les 5 jours</span></button>
      <button class="sheet-item" data-act="newgame-ask"><b>Nouvelle partie</b><span>Recommencer de zéro</span></button>
    </div><div class="actions"><button class="btn primary" data-act="close">Fermer</button></div>`);
}

// ---------------------------------------------------------------- en-tête
function renderTop() {
  const gd = E.gday();
  const nw = E.netWorth();
  $('date').innerHTML = `<b>${dateStr()}</b><div class="bar"><i style="width:${((((gd % 90) + 90) % 90) + 1) / 90 * 100}%"></i></div>`;
  $('cash').textContent = fmt(PA().cash) + ' §';
  $('nw').textContent = fmt(nw) + ' §';
  $('prest').textContent = E.prestige();
  $('stage').textContent = STAGES[P().stage - 1].name;
}

// ---------------------------------------------------------------- journal
let jLen = -1, jLast = null;
function renderJournal() {
  const j = S().journal;
  const last = j[j.length - 1];
  if (j.length === jLen && last === jLast) return;
  jLen = j.length; jLast = last;
  $('jlist').innerHTML = j.slice(-80).reverse().map(e => `<li class="c-${e.cat}"><span class="d">j${e.d}</span>${esc(e.text)}</li>`).join('');
}

// ---------------------------------------------------------------- onglets
const TABS = [
  { id: 'bourse', name: 'Bourse' }, { id: 'entrepots', name: 'Comptoirs' }, { id: 'navigation', name: 'Navigation' },
  { id: 'ateliers', name: 'Ateliers', stage: 3 }, { id: 'options', name: 'Options', stage: 4 },
  { id: 'influence', name: 'Influence' }, { id: 'conseils', name: 'Conseils' }, { id: 'rumeurs', name: 'Rumeurs' },
];
function renderTabs() {
  $('tabs').innerHTML = TABS.map(t => {
    const locked = t.stage && !P().unlocked[t.stage];
    return `<button class="${ui.tab === t.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="tab" data-tab="${t.id}">${t.name}${locked ? '<span class="lock">🔒</span>' : ''}</button>`;
  }).join('');
}

function render(force) {
  ui.lastRender = performance.now();
  renderTop(); renderJournal(); drawMarkers(); renderMobile();
  if (ui.routesDay !== E.gday()) { drawRoutes(); ui.routesDay = E.gday(); }
  const ae = document.activeElement;
  if (!force && ae && $('panel').contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) { updateTrade(); return; }
  ui.dirty = false;
  renderTabs();
  const fn = { bourse: pBourse, entrepots: pEntrepots, navigation: pNavigation, ateliers: pAteliers, options: pOptions, influence: pInfluence, conseils: pConseils, rumeurs: pRumeurs }[ui.tab];
  const scroll = $('panel').scrollTop;
  tutoAdvance();
  $('panel').innerHTML = tutoCard() + fn();
  $('panel').scrollTop = scroll;
}

// ---------------------------------------------------------------- aide contextuelle
const GD = window.ARCHIPEL_GUIDE;
const q = k => `<button class="qm" data-act="explain" data-k="${k}" aria-label="Explication" title="${esc(GD.GLOSS[k] ? GD.GLOSS[k][0] : '')}">?</button>`;
function explain(k) {
  const e = GD.GLOSS[k]; if (!e) return;
  if (ui.speed) { ui.lastSpeed = ui.speed; setSpeed(0); ui.resumeAfter = true; }
  openModal(`<div class="kicker">Explication</div><h1>${esc(e[0])}</h1><p>${esc(e[1])}</p><div class="actions"><button class="btn" data-act="help">Aide complète</button><button class="btn primary" data-act="close">Compris</button></div>`);
}
function tuto() {
  const pl = P();
  if (!pl.tuto) pl.tuto = { step: 0, hidden: false, sold: false };
  return pl.tuto;
}
function tutoDone(k) {
  const a = PA(), t = tuto();
  const shipping = S().shipments.some(x => x.owner === 'player');
  const psPort = E.stockOf(a, 'port', 'poisson_sale') > 0;
  switch (k) {
    case 0: return ui.good === 'poisson_sale' || E.present('cora');
    case 1: return E.present('cora');
    case 2: return E.stockOf(a, 'cora', 'poisson_sale') > 0 || shipping || psPort || t.sold;
    case 3: return shipping || psPort || t.sold;
    case 4: return psPort || t.sold;
    case 5: return t.sold;
  }
  return false;
}
function tutoAdvance() {
  const t = tuto();
  let moved = false;
  while (t.step < GD.TUTO.length - 1 && tutoDone(t.step)) { t.step++; moved = true; }
  if (moved && !t.hidden) toast(t.step >= GD.TUTO.length - 1 ? 'Bravo, premier circuit bouclé !' : 'Bien joué ! Étape suivante : ' + GD.TUTO[t.step].t);
}
function tutoCard() {
  const t = tuto();
  if (t.hidden) return '';
  const st = GD.TUTO[t.step], n = GD.TUTO.length;
  return `<div class="guide"><div class="gh"><span class="kicker">Premiers pas · étape ${t.step + 1} sur ${n}</span><button class="link" data-act="tuto-hide">Masquer le guide</button></div>
    <b>${esc(st.t)}</b><p>${esc(st.x)}</p><div class="row-flex">${st.show ? `<button class="btn small primary" data-act="tuto-show">Me montrer</button>` : `<button class="btn small primary" data-act="tuto-end">Terminer le guide</button>`}</div></div>`;
}
function tutoShow() {
  const sh = GD.TUTO[tuto().step].show; if (!sh) return;
  if (sh === 'speed') { setSpeed(1); ui.lastSpeed = 1; if (isM()) setView('carte'); toast('Le temps passe. Le convoi avance sur la carte.'); return; }
  if (sh.startsWith('nav:')) { ui.tab = 'navigation'; ui.form.from = sh.slice(4); ui.form.to = 'port'; ui.form.cargo = {}; if (isM()) ui.mview = 'panel'; render(true); $('panel').scrollTop = 0; return; }
  const [isl, g] = sh.split(':');
  ui.sel = isl; ui.tab = 'bourse'; ui.good = g || null; ui.form.bq = 10; ui.form.sq = null;
  if (isM()) ui.mview = 'panel';
  render(true); $('panel').scrollTop = 0;
}

// ---------------------------------------------------------------- utilitaires de vue
function sentBar(v) {
  const w = Math.abs(v) / 100 * 23;
  return `<span class="sent" title="Sentiment ${Math.round(v)}"><i style="left:${v >= 0 ? 23 : 23 - w}px;width:${w}px;background:${v >= 0 ? '#4d6a37' : '#9a2f22'}"></i><i style="left:22.5px;width:1px;background:#5b4630"></i></span>`;
}
function bar(v, cls) { return `<div class="bar ${cls || (v < 0.4 ? 'bad' : v < 0.65 ? 'warn' : '')}"><i style="width:${Math.max(2, Math.min(100, v * 100))}%"></i></div>`; }
function lockBox(stage) {
  const st = STAGES[stage - 1];
  return `<div class="locked-box"><div class="seal">⚜</div><h2>Réservé au stade ${st.name}</h2><p>Condition : ${esc(st.need)}.</p><p class="note">Stade actuel : ${STAGES[P().stage - 1].name}.</p></div>`;
}
function chart(values, opt) {
  opt = opt || {};
  const W = 520, H = opt.h || 130, pad = 4;
  if (!values || values.length < 2) return '<p class="note">Pas encore d\'historique.</p>';
  const v = values.slice(-(opt.n || 90));
  let lo = Math.min(...v), hi = Math.max(...v);
  if (opt.base) { lo = Math.min(lo, opt.base); hi = Math.max(hi, opt.base); }
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const X = k => pad + k / (v.length - 1) * (W - pad * 2 - 46), Y = y => pad + (1 - (y - lo) / (hi - lo)) * (H - pad * 2 - 14);
  const pts = v.map((y, k) => `${X(k).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const last = v[v.length - 1];
  const baseLine = opt.base ? `<line x1="${pad}" x2="${W - 50}" y1="${Y(opt.base)}" y2="${Y(opt.base)}" stroke="#8a7253" stroke-dasharray="3 4" stroke-width="1"/><text x="${W - 46}" y="${Y(opt.base) + 4}" font-size="11" fill="#8a7253">base ${fp(opt.base)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    <polygon points="${X(0)},${H - 14} ${pts} ${X(v.length - 1)},${H - 14}" fill="rgba(176,132,58,.16)"/>
    ${baseLine}
    <polyline points="${pts}" fill="none" stroke="${opt.color || '#7b5823'}" stroke-width="1.8"/>
    <circle cx="${X(v.length - 1)}" cy="${Y(last)}" r="3" fill="${opt.color || '#7b5823'}"/>
    <text x="${X(v.length - 1) + 6}" y="${Y(last) + 4}" font-size="12.5" font-weight="700" fill="#2f2216">${fp(last)}</text>
    <text x="${pad}" y="${H - 2}" font-size="11" fill="#8a7253">il y a ${v.length - 1} j</text>
    <text x="${W - 50}" y="${H - 2}" font-size="11" fill="#8a7253" text-anchor="end">${opt.label || "aujourd'hui"}</text>
    <text x="${pad}" y="12" font-size="11" fill="#8a7253">max ${fp(hi)}</text>
  </svg>`;
}
function islOptions(sel, filter) {
  return ISLANDS.filter(i => !filter || filter(i.id)).map(i => `<option value="${i.id}" ${sel === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
}
function goodOptions(sel, list) { return (list || GOODS.map(g => g.id)).map(g => `<option value="${g}" ${sel === g ? 'selected' : ''}>${esc(G[g].name)}</option>`).join(''); }
function walkBook(isl, g, side, qty) {
  const arr = side === 'buy' ? S().books[isl][g].asks : S().books[isl][g].bids;
  let left = qty, cost = 0;
  for (const o of arr) { if (o.a === 'player') continue; const q = Math.min(left, o.qty); cost += q * o.price; left -= q; if (left <= 0) break; }
  const filled = qty - left;
  return { filled, avg: filled ? cost / filled : null, cost };
}

// ---------------------------------------------------------------- BOURSE
function pBourse() {
  const isl = ui.sel, i = I[isl], st = S().isl[isl], pres = E.present(isl);
  const info = E.knownSnap(isl);
  let h = `<h2>${esc(i.name)}</h2><p class="sub">${esc(i.desc)}</p><div class="chips">`;
  h += pres ? `<span class="chip green">Comptoir : bourse en direct ${q('comptoir')}</span>` : `<span class="chip blue">Nouvelles vieilles de ${info.delay} j ${q('nouvelles')}</span>`;
  h += `<span class="chip">Taxe de bourse ${(st.tax * 100).toFixed(1).replace('.', ',')} % ${q('taxe')}</span><span class="chip">Salaire ${fp(st.wage)} §/j ${q('salaire')}</span>`;
  const pop = STRATA.reduce((a, s) => a + st.strata[s].pop, 0);
  h += `<span class="chip">${fmt(pop)} habitants</span>`;
  if (E.striking(isl)) h += `<span class="chip red">Grève en cours ${q('greve')}</span>`;
  st.fads.filter(f => f.until > E.gday()).forEach(f => { h += `<span class="chip gold">Mode : ${esc(G[f.g].name)} ${q('mode')}</span>`; });
  Object.keys(st.banned).forEach(g => { h += `<span class="chip red">Interdit : ${esc(G[g].name)} ${q('interdit')}</span>`; });
  Object.keys(st.tariffs).forEach(g => { h += `<span class="chip">Droits 15 % : ${esc(G[g].name)} ${q('droits')}</span>`; });
  S().embargos.filter(e => e.until > E.gday() && (e.a === isl || e.b === isl)).forEach(e => { h += `<span class="chip red">Embargo ${esc(I[e.a === isl ? e.b : e.a].name)} ${q('embargo')}</span>`; });
  if ((P().banUntil[isl] || -1) > E.gday()) h += `<span class="chip red">Vous êtes exclu de cette bourse</span>`;
  h += `</div>`;
  if (pres) {
    h += `<div class="grid2" style="margin-bottom:6px">` + STRATA.map(s => `<div><div class="row-flex" style="justify-content:space-between;font-size:13px"><span>${STRATA_NAMES[s]}</span><span class="muted">${fmt(st.strata[s].pop)} · ${Math.round(st.strata[s].sat * 100)} %</span></div>${bar(st.strata[s].sat)}</div>`).join('') + `</div><p class="note" style="margin-top:2px">${q('satisfaction')} Satisfaction des besoins par couche sociale. En dessous de 45 % chez les manouvriers, la grève menace.</p>`;
  } else {
    h += `<div class="card hl"><b>Vous n'avez pas de comptoir ici.</b> Les prix ci-dessous datent d'il y a ${info.delay} jour(s). Pour commercer et voir la bourse en direct, ouvrez un comptoir.
      <div class="row-flex" style="margin-top:8px"><button class="btn primary" data-act="open-cpt" data-isl="${isl}">Ouvrir un comptoir (${E.COSTS.comptoir} § + ${E.COSTS.comptoirDay} §/j)</button>
      ${P().unlocked[2] && !P().informants.includes(isl) ? `<button class="btn" data-act="hire-inf" data-isl="${isl}">Engager un informateur (${E.COSTS.informant} § + ${E.COSTS.informantDay} §/j)</button>` : ''}</div></div>`;
  }
  if (ui.good) h += pDetail(isl, ui.good, pres, info);
  else h += `<p class="hint">👉 Cliquez sur un bien pour l'acheter ou le vendre.</p>`;
  h += `<table class="t"><thead><tr><th>Bien</th><th class="n">Prix ${q('prix')}</th><th class="n hide-m">5 j ${q('cinqj')}</th>${pres ? `<th class="n">Vous achetez à ${q('achetez')}</th><th class="n">Vous vendez à ${q('vendez')}</th>` : ''}<th class="n">Votre stock ${q('stock')}</th><th class="hide-m" title="Euphorie à droite, peur à gauche">Humeur ${q('humeur')}</th></tr></thead><tbody>`;
  let tier = -1;
  GOODS.forEach(g => {
    if (g.tier !== tier) { tier = g.tier; h += `<tr class="tier"><td colspan="7">${['Matières brutes', 'Produits transformés', 'Composants', 'Produits finis'][tier]}</td></tr>`; }
    const b = S().books[isl][g.id];
    const mine = E.stockOf(PA(), isl, g.id);
    let price, ch, vol, bid, ask;
    if (pres) {
      price = b.ema; const hh = b.hist; ch = hh.length > 5 ? price / hh[hh.length - 6] - 1 : 0; vol = b.volEma; bid = E.bestBid(isl, g.id); ask = E.bestAsk(isl, g.id);
    } else if (info.snap) {
      const p = info.snap.p[g.id]; price = p[0];
      const hs = info.hist; const prev = hs.length > 5 ? hs[hs.length - 6].p[g.id][0] : price; ch = price / prev - 1; vol = p[3];
    }
    const banned = st.banned[g.id];
    h += `<tr class="row ${ui.good === g.id ? 'sel' : ''}" data-act="sel-good" data-g="${g.id}"><td>${esc(g.name)}${banned ? ' <span class="tag" style="background:#f0d2c8">interdit</span>' : ''}</td>
      <td class="n"><b>${fp(price)}</b></td><td class="n hide-m ${ch > 0.005 ? 'up' : ch < -0.005 ? 'down' : 'muted'}">${price != null ? pct(ch) : '—'}</td>
      ${pres ? `<td class="n">${fp(ask)}</td><td class="n">${fp(bid)}</td>` : ''}
      <td class="n">${mine ? '<b>' + fmt(mine) + '</b>' : '<span class="muted">·</span>'}</td><td class="hide-m">${pres ? sentBar(b.sent) : ''}</td></tr>`;
  });
  h += `</tbody></table><p class="note">« Vous achetez à » : le prix le moins cher proposé par un vendeur. « Vous vendez à » : le meilleur prix proposé par un acheteur. L'écart entre les deux est normal ${q('ecart')}. Humeur : euphorie à droite, peur à gauche.</p>`;
  const myo = E.playerOrders().filter(o => o.isl === isl);
  if (myo.length) {
    h += `<h4>Vos ordres en attente ici</h4><table class="t"><tbody>` + myo.map(o => `<tr><td>${o.side === 'buy' ? 'Achat' : 'Vente'} ${esc(G[o.g].name)}</td><td class="n">${fmt(o.qty)} à ${fp(o.price)} §</td><td class="n"><button class="btn small" data-act="cancel" data-isl="${o.isl}" data-g="${o.g}" data-id="${o.id}">Annuler</button></td></tr>`).join('') + `</tbody></table>`;
  }
  return h;
}
function maxBuyQty(isl, g) {
  const st = S().isl[isl]; let cash = PA().cash, n = 0;
  for (const o of S().books[isl][g].asks) { if (o.a === 'player') continue; const c = o.price * (1 + st.tax); const k = Math.min(o.qty, Math.floor(cash / c)); n += k; cash -= k * c; if (k < o.qty) break; }
  return n;
}
function gname(g, q) { return G[g].name.toLowerCase(); }
// résumé en clair d'un achat ou d'une vente
function tradeSummary(isl, g, side) {
  const st = S().isl[isl], tax = st.tax;
  if (side === 'buy') {
    const max = maxBuyQty(isl, g);
    if (!S().books[isl][g].asks.some(o => o.a !== 'player')) return { html: `<p class="sum">Personne ne vend de ${gname(g)} ici en ce moment. Revenez plus tard, ou proposez votre prix (option avancée ci-dessous).</p>`, label: 'Acheter', ok: false, q: 0 };
    if (max < 1) return { html: `<p class="sum">Vous n'avez pas assez de Sceaux pour en acheter une seule unité.</p>`, label: 'Acheter', ok: false, q: 0 };
    let q = Math.max(1, Math.min(max, Math.floor(+ui.form.bq || 1)));
    const w = walkBook(isl, g, 'buy', q), total = w.cost * (1 + tax);
    const first = S().books[isl][g].asks.find(o => o.a !== 'player');
    let warn = '';
    if (w.avg > first.price * 1.02) warn = `<p class="warn">Le premier vendeur n'en a que ${fmt(first.qty)} à ${fp(first.price)} § ; les suivants demandent plus cher. Acheter moins à la fois revient moins cher. ${q('profondeur')}</p>`;
    return { q, ok: true, label: `Acheter ${fmt(q)} pour ${fmt(total)} §`,
      html: `<p class="sum">Vous payez <b>${fmt(total)} §</b> pour <b>${fmt(q)}</b> ${gname(g)}, soit ${fp(total / q)} § l'unité taxe comprise. Il vous restera ${fmt(PA().cash - total)} §.</p>${warn}` };
  }
  const have = E.stockOf(PA(), isl, g);
  if (have < 1) return { html: `<p class="sum">Vous n'avez pas de ${gname(g)} dans votre entrepôt de ${esc(I[isl].name)}.</p>`, label: 'Vendre', ok: false, q: 0 };
  if (!S().books[isl][g].bids.some(o => o.a !== 'player')) return { html: `<p class="sum">Aucun acheteur n'attend en ce moment : mettez plutôt en vente ci-dessous.</p>`, label: 'Vendre tout de suite', ok: false, q: 0 };
  let q = Math.max(1, Math.min(have, Math.floor(+(ui.form.sq == null ? have : ui.form.sq) || 1)));
  const w = walkBook(isl, g, 'sell', q), got = w.cost * (1 - tax);
  const first = S().books[isl][g].bids.find(o => o.a !== 'player');
  let warn = '';
  if (w.filled < q) warn = `<p class="warn">Les acheteurs d'ici n'en prennent que ${fmt(w.filled)} aujourd'hui. Le reste ne sera pas vendu.</p>`;
  else if (w.avg < first.price * 0.98) warn = `<p class="warn">Le meilleur acheteur n'en prend que ${fmt(first.qty)} à ${fp(first.price)} § ; les suivants paient moins. Vendre par petits lots, sur plusieurs jours, rapporte plus. ${q('profondeur')}</p>`;
  return { q, ok: w.filled > 0, label: `Vendre tout de suite pour ${fmt(got)} §`,
    html: `<p class="sum">Vous touchez <b>${fmt(got)} §</b> pour <b>${fmt(Math.min(q, w.filled))}</b> ${gname(g)}, soit ${fp(w.filled ? got / w.filled : 0)} § l'unité après taxe. Vous en avez ${fmt(have)} ici.</p>${warn}` };
}
function listPrice(isl, g) {
  const ask = S().books[isl][g].asks.find(o => o.a !== 'player');
  return Math.round((ask ? Math.min(ask.price * 0.98, S().books[isl][g].ema * 1.15) : S().books[isl][g].ema) * 100) / 100;
}
function listSummary(isl, g) {
  const have = E.stockOf(PA(), isl, g);
  const q = Math.max(1, Math.min(have, Math.floor(+(ui.form.sq == null ? have : ui.form.sq) || 1)));
  const p = +String(ui.form.sp || listPrice(isl, g)).replace(',', '.') || listPrice(isl, g);
  const b = S().books[isl][g], ask = b.asks.find(o => o.a !== 'player');
  const vol = Math.max(1, Math.round(b.volEma));
  let pos = !ask || p <= ask.price ? `Ce sera l'offre la moins chère de l'île : les habitants et les marchands l'achèteront en priorité.` : `D'autres vendent moins cher (${fp(ask.price)} §) : ils passeront avant vous.`;
  return { q, p, label: `Mettre en vente ${fmt(q)} à ${fp(p)} §`,
    html: `<p class="note">${pos} Ici, il s'en échange environ ${fmt(vol)} par jour : comptez ${q <= vol ? 'quelques heures' : 'environ ' + Math.ceil(q / vol) + ' jours'} pour tout vendre. Rapport attendu : ${fmt(q * p * (1 - S().isl[isl].tax))} § après taxe. Vous pourrez annuler l'offre.</p>` };
}
function updateTrade() {
  const box = document.querySelector('.trade2'); if (!box) return;
  const isl = ui.sel, g = ui.good;
  ['buy', 'sell'].forEach(side => {
    const r = tradeSummary(isl, g, side);
    const sum = document.getElementById('sum-' + side), btn = document.getElementById('btn-' + side);
    if (sum) sum.innerHTML = r.html;
    if (btn) { btn.textContent = r.label; btn.disabled = !r.ok; }
  });
  const ls = document.getElementById('sum-list'), lb = document.getElementById('btn-list');
  if (ls && E.stockOf(PA(), isl, g) > 0) { const l = listSummary(isl, g); ls.innerHTML = l.html; if (lb) lb.textContent = l.label; }
}
function qtyCtl(key, max) {
  const cur = ui.form[key] == null ? (key === 'sq' ? max : 10) : ui.form[key];
  const v = Math.max(max ? 1 : 0, Math.min(max, Math.floor(+cur || 1)));
  ui.form[key] = v;
  if (!max) return '';
  const quick = [10, 50, 100].filter(n => n < max);
  return `<div class="qty"><button class="btn small" data-act="q-step" data-k="${key}" data-v="-1" data-max="${max}">−</button><input class="num" type="number" min="1" max="${max}" data-bind="${key}" value="${v}"><button class="btn small" data-act="q-step" data-k="${key}" data-v="1" data-max="${max}">+</button>
    <input type="range" min="1" max="${max}" value="${v}" data-bind="${key}"></div>
    <div class="row-flex quick">${quick.map(n => `<button class="btn small" data-act="q-set" data-k="${key}" data-v="${n}" data-max="${max}">${n}</button>`).join('')}<button class="btn small" data-act="q-set" data-k="${key}" data-v="${max}" data-max="${max}">${key === 'bq' ? 'Le maximum' : 'Tout'} (${fmt(max)})</button></div>`;
}
// où revendre : prix connus ailleurs
function elsewhere(isl, g) {
  const here = S().books[isl][g].ema;
  const rows = ISLANDS.filter(i => i.id !== isl).map(i => {
    const k = E.knownSnap(i.id);
    const p = k.live ? S().books[i.id][g].ema : (k.snap ? k.snap.p[g][0] : null);
    return { i, p, delay: k.delay, days: E.PATH[isl][i.id].days, banned: S().isl[i.id].banned[g], pres: E.present(i.id) };
  }).filter(r => r.p != null).sort((a, b) => b.p - a.p);
  return `<h5>Ailleurs dans l'archipel ${q('ailleurs')}</h5><table class="t"><thead><tr><th>Île</th><th class="n">Prix connu</th><th class="n">Par rapport à ici</th><th class="n">Trajet</th><th>Info</th></tr></thead><tbody>` +
    rows.map(r => `<tr class="row" data-act="goto" data-isl="${r.i.id}"><td>${esc(r.i.name)}${r.banned ? ' <span class="tag" style="background:#f0d2c8">interdit</span>' : ''}${r.pres ? ' <span class="tag">comptoir</span>' : ''}</td><td class="n"><b>${fp(r.p)} §</b></td>
      <td class="n ${r.p > here * 1.05 ? 'up' : r.p < here * 0.95 ? 'down' : 'muted'}">${pct(r.p / here - 1)}</td><td class="n">${r.days} j</td><td class="muted">${r.delay ? `il y a ${r.delay} j` : 'en direct'}</td></tr>`).join('') +
    `</tbody></table><p class="note">Pour profiter d'un écart : achetez ici, expédiez depuis l'onglet <b>Navigation</b> vers une île où vous avez un comptoir, puis revendez là-bas. Les prix des îles sans comptoir sont anciens : ils ont peut-être changé.</p>`;
}
function pDetail(isl, g, pres, info) {
  const b = S().books[isl][g], st = S().isl[isl];
  const hist = pres ? b.hist : info.hist.map(s => s.p[g][0]);
  const now = hist[hist.length - 1], before = hist.length > 5 ? hist[hist.length - 6] : now;
  const trend = now / before - 1;
  let h = `<div class="detail" id="detail"><button class="btn small close" data-act="sel-good" data-g="">Fermer</button>
    <h3 class="dtitle">${esc(G[g].name)} <span>à ${esc(I[isl].name)}</span></h3>
    <p class="lead">Prix ${pres ? 'actuel' : `il y a ${info.delay} j`} : <b>${fp(now)} §</b> · ${Math.abs(trend) < 0.01 ? 'stable' : trend > 0 ? `<span class="up">en hausse de ${pct(trend).slice(1)}</span>` : `<span class="down">en baisse de ${pct(trend).slice(1)}</span>`} sur 5 jours · prix de base ${fp(G[g].base)} §${G[g].perish >= 0.01 ? ` · <span class="down">se gâte vite</span> ${q('perissable')}` : ''}</p>`;
  h += chart(hist, { base: G[g].base, h: 100, label: pres ? "aujourd'hui" : `il y a ${info.delay} j` });
  if (st.banned[g]) {
    const have = E.stockOf(PA(), isl, g);
    h += `<p>${q('marchenoir')} <b>Ce bien est interdit ici.</b> Il ne se négocie pas en bourse, mais le marché noir paie cher, au prix de la suspicion des autorités.</p>`;
    if (have > 0) h += `<div class="row-flex">Vous en avez ${fmt(have)}. <button class="btn danger" data-act="black" data-isl="${isl}" data-g="${g}">Vendre 10 au marché noir</button></div>`;
    return h + elsewhere(isl, g) + `</div>`;
  }
  if (!pres) return h + `<p class="sum">Pour acheter ou vendre ici, il faut un comptoir sur l'île.</p><button class="btn primary" data-act="open-cpt" data-isl="${isl}">Ouvrir un comptoir (${E.COSTS.comptoir} §)</button>` + elsewhere(isl, g) + `</div>`;
  const buy = tradeSummary(isl, g, 'buy'), sell = tradeSummary(isl, g, 'sell');
  const ask = b.asks.find(o => o.a !== 'player'), bid = b.bids.find(o => o.a !== 'player');
  const have = E.stockOf(PA(), isl, g);
  h += `<div class="trade2">
    <div class="tcard tbuy"><h5>Acheter ${q('achetez')}</h5><p class="price">${ask ? `dès <b>${fp(ask.price)} §</b> l'unité` : 'aucun vendeur'}</p>
      ${buy.ok ? qtyCtl('bq', maxBuyQty(isl, g)) : ''}<div id="sum-buy">${buy.html}</div>
      <button class="btn primary big" id="btn-buy" data-act="buy" data-g="${g}" ${buy.ok ? '' : 'disabled'}>${buy.label}</button></div>
    <div class="tcard tsell"><h5>Vendre ${q('vendez')}</h5>
      ${have ? qtyCtl('sq', have) + `
      <div class="opt"><b>Tout de suite</b>, aux acheteurs présents ${bid ? `(jusqu'à ${fp(bid.price)} § l'unité)` : ''}
        <div id="sum-sell">${sell.html}</div>
        <button class="btn primary" id="btn-sell" data-act="sell" data-g="${g}" ${sell.ok ? '' : 'disabled'}>${sell.label}</button></div>
      <div class="opt"><b>Mettre en vente</b> et laisser venir les clients ${q('limite')}
        <div class="row-flex" style="margin:4px 0">au prix de <input class="num" type="number" step="0.1" min="0.01" data-bind="sp" value="${esc(ui.form.sp || listPrice(isl, g))}"> § l'unité</div>
        <div id="sum-list">${listSummary(isl, g).html}</div>
        <button class="btn primary" id="btn-list" data-act="list" data-g="${g}">${listSummary(isl, g).label}</button></div>` : `<div id="sum-sell">${sell.html}</div>`}
    </div>
  </div>`;
  h += elsewhere(isl, g);
  h += `<details ${ui.openAdv ? 'open' : ''} data-act="adv" data-k="openAdv"><summary>Option avancée : proposer d'acheter à mon prix ${q('limite')}</summary>
    <p class="note">Au lieu d'accepter le prix des autres, vous déposez une offre qui attend (30 jours au plus) qu'un marchand l'accepte. Utile pour acheter moins cher ou vendre plus cher, si vous êtes patient. L'argent ou la marchandise sont bloqués en attendant.</p>
    <div class="row-flex"><span>Quantité</span><input class="num" type="number" min="1" data-bind="qty" value="${esc(ui.form.qty)}"><span>au prix de</span><input class="num" data-bind="price" type="number" step="0.1" placeholder="${fp(b.ema)}" value="${esc(ui.form.price)}"> § l'unité</div>
    <div class="row-flex" style="margin-top:6px"><button class="btn" data-act="limit" data-side="buy" data-g="${g}">Proposer d'acheter à ce prix</button><button class="btn" data-act="limit" data-side="sell" data-g="${g}" ${have ? '' : 'disabled'}>Proposer de vendre à ce prix</button></div></details>`;
  const row = o => `<tr class="${o.a === 'player' ? 'me' : ''}"><td class="p">${fp(o.price)} §</td><td class="q">${fmt(o.qty)}${o.a === 'player' ? ' (vous)' : ''}</td></tr>`;
  h += `<details ${ui.openBook ? 'open' : ''} data-act="adv" data-k="openBook"><summary>Voir toutes les offres (carnet d'ordres) ${q('carnet')}</summary><p class="note">À gauche, les vendeurs : ce que vous paierez. À droite, les acheteurs : ce que vous toucherez. Les meilleurs prix sont en haut.</p>
    <div class="ob"><div><b style="font-size:13px">Ils vendent (vous achetez à)</b><table class="asks">${b.asks.slice(0, 8).map(row).join('') || '<tr><td class="muted">personne</td></tr>'}</table></div>
    <div><b style="font-size:13px">Ils achètent (vous vendez à)</b><table class="bids">${b.bids.slice(0, 8).map(row).join('') || '<tr><td class="muted">personne</td></tr>'}</table></div></div></details>`;
  return h + `</div>`;
}

// ---------------------------------------------------------------- COMPTOIRS & ENTREPÔTS
function pEntrepots() {
  const pl = P(), a = PA();
  let h = `<h2>Comptoirs et entrepôts</h2><p class="sub">Un comptoir vous donne la bourse en direct et un entrepôt sur l'île. Vos frais fixes : <b>${fmt(pl.lastUpkeep || 0)} §/jour</b>.</p>`;
  h += `<h4>Votre fortune ${q('fortune')}</h4>` + chart(S().netHist, { color: '#4d6a37', n: 360 });
  h += `<h4>Entrepôts ${q('stock')}</h4>`;
  let any = false;
  ISLANDS.forEach(i => {
    const st = a.stock[i.id], goods = Object.keys(st);
    const pres = E.present(i.id);
    if (!goods.length && !pres) return;
    any = true;
    let val = 0; goods.forEach(g => { val += st[g] * S().books[i.id][g].ema; });
    h += `<div class="card ${pres ? 'hl' : ''}"><div class="row-flex" style="justify-content:space-between"><b>${esc(i.name)}</b>
      <span class="row-flex">${pres ? '<span class="chip green">comptoir</span>' : '<span class="chip">pas de comptoir</span>'}${goods.length ? `<span class="muted">valeur ≈ ${fmt(val)} §</span>` : ''}
      <button class="btn small" data-act="goto" data-isl="${i.id}">Bourse</button>
      ${goods.length ? `<button class="btn small" data-act="ship-from" data-isl="${i.id}">Expédier</button>` : ''}
      ${pres && i.id !== 'port' ? `<button class="btn small" data-act="close-cpt" data-isl="${i.id}">Fermer</button>` : ''}</span></div>`;
    if (goods.length) h += `<div class="chips">` + goods.map(g => `<span class="chip">${esc(G[g].name)} : <b>${fmt(st[g])}</b>${G[g].perish >= 0.01 ? ' <span class="down">périssable</span>' : ''}${S().isl[i.id].banned[g] ? ' <span class="down">illicite</span>' : ''}</span>`).join('') + `</div>`;
    else h += `<p class="note">Entrepôt vide.</p>`;
    h += `</div>`;
  });
  if (!any) h += `<p class="note">Aucun stock.</p>`;
  h += `<h4>Réseau d'information ${q('nouvelles')}</h4><p class="note">Sans comptoir, les nouvelles d'une île vous arrivent avec le retard des navires. Un informateur réduit ce retard à 1 jour ; un colombier le divise par deux partout.</p>`;
  h += `<table class="t"><thead><tr><th>Île</th><th>Présence</th><th class="n">Retard</th><th></th></tr></thead><tbody>` + ISLANDS.map(i => {
    const pres = E.present(i.id), inf = pl.informants.includes(i.id);
    return `<tr><td>${esc(i.name)}</td><td>${pres ? 'Comptoir' : inf ? 'Informateur' : '—'}</td><td class="n">${E.infoDelay(i.id)} j</td><td class="n">
      ${!pres ? `<button class="btn small" data-act="open-cpt" data-isl="${i.id}">Comptoir ${E.COSTS.comptoir} §</button>` : ''}
      ${!pres && !inf && pl.unlocked[2] ? `<button class="btn small" data-act="hire-inf" data-isl="${i.id}">Informateur ${E.COSTS.informant} §</button> ${q('informateur')}` : ''}
      ${inf ? `<button class="btn small" data-act="fire-inf" data-isl="${i.id}">Congédier</button>` : ''}</td></tr>`;
  }).join('') + `</tbody></table>`;
  if (pl.unlocked[2] && !pl.colombier) h += `<div class="row-flex" style="margin-top:8px"><button class="btn" data-act="colombier">Bâtir un colombier (${fmt(E.COSTS.colombier)} §)</button>${q('colombier')}</div>`;
  if (pl.colombier) h += `<p class="note">Votre colombier est en service.</p>`;
  if (!pl.unlocked[2]) h += `<p class="note">Informateurs et colombier s'ouvrent au stade Négociant. Un colporteur ne peut tenir que 2 comptoirs.</p>`;
  return h;
}

// ---------------------------------------------------------------- NAVIGATION
function pNavigation() {
  const pl = P(), a = PA(), f = ui.form;
  const origins = ISLANDS.filter(i => Object.keys(a.stock[i.id]).length || pl.ships.some(s => s.at === i.id && s.status === 'idle')).map(i => i.id);
  if (!f.from || !origins.includes(f.from)) f.from = origins[0] || null;
  const dests = pl.comptoirs.filter(x => x !== f.from);
  if (!f.to || !dests.includes(f.to)) f.to = dests[0] || null;
  let h = `<h2>Navigation</h2><p class="sub">Les marchandises voyagent par mer. Le fret est simple ; un navire à vous permet l'escorte et la contrebande.</p>`;
  h += `<h4>Nouvelle expédition</h4>`;
  if (!f.from) h += `<p class="note">Vous n'avez de stock nulle part. Achetez d'abord en bourse.</p>`;
  else if (!f.to) h += `<p class="note">Il vous faut un comptoir sur une autre île pour y recevoir des marchandises.</p>`;
  else {
    const pth = E.PATH[f.from][f.to];
    const idle = pl.ships.filter(s => s.at === f.from && s.status === 'idle');
    if (f.mode === 'navire' && !idle.length) f.mode = 'fret';
    if (f.mode === 'navire' && !idle.some(s => s.id === +f.shipId)) f.shipId = idle[0].id;
    h += `<div class="grid2"><label class="field">Départ<select data-bind="from">${islOptions(f.from, x => origins.includes(x))}</select></label>
      <label class="field">Destination (vos comptoirs)<select data-bind="to">${islOptions(f.to, x => dests.includes(x))}</select></label></div>
      <div class="chips" style="margin-top:8px"><span class="chip">${pth.days} j de mer (plus avec la brume)</span><span class="chip ${pth.danger > 0.4 ? 'red' : ''}">Pirates : ${pth.danger > 0.4 ? 'élevé' : pth.danger > 0.15 ? 'modéré' : 'faible'} ${q('risques')}</span>
      ${E.seasonIdx() === 2 ? '<span class="chip red">Saison des tempêtes</span>' : ''}${E.embargoed(f.from, f.to) ? '<span class="chip red">Embargo</span>' : ''}</div>
      <div class="row-flex" style="margin:4px 0 8px"><label><input type="radio" name="mode" data-bind="mode" value="fret" ${f.mode === 'fret' ? 'checked' : ''}> Fret (${fp(E.freightCost(pth.days))} §/unité)</label>${q('fret')}
      <label><input type="radio" name="mode" data-bind="mode" value="navire" ${f.mode === 'navire' ? 'checked' : ''} ${idle.length ? '' : 'disabled'}> Mon navire ${idle.length ? '' : '(aucun ici)'}</label>${q('navire')}</div>`;
    if (f.mode === 'navire') {
      h += `<div class="row-flex"><select data-bind="shipId">${idle.map(s => `<option value="${s.id}" ${+f.shipId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.cap} places)</option>`).join('')}</select>
        <label><input type="checkbox" data-bind="escort" ${f.escort ? 'checked' : ''}> Escorte (${E.COSTS.escortDay} §/j)</label>${q('escorte')}
        <label title="Débarquer sans passer la douane : pas de droits, mais risque de fouille"><input type="checkbox" data-bind="smuggle" ${f.smuggle ? 'checked' : ''}> Contrebande</label>${q('contrebande')}</div>`;
    }
    const st = a.stock[f.from], dst = S().isl[f.to];
    let total = 0;
    h += `<table class="t" style="margin-top:8px"><thead><tr><th>Bien</th><th class="n">En stock</th><th class="n">Ici</th><th class="n">Là-bas*</th><th class="n">À charger</th></tr></thead><tbody>`;
    Object.keys(st).forEach(g => {
      const q = Math.min(+f.cargo[g] || 0, st[g]); total += q;
      const there = E.knownSnap(f.to); const tp = there.live ? S().books[f.to][g].ema : (there.snap ? there.snap.p[g][0] : null);
      const warn = dst.banned[g] ? ' <span class="down">interdit</span>' : dst.tariffs[g] ? ' <span class="down">droits 15 %</span>' : '';
      h += `<tr><td>${esc(G[g].name)}${warn}</td><td class="n">${fmt(st[g])}</td><td class="n">${fp(S().books[f.from][g].ema)}</td><td class="n">${fp(tp)}</td>
        <td class="n"><input class="num" type="number" min="0" max="${st[g]}" data-bind="cargo.${g}" value="${f.cargo[g] || ''}"> <button class="btn small" data-act="cargo-all" data-g="${g}" data-v="${st[g]}">tout</button></td></tr>`;
    });
    h += `</tbody></table><p class="note">* prix connus à destination, avec le retard de vos nouvelles.</p>`;
    const cost = f.mode === 'fret' ? Math.ceil(total * E.freightCost(pth.days)) : 0;
    if (cost > PA().cash) h += `<p class="warn-box">Il vous manque ${fmt(cost - PA().cash)} § pour payer le fret. Avec vos ${fmt(PA().cash)} §, vous pouvez expédier au plus ${fmt(Math.floor(PA().cash / E.freightCost(pth.days)))} unités. Vendez un peu de stock ou réduisez la quantité.</p>`;
    h += `<div class="row-flex" style="margin-top:6px"><button class="btn primary" data-act="ship" ${(total || f.mode === 'navire') && cost <= PA().cash ? '' : 'disabled'}>Expédier ${fmt(total)} unités</button><span class="note">${f.mode === 'fret' ? `Coût du fret : ${fmt(cost)} §` : 'Frais : entretien du navire' + (f.escort ? ' et escorte' : '')}</span></div>`;
  }
  // en mer
  const mine = S().shipments.filter(s => s.owner === 'player');
  h += `<h4>En mer (${mine.length})</h4>`;
  if (!mine.length) h += `<p class="note">Aucun convoi en route.</p>`;
  mine.forEach(sh => {
    const p = Math.min(1, (S().hour - sh.dep) / (sh.arr - sh.dep));
    const ship = sh.shipId ? pl.ships.find(s => s.id === sh.shipId) : null;
    h += `<div class="card"><div class="row-flex" style="justify-content:space-between"><b>${esc(I[sh.from].name)} → ${esc(I[sh.to].name)}</b><span class="muted">${ship ? esc(ship.name) : 'fret'}${sh.escort ? ' · escorte' : ''}${sh.smuggle ? ' · contrebande' : ''} · arrivée dans ${Math.max(0, (sh.arr - S().hour) / 24).toFixed(1).replace('.', ',')} j</span></div>
      ${bar(p, ' ')}<div class="chips">${Object.keys(sh.cargo).map(g => `<span class="chip">${esc(G[g].name)} : ${fmt(sh.cargo[g])}</span>`).join('') || '<span class="chip">à vide</span>'}</div></div>`;
  });
  // flotte
  h += `<h4>Votre flotte ${q('navire')}</h4>`;
  if (!pl.unlocked[2]) h += `<p class="note">Posséder des navires demande le stade Négociant (5 000 § de valeur nette).</p>`;
  else {
    if (!pl.ships.length) h += `<p class="note">Aucun navire.</p>`;
    pl.ships.forEach(s => {
      h += `<div class="card row-flex" style="justify-content:space-between"><span><b>${esc(s.name)}</b> · ${s.cap} places · ${s.status === 'idle' ? 'à quai à ' + esc(I[s.at].name) : 'en mer'}</span>
        <span class="row-flex">${s.status === 'idle' ? `<select data-bind="moveTo.${s.id}">${islOptions(ui.form['moveTo.' + s.id] || 'port', x => x !== s.at)}</select><button class="btn small" data-act="move-ship" data-id="${s.id}">Envoyer à vide</button><button class="btn small" data-act="sell-ship" data-id="${s.id}">Vendre 1 500 §</button>` : ''}</span></div>`;
    });
    const isl = ui.sel;
    h += `<div class="row-flex"><button class="btn" data-act="buy-ship" data-isl="${isl}" ${E.present(isl) ? '' : 'disabled'}>Acheter un navire à ${esc(I[isl].name)} (${fmt(isl === 'bois' ? E.COSTS.ship : E.COSTS.shipFar)} §)</button><span class="note">Moins cher à Boisnoir. Entretien ${E.COSTS.shipDay} §/j.</span></div>`;
  }
  return h;
}

// ---------------------------------------------------------------- ATELIERS
function pAteliers() {
  if (!P().unlocked[3]) return lockBox(3);
  const pl = P(), isl = ui.sel;
  let h = `<h2>Ateliers ${q('atelier')}</h2><p class="sub">Transformez des biens bon marché en produits qui valent plus. Les intrants doivent être dans votre entrepôt de l'île ; les produits y sont déposés.</p>`;
  h += `<h4>Vos ateliers</h4>`;
  if (!pl.workshops.length) h += `<p class="note">Aucun atelier pour l'instant.</p>`;
  pl.workshops.forEach(w => {
    const r = RECIPES[w.recipe];
    h += `<div class="card"><div class="row-flex" style="justify-content:space-between"><b>${esc(r.name)} — ${esc(I[w.isl].name)}</b><span class="chip ${w.on ? 'green' : ''}">niveau ${w.level} · ${w.on ? esc(w.status || '') : 'arrêté'}</span></div>
      <p class="note" style="margin:4px 0">${Object.keys(r.in).map(g => r.in[g] + ' ' + G[g].name).join(' + ')} → ${r.out} ${G[w.recipe].name} · jusqu'à ${r.perDay * w.level} lots/j · ${r.workers * w.level} ouvriers · production d'hier : ${fmt(w.last || 0)}</p>
      <div class="row-flex"><button class="btn small" data-act="ws-toggle" data-id="${w.id}">${w.on ? 'Arrêter' : 'Relancer'}</button>${w.level < 3 ? `<button class="btn small" data-act="ws-up" data-id="${w.id}">Améliorer (${fmt(Math.round(r.cost * (w.level === 1 ? 1.2 : 1.8)))} §)</button>` : ''}
      <button class="btn small" data-act="goto" data-isl="${w.isl}">Bourse de l'île</button></div></div>`;
  });
  h += `<h4>Construire à ${esc(I[isl].name)}</h4>`;
  if (!E.present(isl)) h += `<p class="note">Il faut un comptoir à ${esc(I[isl].name)}. Choisissez une île sur la carte.</p>`;
  h += `<table class="t"><thead><tr><th>Atelier</th><th>Recette</th><th class="n">Marge/lot* ${q('marge')}</th><th class="n">Coût</th><th></th></tr></thead><tbody>`;
  Object.keys(RECIPES).forEach(k => {
    const r = RECIPES[k], b = S().books[isl];
    let inCost = 0; Object.keys(r.in).forEach(g => { inCost += r.in[g] * b[g].ema; });
    const margin = r.out * b[k].ema - inCost - r.workers * S().isl[isl].wage / r.perDay;
    h += `<tr><td><b>${esc(r.name)}</b></td><td>${Object.keys(r.in).map(g => r.in[g] + ' ' + esc(G[g].name)).join(' + ')} → ${r.out} ${esc(G[k].name)}<br><span class="note">${r.perDay} lots/j au niveau 1 · ${r.workers} ouvriers</span></td>
      <td class="n ${margin > 0 ? 'up' : 'down'}">${fp(margin)}</td><td class="n">${fmt(r.cost)} §</td><td class="n"><button class="btn small" data-act="ws-build" data-r="${k}" ${E.present(isl) ? '' : 'disabled'}>Bâtir</button></td></tr>`;
  });
  h += `</tbody></table><p class="note">* aux prix actuels de ${esc(I[isl].name)}, salaires compris. Les intrants peuvent venir d'autres îles.</p>`;
  return h;
}

// ---------------------------------------------------------------- OPTIONS
function pOptions() {
  const pl = P();
  if (!pl.unlocked[4]) {
    let h = lockBox(4);
    if (pl.unlocked[3]) h += `<div style="text-align:center"><button class="btn primary" data-act="seat">Acheter un siège à la Grande Bourse (${fmt(E.COSTS.seat)} §)</button></div>`;
    return h;
  }
  const f = ui.form;
  const series = S().optSeries.filter(s => s.g === f.optGood).sort((a, b) => a.exp - b.exp);
  if (f.optExp >= series.length) f.optExp = 0;
  const s = series[f.optExp];
  const b = S().books.port[f.optGood];
  let h = `<h2>Options — Grande Bourse ${q('options')}</h2><p class="sub">Une option d'achat rapporte si le cours <b>monte</b> au-dessus du prix d'exercice ; une option de vente si le cours <b>baisse</b> en dessous. Vous ne perdez jamais plus que la prime. Un contrat = ${OPTION_SIZE} unités, réglé en Sceaux à l'échéance au cours de Port-Sablier.</p>`;
  h += `<div class="chips">${OPTION_GOODS.map(g => `<button class="btn small ${g === f.optGood ? 'primary' : ''}" data-act="opt-good" data-g="${g}">${esc(G[g].name)}</button>`).join('')}</div>`;
  h += `<div class="chips">${series.map((x, k) => `<button class="btn small ${k === f.optExp ? 'primary' : ''}" data-act="opt-exp" data-k="${k}">Échéance jour ${x.exp} (dans ${x.exp - E.gday()} j)</button>`).join('')}${q('echeance')}</div>`;
  h += `<div class="row-flex"><span>Cours à Port-Sablier : <b>${fp(b.ema)} §</b></span><span>Humeur ${sentBar(b.sent)}</span></div>`;
  h += chart(b.hist, { base: G[f.optGood].base, h: 110 });
  if (s) {
    h += `<div class="row-flex" style="margin:6px 0">Nombre de contrats <input class="num" type="number" min="1" data-bind="optN" value="${esc(f.optN)}"></div>`;
    h += `<table class="t"><thead><tr><th class="n">Exercice</th><th class="n">Option d'achat ${q('call')}</th><th></th><th class="n">Option de vente ${q('put')}</th><th></th></tr></thead><tbody>`;
    s.strikes.forEach(K => {
      const c = E.optPrice(s.g, K, 'call', s.exp), p = E.optPrice(s.g, K, 'put', s.exp);
      h += `<tr><td class="n"><b>${fp(K)}</b></td><td class="n">${fp(c.ask * OPTION_SIZE)} §</td><td><button class="btn small" data-act="opt-buy" data-sid="${s.id}" data-k="${K}" data-type="call">Acheter</button></td>
        <td class="n">${fp(p.ask * OPTION_SIZE)} §</td><td><button class="btn small" data-act="opt-buy" data-sid="${s.id}" data-k="${K}" data-type="put">Acheter</button></td></tr>`;
    });
    h += `</tbody></table><p class="note">${q('prime')} Prix par contrat. Les primes gonflent quand l'humeur du marché s'agite.</p>`;
  }
  h += `<h4>Vos positions</h4>`;
  if (!pl.options.length) h += `<p class="note">Aucune.</p>`;
  else {
    h += `<table class="t"><thead><tr><th>Option</th><th class="n">Échéance</th><th class="n">Payé</th><th class="n">Vaut</th><th class="n">Gain</th><th></th></tr></thead><tbody>`;
    pl.options.forEach(pos => {
      const v = E.optPrice(pos.g, pos.K, pos.type, pos.exp).bid * OPTION_SIZE * pos.n;
      h += `<tr><td>${pos.n} × ${pos.type === 'call' ? 'achat' : 'vente'} ${esc(G[pos.g].name)} à ${fp(pos.K)}</td><td class="n">j${pos.exp}</td><td class="n">${fmt(pos.paid)}</td><td class="n">${fmt(v)}</td><td class="n ${v >= pos.paid ? 'up' : 'down'}">${fmt(v - pos.paid)}</td><td class="n"><button class="btn small" data-act="opt-sell" data-id="${pos.id}">Revendre</button></td></tr>`;
    });
    h += `</tbody></table>`;
  }
  return h;
}

// ---------------------------------------------------------------- INFLUENCE
function pInfluence() {
  const pl = P();
  let h = `<h2>Influence</h2><p class="sub">Réputation, contrats et faveurs : la seconde monnaie de l'archipel.</p>`;
  h += `<div class="grid2"><div><div class="row-flex" style="justify-content:space-between"><b>Fiabilité ${q('fiabilite')}</b><span>${Math.round(pl.fiabilite)}</span></div>${bar(pl.fiabilite / 100)}<p class="note">Contrats honorés ou non.</p></div>
    <div><div class="row-flex" style="justify-content:space-between"><b>Probité ${q('probite')}</b><span>${Math.round(pl.probite)}</span></div>${bar(pl.probite / 100)}<p class="note">Baisse avec les coups tordus.</p></div>
    <div><div class="row-flex" style="justify-content:space-between"><b>Prestige ${q('prestige')}</b><span>${E.prestige()}</span></div>${bar(E.prestige() / 100, ' ')}<p class="note">Fortune et hauts faits. 50 pour devenir Notable.</p></div>
    <div><b>Suspicion des autorités ${q('suspicion')}</b>${ISLANDS.filter(i => S().isl[i.id].suspicion > 1).map(i => `<div class="row-flex" style="justify-content:space-between;font-size:13px"><span>${esc(i.name)}</span><span>${Math.round(S().isl[i.id].suspicion)}</span></div>${bar(S().isl[i.id].suspicion / 100, S().isl[i.id].suspicion > 60 ? 'bad' : 'warn')}`).join('') || '<p class="note">Personne ne vous soupçonne.</p>'}</div></div>`;
  // contrats
  h += `<h4>Contrats ${q('contrats')}</h4>`;
  if (!pl.unlocked[2]) h += `<p class="note">Les PNJ vous proposeront des contrats quand vous serez Négociant.</p>`;
  const cs = S().contracts.filter(c => c.status !== 'expiré');
  if (pl.unlocked[2] && !cs.length) h += `<p class="note">Aucune offre pour l'instant. Elles arrivent plus souvent quand votre fiabilité est bonne.</p>`;
  cs.forEach(c => {
    const n = S().npcs[c.npc], have = E.stockOf(PA(), c.isl, c.g);
    const label = { offre: 'Offre', actif: 'En cours', livré: 'Livré', échoué: 'Manqué' }[c.status];
    h += `<div class="card ${c.status === 'actif' ? 'hl' : ''}"><div class="row-flex" style="justify-content:space-between"><b>${esc(n.name)}</b><span class="chip ${c.status === 'livré' ? 'green' : c.status === 'échoué' ? 'red' : 'gold'}">${label}</span></div>
      <p style="margin:4px 0">Livrer <b>${fmt(c.qty)} ${esc(G[c.g].name)}</b> à ${esc(I[c.isl].name)} avant le jour ${c.deadline} (dans ${c.deadline - E.gday()} j), payé <b>${fp(c.price)} §</b> l'unité (cours ≈ ${fp(S().books[c.isl][c.g].ema)} §), soit ${fmt(c.qty * c.price)} § et une faveur.</p>
      <div class="row-flex">${c.status === 'offre' ? `<button class="btn primary small" data-act="c-accept" data-id="${c.id}">Accepter</button><button class="btn small" data-act="c-decline" data-id="${c.id}">Décliner</button><span class="note">offre valable ${c.offerUntil - E.gday()} j</span>` : ''}
      ${c.status === 'actif' ? `<button class="btn primary small" data-act="c-deliver" data-id="${c.id}" ${have >= c.qty ? '' : 'disabled'}>Livrer</button><span class="note">Vous en avez ${fmt(have)} à ${esc(I[c.isl].name)}.</span>` : ''}</div></div>`;
  });
  // rumeurs et modes
  if (pl.unlocked[2]) {
    const f = ui.form;
    h += `<h4>Lancer une rumeur ${q('lancer')}</h4><p class="note">Une fausse rumeur fait bouger les prix si on y croit. Coût ${E.COSTS.rumor} §, suspicion +10 sur l'île. Il faut y avoir un comptoir ou un informateur.</p>
      <div class="row-flex"><select data-bind="rIsl">${islOptions(f.rIsl, x => E.present(x) || pl.informants.includes(x))}</select><select data-bind="rGood">${goodOptions(f.rGood)}</select>
      <select data-bind="rDir"><option value="1" ${+f.rDir > 0 ? 'selected' : ''}>pénurie (hausse)</option><option value="-1" ${+f.rDir < 0 ? 'selected' : ''}>abondance (baisse)</option></select>
      <button class="btn danger" data-act="rumor">Répandre</button></div>`;
  }
  if (pl.unlocked[5]) {
    const f = ui.form;
    h += `<h4>Lancer une mode ${q('mode')}</h4><p class="note">Financer un patricien en vue triple la demande d'un bien sur une île pendant 30 jours. Coût ${fmt(E.COSTS.fad)} §.</p>
      <div class="row-flex"><select data-bind="fadIsl">${islOptions(f.fadIsl)}</select><select data-bind="fadGood">${goodOptions(f.fadGood, ['lanterne', 'essence', 'accu', 'outils'])}</select><button class="btn primary" data-act="fad">Lancer la mode</button></div>`;
  }
  // PNJ
  h += `<h4>Personnages de l'archipel ${q('faveurs')} ${q('traits')}</h4><p class="note">Les faveurs se gagnent en honorant des contrats. Secret (1 faveur) : vérifie les rumeurs de son île, révèle ce qui s'y prépare et l'état du vote au Conseil. Étouffer (2 faveurs) : -35 de suspicion sur son île.</p>`;
  ISLANDS.forEach(i => {
    const list = Object.values(S().npcs).filter(n => n.home === i.id);
    h += `<div class="card"><b>${esc(i.name)}</b><table class="t" style="margin-top:4px"><tbody>`;
    list.forEach(n => {
      const role = n.style ? STYLE_NAMES[n.style] : ROLE_NAMES[n.role] + (n.ws ? ' · ' + RECIPES[n.ws.recipe].name.toLowerCase() : '');
      const tr = Object.keys(TRAITS).map(k => `${TRAITS[k].slice(0, 3)} ${n.traits[k]}`).join(' · ');
      h += `<tr><td style="width:46%"><b>${esc(n.name)}</b><br><span class="traits">${esc(n.title || role)}<br>${tr}</span></td>
        <td style="width:22%"><span class="note">relation ${n.rel > 0 ? '+' : ''}${Math.round(n.rel)} ${q('relation')}</span>${bar((n.rel + 100) / 200, ' ')}${n.favors ? `<span class="chip gold">${n.favors} faveur(s)</span>` : ''}</td>
        <td class="n">${n.favors >= 1 ? `<button class="btn small" data-act="favor" data-npc="${n.id}" data-a="secret">Secret</button>` : ''}${n.favors >= 2 ? ` <button class="btn small" data-act="favor" data-npc="${n.id}" data-a="etouffer">Étouffer</button>` : ''}
        ${n.favors >= 1 && pl.unlocked[5] && n.role === 'notable' && S().council[n.home] && !S().council[n.home].resolved ? `<br><button class="btn small" data-act="favor" data-npc="${n.id}" data-a="vote" data-v="1">Vote pour</button> <button class="btn small" data-act="favor" data-npc="${n.id}" data-a="vote" data-v="-1">contre</button>` : ''}</td></tr>`;
      if (n.memory.length) h += `<tr><td colspan="3" class="note" style="padding-top:0">Se souvient : ${esc(n.memory[0].text)}</td></tr>`;
    });
    h += `</tbody></table></div>`;
  });
  return h;
}

// ---------------------------------------------------------------- CONSEILS
function pConseils() {
  const pl = P();
  let h = `<h2>Conseils des îles ${q('conseil')}</h2><p class="sub">Chaque saison, chaque Conseil vote une mesure au 31<sup>e</sup> jour. ${pl.unlocked[5] ? 'En tant que Notable, vous pouvez peser sur le vote.' : 'Devenez Notable (prestige 50) pour peser sur les votes.'}</p>`;
  ISLANDS.forEach(i => {
    const p = S().council[i.id], st = S().isl[i.id];
    h += `<div class="card ${ui.sel === i.id ? 'hl' : ''}"><div class="row-flex" style="justify-content:space-between"><b>${esc(i.name)}</b><span class="note">taxe ${(st.tax * 100).toFixed(1).replace('.', ',')} %</span></div>`;
    if (p) {
      const known = E.present(i.id) || pl.informants.includes(i.id);
      const sup = p.base + p.sway;
      let est;
      if (p.resolved) est = `<span class="chip ${p.passed ? 'green' : 'red'}">${p.passed ? 'Adoptée' : 'Rejetée'} (${Math.round(sup * 100)} %)</span>`;
      else if (pl.insider[i.id]) est = `<span class="chip gold">Secret d'initié : ${Math.round(sup * 100)} % pour</span>`;
      else if (known) { const c = Math.round((sup + p.noise) * 100); est = `<span class="chip">Estimation : ${Math.max(0, c - 15)} à ${Math.min(100, c + 15)} % pour</span>`; }
      else est = `<span class="chip blue">Tendance inconnue sans comptoir ni informateur</span>`;
      h += `<p style="margin:4px 0">« ${esc(p.text)} »</p><div class="row-flex">${est}${q('estimation')}${!p.resolved ? `<span class="note">vote dans ${p.vote - E.gday()} j</span>` : ''}</div>`;
      h += `<div class="chips" style="margin-top:6px">${Object.keys(i.factions).map(k => `<span class="chip ${p.stance[k] > 0 ? 'green' : p.stance[k] < 0 ? 'red' : ''}" title="${p.stance[k] > 0 ? 'pour' : p.stance[k] < 0 ? 'contre' : 'neutre'}">${esc(FACTIONS[k])} ${Math.round(i.factions[k] * 100)} %</span>`).join('')}${q('factions')}</div>`;
      if (pl.unlocked[5] && !p.resolved) {
        h += `<div class="row-flex"><input class="num" type="number" min="50" step="50" data-bind="don" value="${esc(ui.form.don)}"> §
          ${q('influencer')}<button class="btn small" data-act="sway" data-isl="${i.id}" data-k="don" data-v="1">Don pour</button><button class="btn small" data-act="sway" data-isl="${i.id}" data-k="don" data-v="-1">Don contre</button>
          <button class="btn small danger" data-act="sway" data-isl="${i.id}" data-k="corruption" data-v="1">Corrompre pour (${E.COSTS.corruption} §)</button><button class="btn small danger" data-act="sway" data-isl="${i.id}" data-k="corruption" data-v="-1">contre</button></div>`;
      }
    }
    const laws = st.laws.filter(l => !l.until || l.until > E.gday());
    if (laws.length || Object.keys(st.banned).length) h += `<p class="note" style="margin-top:6px">En vigueur : ${[...Object.keys(st.banned).map(g => 'interdiction de ' + G[g].name.toLowerCase()), ...laws.map(l => l.text)].map(esc).join(' · ')}</p>`;
    h += `</div>`;
  });
  return h;
}

// ---------------------------------------------------------------- RUMEURS
function pRumeurs() {
  const rs = E.knownRumors();
  let h = `<h2>Rumeurs ${q('rumeurs')}</h2><p class="sub">Les rumeurs voyagent avec les navires. Certaines annoncent un vrai choc avant tout le monde ; d'autres sont lancées pour manipuler les prix. Les marchands crédules y réagissent, ce qui peut suffire à les rendre vraies.</p>`;
  if (!rs.length) return h + `<p class="note">Aucune rumeur ne vous est parvenue.</p>`;
  rs.forEach(r => {
    const rev = P().revealed[r.id];
    const status = q('statut') + (r.status === 'démentie' ? '<span class="chip red">démentie</span>' : r.status === 'confirmée' ? '<span class="chip green">confirmée</span>' : '<span class="chip">circule</span>');
    h += `<div class="card"><div class="row-flex" style="justify-content:space-between"><span class="note">jour ${r.day} · ${esc(I[r.origin].name)}${r.src === 'player' ? ' · lancée par vous' : ''}</span>${status}</div>
      <p style="margin:4px 0;font-style:italic">« ${esc(r.text)} »</p>
      <div class="row-flex"><span class="note" style="width:110px">crédibilité ${Math.round(r.cred)} ${q('credibilite')}</span><div style="flex:1">${bar(r.cred / 100, ' ')}</div>
      ${rev && r.status === 'circule' ? (r.truth ? '<span class="verdict-t">VRAIE</span>' : '<span class="verdict-f">FAUSSE</span>') : ''}</div></div>`;
  });
  return h;
}

// ---------------------------------------------------------------- aide
function helpFull(sec) {
  sec = sec || 'bases';
  const cur = GD.HELP.find(h => h.id === sec);
  const nav = GD.HELP.map(h => `<button class="btn small ${h.id === sec ? 'primary' : ''}" data-act="help-sec" data-s="${h.id}">${esc(h.t)}</button>`).join('') + `<button class="btn small ${sec === 'glossaire' ? 'primary' : ''}" data-act="help-sec" data-s="glossaire">Glossaire</button>`;
  let body;
  if (sec === 'glossaire') body = `<dl class="gloss">` + Object.keys(GD.GLOSS).sort((a, b) => GD.GLOSS[a][0].localeCompare(GD.GLOSS[b][0], 'fr')).map(k => `<dt>${esc(GD.GLOSS[k][0])}</dt><dd>${esc(GD.GLOSS[k][1])}</dd>`).join('') + `</dl>`;
  else body = `<h2 style="margin-top:6px">${esc(cur.t)}</h2>` + cur.x;
  const t = tuto();
  return `<div class="kicker">Aide</div><h1>Comment jouer</h1><div class="chips">${nav}</div>${body}
    <div class="actions">${t.hidden || t.step >= GD.TUTO.length - 1 ? '<button class="btn" data-act="tuto-restart">Refaire le guide des premiers pas</button>' : ''}<button class="btn primary" data-act="close">Fermer</button></div>`;
}
function helpHtml(intro) {
  return `<div class="kicker">${intro ? 'Bienvenue' : 'Aide'}</div><h1>L'Archipel des Brumes</h1>
  <p>Sept îles, une monnaie, le Sceau (§), et des marchés qui ne dorment jamais. Vous débarquez à Port-Sablier avec <b>1 500 §</b> et un petit comptoir. À vous de faire fortune, comme il vous plaira.</p>
  <ul>
    <li><b>Acheter bas, vendre haut.</b> Chaque île a sa bourse. Le poisson salé ne vaut presque rien à Corallie et bien plus ailleurs. Ouvrez un comptoir sur une autre île, achetez, expédiez, revendez.</li>
    <li><b>Le brouillard.</b> Sans comptoir, les prix d'une île vous parviennent avec des jours de retard. Les rumeurs aussi voyagent par bateau, vraies ou fausses.</li>
    <li><b>La profondeur.</b> Un gros ordre fait bouger le cours contre vous. Étalez vos ventes, ou placez des ordres limités.</li>
    <li><b>Les saisons.</b> Les céréales abondent en été et manquent en hiver. Les tempêtes d'automne coûtent des cargaisons. Stocker au bon moment rapporte.</li>
    <li><b>Grandir.</b> À 5 000 § de valeur nette, vous devenez Négociant (navires, informateurs, contrats, rumeurs). À 12 000 §, Manufacturier (ateliers). Puis Spéculateur (options) et Notable (Conseils, modes).</li>
    <li><b>Jamais de dette.</b> Vous ne pouvez perdre que ce que vous engagez. Si vous êtes ruiné, la Banque vous remet en selle.</li>
  </ul>
  <p><b>Un guide vous accompagne pour vos premiers pas</b>, en haut du panneau de droite. Partout, les boutons <span class="qm" style="display:inline-flex">?</span> expliquent ce que vous voyez.</p><p class="note">Boutons ❚❚ ▶ ▶▶ ▶▶▶ en haut : pause et vitesses (au clavier : Espace, 1, 2, 3). Le jeu se met en pause tout seul quand un événement important survient. La partie est sauvegardée dans ce navigateur.</p>
  <div class="actions">${intro ? (hasSave() ? '<button class="btn" data-act="continue">Continuer la partie</button>' : '') + '<button class="btn primary" data-act="new">Nouvelle partie</button>' : '<button class="btn primary" data-act="close">Fermer</button>'}</div>`;
}

// ---------------------------------------------------------------- événements DOM
function readInt(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const d = t.dataset, f = ui.form;
  switch (d.act) {
    case 'sel-isl': ui.sel = d.isl; if (ui.tab !== 'bourse' && ui.tab !== 'ateliers' && ui.tab !== 'conseils' && ui.tab !== 'navigation') ui.tab = 'bourse'; ui.form.price = ''; render(true); break;
    case 'goto': ui.sel = d.isl; ui.tab = 'bourse'; if (isM()) { setView('panel'); break; } render(true); break;
    case 'mnav': closeModal();
      if (d.v === 'carte' || d.v === 'journal') setView(d.v);
      else if (d.v === 'plus') moreSheet();
      else setView('panel', d.v);
      break;
    case 'mmenu': menuSheet(); break;
    case 'tab': ui.tab = d.tab; render(true); $('panel').scrollTop = 0; break;
    case 'sel-good': ui.good = d.g || null; ui.form.price = ''; ui.form.bq = 10; ui.form.sq = null; ui.form.sp = ''; render(true); $('panel').scrollTop = 0; break;
    case 'q-step': case 'q-set': {
      const max = +d.max; let v = d.act === 'q-set' ? +d.v : Math.floor(+f[d.k] || 1) + (+d.v) * (e.shiftKey ? 10 : 1);
      f[d.k] = Math.max(1, Math.min(max, v));
      document.querySelectorAll(`[data-bind="${d.k}"]`).forEach(x => { x.value = f[d.k]; });
      updateTrade(); break;
    }
    case 'buy': act(E.A.buyMarket(ui.sel, d.g, Math.floor(readInt(f.bq)))); f.sq = null; break;
    case 'sell': if (true) { const r = E.A.sellMarket(ui.sel, d.g, Math.floor(readInt(f.sq == null ? E.stockOf(PA(), ui.sel, d.g) : f.sq))); if (r.ok) tuto().sold = true; act(r); f.sq = null; break; } act(E.A.sellMarket(ui.sel, d.g, Math.floor(readInt(f.sq == null ? E.stockOf(PA(), ui.sel, d.g) : f.sq)))); f.sq = null; break;
    case 'list': {
      const l = listSummary(ui.sel, d.g);
      const r = E.A.limit(ui.sel, d.g, 'sell', l.p, l.q);
      if (r.ok) { tuto().sold = true; f.sq = null; f.sp = ''; }
      act(r); break;
    }
    case 'adv': if (e.target.tagName === 'SUMMARY') ui[d.k] = !t.open; break;
    case 'limit': act(E.A.limit(ui.sel, d.g, d.side, readInt(f.price) || S().books[ui.sel][d.g].ema, Math.floor(readInt(f.qty)))); break;
    case 'cancel': act(E.A.cancel(d.isl, d.g, +d.id)); break;
    case 'black': act(E.A.blackSell(d.isl, d.g, 10)); break;
    case 'open-cpt': act(E.A.openComptoir(d.isl)); break;
    case 'close-cpt': act(E.A.closeComptoir(d.isl)); break;
    case 'hire-inf': act(E.A.hireInformant(d.isl)); break;
    case 'fire-inf': act(E.A.fireInformant(d.isl)); break;
    case 'colombier': act(E.A.buyColombier()); break;
    case 'ship-from': ui.tab = 'navigation'; f.from = d.isl; f.cargo = {}; if (isM()) ui.mview = 'panel'; render(true); break;
    case 'cargo-all': f.cargo[d.g] = +d.v; render(true); break;
    case 'ship': {
      const cargo = {}; Object.keys(f.cargo).forEach(g => { const q = Math.floor(readInt(f.cargo[g])); if (q > 0) cargo[g] = q; });
      const r = E.A.ship(f.from, f.to, cargo, f.mode, +f.shipId, f.escort, f.smuggle);
      if (r.ok) f.cargo = {};
      act(r); break;
    }
    case 'buy-ship': act(E.A.buyShip(d.isl)); break;
    case 'sell-ship': act(E.A.sellShip(+d.id)); break;
    case 'move-ship': {
      const s = P().ships.find(x => x.id === +d.id); const to = f['moveTo.' + d.id] || (s.at === 'port' ? 'ferre' : 'port');
      const r = E.A.ship(s.at, to, {}, 'navire', s.id, false, false); act(r); break;
    }
    case 'ws-build': act(E.A.buildWorkshop(ui.sel, d.r)); break;
    case 'ws-up': act(E.A.upgradeWorkshop(+d.id)); break;
    case 'ws-toggle': act(E.A.toggleWorkshop(+d.id)); break;
    case 'seat': act(E.A.buySeat()); break;
    case 'opt-good': f.optGood = d.g; f.optExp = 0; render(true); break;
    case 'opt-exp': f.optExp = +d.k; render(true); break;
    case 'opt-buy': act(E.A.buyOption(+d.sid, +d.k, d.type, Math.max(1, Math.floor(readInt(f.optN))))); break;
    case 'opt-sell': act(E.A.sellOption(+d.id)); break;
    case 'c-accept': act(E.A.acceptContract(+d.id)); break;
    case 'c-decline': act(E.A.declineContract(+d.id)); break;
    case 'c-deliver': act(E.A.deliverContract(+d.id)); break;
    case 'favor': act(E.A.favor(d.npc, d.a, +d.v || 0)); break;
    case 'rumor': act(E.A.spreadRumor(f.rIsl, f.rGood, +f.rDir)); break;
    case 'fad': act(E.A.launchFad(f.fadIsl, f.fadGood)); break;
    case 'sway': act(E.A.sway(d.isl, d.k, +d.v, readInt(f.don))); break;
    case 'speed': setSpeed(+d.v); break;
    case 'save': save(); break;
    case 'help': if (ui.speed) { ui.lastSpeed = ui.speed; setSpeed(0); ui.resumeAfter = true; } openModal(helpFull('bases'), true); break;
    case 'help-sec': openModal(helpFull(d.s), true); $('modal').querySelector('.box').scrollTop = 0; break;
    case 'explain': e.preventDefault(); explain(d.k); break;
    case 'tuto-show': tutoShow(); break;
    case 'tuto-hide': tuto().hidden = true; toast("Guide masqué. Vous pouvez le reprendre depuis l'Aide."); render(true); break;
    case 'tuto-end': tuto().hidden = true; render(true); break;
    case 'tuto-restart': { const t = tuto(); t.hidden = false; t.step = 0; t.sold = false; closeModal(); render(true); break; }
    case 'stage-info': openModal(`<div class="kicker">Progression</div><h1>Votre ascension</h1><table class="t">${STAGES.map(s => `<tr><td>${P().unlocked[s.n] ? '✔' : '·'}</td><td><b>${s.name}</b></td><td>${esc(s.need)}</td></tr>`).join('')}</table><p class="note">Valeur nette actuelle : ${fmt(E.netWorth())} § · Prestige : ${E.prestige()}</p><div class="actions"><button class="btn primary" data-act="close">Fermer</button></div>`); break;
    case 'newgame-ask': openModal(`<h1>Nouvelle partie ?</h1><p>La partie en cours sera remplacée.</p><div class="actions"><button class="btn" data-act="close">Annuler</button><button class="btn danger" data-act="new">Recommencer</button></div>`); break;
    case 'new': startNew(); break;
    case 'continue': closeModal(); setSpeed(0); render(true); break;
    case 'close': closeModal(); if (ui.resumeAfter) { ui.resumeAfter = false; setSpeed(ui.lastSpeed || 1); } break;
    case 'alert-next': showAlert(); break;
    case 'alert-all': ui.modalQueue = []; closeModal(); setSpeed(ui.lastSpeed || 1); break;
    case 'alert-resume': if (ui.modalQueue.length) showAlert(); else { closeModal(); setSpeed(ui.lastSpeed || 1); } break;
  }
});
function bindValue(t) {
  const k = t.dataset.bind;
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'bq' || k === 'sq') { const mx = +t.max || Infinity; v = Math.max(1, Math.min(mx, Math.floor(+v || 1))); }
  ui.form[k.startsWith('cargo.') ? '_' : k] = v;
  if (k.startsWith('cargo.')) { ui.form.cargo[k.slice(6)] = v; delete ui.form._; }
  return k;
}
document.addEventListener('input', e => {
  const t = e.target.closest('[data-bind]');
  if (!t || t.tagName !== 'INPUT' || t.type === 'radio' || t.type === 'checkbox') return;
  const k = bindValue(t);
  if (k === 'bq' || k === 'sq') { document.querySelectorAll(`[data-bind="${k}"]`).forEach(x => { if (x !== t) x.value = t.value; }); updateTrade(); }
  if (k === 'sp') updateTrade();
});
document.addEventListener('change', e => {
  const t = e.target.closest('[data-bind]'); if (!t) return;
  const k = bindValue(t);
  if (k === 'bq' || k === 'sq' || k === 'sp') { updateTrade(); return; }
  if (['from', 'to', 'mode', 'shipId', 'optN', 'qty', 'price'].includes(k) || t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'checkbox') {
    if (k === 'from') ui.form.cargo = {};
    t.blur(); render(true);
  }
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { if (e.key === 'Enter') { e.target.blur(); render(true); } return; }
  if ($('modal').classList.contains('on')) { if (e.key === 'Escape' && !$('modal').querySelector('[data-act="new"]')) { if (ui.modalQueue.length || $('modal').querySelector('[data-act="alert-resume"]')) return; closeModal(); } return; }
  if (e.key === ' ') { e.preventDefault(); setSpeed(ui.speed ? 0 : (ui.lastSpeed || 1)); if (ui.speed) ui.lastSpeed = ui.speed; }
  if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(3); if (e.key === '3') setSpeed(8);
});
document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { setSpeed(+b.dataset.v); if (+b.dataset.v) ui.lastSpeed = +b.dataset.v; }));

function startNew() {
  closeModal();
  $('panel').innerHTML = '<p class="note">L\'archipel s\'éveille…</p>';
  setTimeout(() => {
    E.newGame();
    ui.sel = 'port'; ui.tab = 'bourse'; ui.good = null; shipEls.forEach(el => el.remove()); shipEls.clear(); ui.routesDay = null; jLen = -1; ui.mview = 'carte'; ui.jSeen = 0; document.body.dataset.view = 'carte';
    S().alerts = [];
    save(true);
    setSpeed(0);
    render(true);
    toast('Cliquez sur un bien dans la bourse pour l\'acheter ou le vendre, puis lancez le temps avec ▶.');
  }, 30);
}

// ---------------------------------------------------------------- démarrage
ui.portrait = isM() && window.innerHeight > window.innerWidth;
buildMap();
document.body.classList.toggle('m', isM()); document.body.classList.toggle('portrait', ui.portrait); document.body.dataset.view = ui.mview;
window.addEventListener('resize', () => applyMobile());
document.addEventListener('visibilitychange', () => { if (document.hidden && S()) save(true); });
if (loadSave()) { render(true); openModal(helpHtml(true), true); }
else { E.newGame(); S().alerts = []; render(true); openModal(helpHtml(true), true); }
setSpeed(0);
requestAnimationFrame(frame);
})();
