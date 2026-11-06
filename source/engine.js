// L'Archipel des Brumes — moteur de simulation (sans interface)
(function (root) {
'use strict';
const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.ARCHIPEL_DATA;
const { GOODS, G, RECIPES, STRATA, NEEDS, INCOME, ISLANDS, I, ROUTES, SEASON_LEN, RAW_SEASON, STORM_SEASON,
  OPTION_GOODS, OPTION_VOL, OPTION_SIZE, NPC_DEFS, FACTIONS } = D;

let S = null;

// ---------------------------------------------------------------- utilitaires
function rnd() {
  S.rng = (S.rng + 0x6D2B79F5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const iround = x => { const f = Math.floor(x); return f + (rnd() < x - f ? 1 : 0); };
const r2 = x => Math.round(x * 100) / 100;
const fmt = x => Math.round(x).toLocaleString('fr-FR');

// ---------------------------------------------------------------- géographie
const ADJ = {}; ISLANDS.forEach(i => { ADJ[i.id] = []; });
const ROUTE_INFO = {};
const rkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
ROUTES.forEach(([a, b, danger, fog]) => {
  const days = Math.max(2, Math.round(Math.hypot(I[a].x - I[b].x, I[a].y - I[b].y) / 75));
  ROUTE_INFO[rkey(a, b)] = { a, b, days, danger, fog };
  ADJ[a].push(b); ADJ[b].push(a);
});
const PATH = {};
ISLANDS.forEach(s => {
  const dist = {}, prev = {}, done = {};
  ISLANDS.forEach(i => { dist[i.id] = Infinity; });
  dist[s.id] = 0;
  for (;;) {
    let u = null;
    for (const k in dist) if (!done[k] && dist[k] < Infinity && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    done[u] = true;
    ADJ[u].forEach(v => { const d = dist[u] + ROUTE_INFO[rkey(u, v)].days; if (d < dist[v]) { dist[v] = d; prev[v] = u; } });
  }
  PATH[s.id] = {};
  ISLANDS.forEach(t => {
    const nodes = [t.id]; let c = t.id;
    while (c !== s.id) { c = prev[c]; nodes.unshift(c); }
    let danger = 0, fog = 0;
    for (let k = 0; k < nodes.length - 1; k++) { const r = ROUTE_INFO[rkey(nodes[k], nodes[k + 1])]; danger = Math.max(danger, r.danger); fog = Math.max(fog, r.fog); }
    PATH[s.id][t.id] = { days: dist[t.id], nodes, danger, fog };
  });
});

// ---------------------------------------------------------------- temps
const day = () => Math.floor(S.hour / 24);
const gday = () => day() - S.startDay;
const seasonIdx = (gd = gday()) => Math.floor((((gd % 360) + 360) % 360) / SEASON_LEN);
const year = (gd = gday()) => Math.floor(gd / 360) + 1;
const seasonStart = (gd = gday()) => gd - (((gd % SEASON_LEN) + SEASON_LEN) % SEASON_LEN);

// ---------------------------------------------------------------- comptes
function mkAcct(id, cash, inf) {
  const a = { id, cash, inf: !!inf, stock: {} };
  ISLANDS.forEach(i => { a.stock[i.id] = {}; });
  S.accounts[id] = a;
  return a;
}
const stockOf = (a, isl, g) => a.stock[isl][g] || 0;
function addStock(a, isl, g, q) {
  const v = (a.stock[isl][g] || 0) + q;
  if (v <= 0) delete a.stock[isl][g]; else a.stock[isl][g] = v;
}
const P = () => S.player;
const PA = () => S.accounts.player;

// ---------------------------------------------------------------- journal & nouvelles
function log(cat, text, opt) {
  if (S.warm) return;
  opt = opt || {};
  const entry = { d: gday(), h: S.hour % 24, cat, text };
  S.journal.push(entry);
  if (S.journal.length > 300) S.journal.shift();
  if (opt.alert) S.alerts.push({ title: opt.alert, text, cat, pause: opt.pause !== false });
}
// nouvelle soumise au brouillard : arrive au joueur après le délai d'information de l'île d'origine
function news(origin, cat, text, opt) {
  if (S.warm) return;
  const delay = infoDelay(origin);
  if (delay <= 0) log(cat, text, opt);
  else S.pendingNews.push({ at: day() + delay, created: day(), cat, text, opt: opt || {}, origin });
}
function deliverNews() {
  const d = day();
  const keep = [];
  for (const n of S.pendingNews) {
    if (n.at <= d) log(n.cat, n.text + ` (nouvelle vieille de ${d - n.created} j)`, n.opt);
    else keep.push(n);
  }
  S.pendingNews = keep;
}

// ---------------------------------------------------------------- information
function present(isl) { return P().comptoirs.includes(isl); }
function infoDelay(isl) {
  if (present(isl)) return 0;
  if (P().informants.includes(isl)) return 1;
  let best = Infinity;
  P().comptoirs.forEach(c => { best = Math.min(best, PATH[isl][c].days); });
  if (P().colombier) best = best * 0.5;
  return Math.max(1, Math.ceil(best));
}

// ---------------------------------------------------------------- carnets d'ordres
function insert(arr, o, desc) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, x = arr[mid];
    const before = desc ? (x.price > o.price || (x.price === o.price && x.t <= o.t))
                        : (x.price < o.price || (x.price === o.price && x.t <= o.t));
    if (before) lo = mid + 1; else hi = mid;
  }
  arr.splice(lo, 0, o);
}
function refund(o, isl, g) {
  const a = S.accounts[o.a];
  if (o.side === 'buy') { if (!a.inf && o.esc > 0) a.cash += o.esc; o.esc = 0; }
  else if (o.qty > 0) addStock(a, isl, g, o.qty);
  o.qty = 0;
}
function exec(isl, g, bo, so, q, p, resting) {
  const ba = S.accounts[bo.a], sa = S.accounts[so.a], b = S.books[isl][g];
  bo.qty -= q; so.qty -= q;
  if (!ba.inf) { bo.esc -= p * q * (1 + bo.tax); if (bo.qty <= 0 && bo.esc > 0) { ba.cash += bo.esc; bo.esc = 0; } }
  addStock(ba, isl, g, q);
  if (!sa.inf) sa.cash += p * q * (1 - so.tax);
  S.isl[isl].treasury += p * q * (bo.tax + so.tax);
  b.last = p; b.vol += q; b.vN += p * q; b.vD += q;
  if (S.diag) S.diag.push([gday(), isl, g, bo.a, so.a, q, r2(p)]);
  if (resting && resting.a === 'player') {
    log('bourse', `Ordre exécuté à ${I[isl].name} : ${resting.side === 'buy' ? 'achat' : 'vente'} de ${q} ${G[g].name} à ${r2(p)} §.`);
  }
}
function place(aid, isl, g, side, price, qty, opt) {
  opt = opt || {};
  qty = Math.floor(qty);
  price = r2(price);
  if (!(qty > 0) || !(price > 0)) return { filled: 0, cost: 0 };
  const st = S.isl[isl];
  if (st.banned[g]) return { filled: 0, cost: 0, err: 'interdit' };
  const a = S.accounts[aid], tax = st.tax, b = S.books[isl][g];
  const o = { id: S.seq++, a: aid, side, price, qty, t: S.seq, tax, exp: S.hour + (opt.ttl || 24 * 7) };
  if (side === 'buy') {
    if (!a.inf) {
      if (opt.ioc) {
        o.esc = Math.min(a.cash, price * qty * (1 + tax));
        if (o.esc < (b.asks.length ? b.asks[0].price : price) * (1 + tax)) return { filled: 0, cost: 0, err: 'fonds' };
      } else {
        const max = Math.floor(a.cash / (price * (1 + tax)) + 1e-9);
        if (max < qty) qty = max;
        if (qty <= 0) return { filled: 0, cost: 0, err: 'fonds' };
        o.qty = qty;
        o.esc = price * qty * (1 + tax);
      }
      a.cash -= o.esc;
    }
  } else {
    const have = stockOf(a, isl, g);
    if (have < qty) qty = have;
    if (qty <= 0) return { filled: 0, cost: 0, err: 'stock' };
    o.qty = qty;
    addStock(a, isl, g, -qty);
  }
  const res = { filled: 0, cost: 0, order: null };
  const opp = side === 'buy' ? b.asks : b.bids;
  while (o.qty > 0 && opp.length) {
    const r = opp[0];
    if (side === 'buy' ? r.price > o.price : r.price < o.price) break;
    let q = Math.min(o.qty, r.qty);
    const bo = side === 'buy' ? o : r;
    if (!S.accounts[bo.a].inf) q = Math.min(q, Math.floor(bo.esc / (r.price * (1 + bo.tax)) + 1e-9));
    if (q <= 0) break;
    exec(isl, g, side === 'buy' ? o : r, side === 'buy' ? r : o, q, r.price, r);
    res.filled += q; res.cost += r.price * q;
    if (r.qty <= 0) opp.shift();
  }
  if (o.qty > 0) {
    if (opt.ioc) refund(o, isl, g);
    else { insert(side === 'buy' ? b.bids : b.asks, o, side === 'buy'); res.order = o; }
  }
  return res;
}
function cancelOrders(aid, isl, g) {
  const isls = isl ? [isl] : ISLANDS.map(i => i.id);
  isls.forEach(x => {
    const goods = g ? [g] : GOODS.map(z => z.id);
    goods.forEach(y => {
      const b = S.books[x][y];
      ['bids', 'asks'].forEach(side => {
        if (!b[side].some(o => o.a === aid)) return;
        b[side] = b[side].filter(o => { if (o.a === aid) { refund(o, x, y); return false; } return true; });
      });
    });
  });
}
function expireOrders() {
  ISLANDS.forEach(i => GOODS.forEach(g => {
    const b = S.books[i.id][g.id];
    ['bids', 'asks'].forEach(side => {
      b[side] = b[side].filter(o => {
        if (o.exp <= S.hour || o.qty <= 0) {
          if (o.a === 'player' && o.qty > 0) log('bourse', `Votre ordre sur ${G[g.id].name} à ${I[i.id].name} a expiré.`);
          refund(o, i.id, g.id); return false;
        }
        return true;
      });
    });
  }));
}
const bestBid = (isl, g) => { const b = S.books[isl][g].bids; return b.length ? b[0].price : null; };
const bestAsk = (isl, g) => { const b = S.books[isl][g].asks; return b.length ? b[0].price : null; };
function ownAsk(aid, isl, g) { let q = 0; for (const o of S.books[isl][g].asks) if (o.a === aid) q += o.qty; return q; }
function depthBid(isl, g, minP) { let q = 0; for (const o of S.books[isl][g].bids) { if (o.price < minP) break; q += o.qty; } return q; }
function depthAsk(isl, g, maxP) { let q = 0; for (const o of S.books[isl][g].asks) { if (o.price > maxP) break; q += o.qty; } return q; }

// ---------------------------------------------------------------- modificateurs
function prodMult(isl, g) {
  let m = 1;
  S.isl[isl].mods.forEach(x => { if (x.g === g && x.until > gday()) m *= x.mult; });
  if (S.isl[isl].strikeUntil > gday()) m *= 0.35;
  return m;
}
function fadMult(isl, g) {
  let m = 1;
  S.isl[isl].fads.forEach(x => { if (x.g === g && x.until > gday()) m *= x.mult; });
  return m;
}
const striking = isl => S.isl[isl].strikeUntil > gday();
const embargoed = (a, b) => S.embargos.some(e => e.until > gday() && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));

// ---------------------------------------------------------------- nouvelle partie
function newGame(seed) {
  seed = (seed == null ? Math.floor(Math.random() * 1e9) : seed) >>> 0;
  S = { v: 1, seed, rng: seed, hour: 0, startDay: 40, seq: 1, accounts: {}, books: {}, isl: {}, npcs: {},
    shipments: [], rumors: [], events: [], embargos: [], council: {}, optSeries: [], journal: [], alerts: [],
    pendingNews: [], contracts: [], warm: true, netHist: [], blackSold: {} };
  ISLANDS.forEach(i => {
    const strata = {};
    STRATA.forEach((s, k) => { strata[s] = { pop: i.pop[k], sat: 0.85, def: {}, m: {}, pmax: {} }; });
    S.isl[i.id] = { strata, tax: i.tax, tariffs: {}, banned: {}, treasury: 0, mods: [], fads: [], strikeUntil: -999,
      lowSat: 0, strikeCooldown: -999, wage: 2.5, subsidyUntil: -999, snaps: [], suspicion: 0, investigating: false, laws: [] };
    (i.banned || []).forEach(g => { S.isl[i.id].banned[g] = true; });
    S.books[i.id] = {};
    GOODS.forEach(g => {
      S.books[i.id][g.id] = { bids: [], asks: [], ema: g.base, last: g.base, vN: 0, vD: 0, vol: 0, volEma: 3, hist: [], unmet: 0, unmetP: 0, sent: 0 };
    });
    const c = mkAcct('cpt:' + i.id, 0, true);
    GOODS.forEach(g => { if (!S.isl[i.id].banned[g.id]) c.stock[i.id][g.id] = 12; });
    const pr = mkAcct('prod:' + i.id, 0, true);
    Object.keys(i.raw).forEach(g => { pr.stock[i.id][g] = Math.round(i.raw[g] * 2); });
    STRATA.forEach(s => mkAcct('pop:' + i.id + ':' + s, 0, false));
  });
  NPC_DEFS.forEach(d => {
    const n = { id: d.id, name: d.name, role: d.role, home: d.home, title: d.title || '', style: d.style || null, smuggler: !!d.smuggler,
      traits: { audace: rint(2, 9), avidite: rint(2, 9), credulite: rint(1, 9), loyaute: rint(2, 9), rancune: rint(1, 9) },
      rel: 0, favors: 0, memory: [], gen: 1 };
    if (d.role === 'industriel') n.ws = { recipe: d.recipe, level: d.level, isl: d.home, broke: 0 };
    if (d.role === 'capitaine') n.ship = { at: d.home, status: 'idle', cap: 600, plan: null, idle: 0, sell: 0, items: null, costs: null };
    if (d.role === 'speculateur') n.spec = { target: null, since: 0, entry: 0 };
    S.npcs[d.id] = n;
    const cash = d.role === 'industriel' ? 2500 : d.role === 'capitaine' ? 3000 : d.role === 'speculateur' ? 4000 : 0;
    const a = mkAcct('npc:' + d.id, cash, d.role === 'notable');
    if (n.ws) {
      const r = RECIPES[n.ws.recipe];
      Object.keys(r.in).forEach(g => { a.stock[n.home][g] = r.in[g] * r.perDay * n.ws.level * 5; });
      a.stock[n.home][n.ws.recipe] = r.out * r.perDay * n.ws.level;
    }
  });
  mkAcct('player', 1500, false);
  mkAcct('cab', 0, true);
  S.player = { comptoirs: ['port'], seat: false, colombier: false, informants: [], ships: [], workshops: [], options: [],
    fiabilite: 50, prestigeBase: 0, probite: 70, banUntil: {}, unlocked: { 1: true }, stage: 1, revealed: {}, insider: {},
    contractsDone: 0, contractsFailed: 0, sway: {}, broke: 0, ruins: 0, started: false };
  // pop : un jour de stock
  ISLANDS.forEach(i => STRATA.forEach(s => {
    const a = S.accounts['pop:' + i.id + ':' + s];
    NEEDS[s].forEach(n => { if (!S.isl[i.id].banned[n.g]) a.stock[i.id][n.g] = Math.floor(n.q * S.isl[i.id].strata[s].pop / 100 * 4); });
  }));
  // période de chauffe : l'économie tourne seule avant l'arrivée du joueur
  const warmHours = S.startDay * 24;
  while (S.hour < warmHours) tick();
  S.warm = false;
  startGame();
  return S;
}

function startGame() {
  newSeason(true);
  S.player.started = true;
  log('info', "Vous débarquez à Port-Sablier avec 1 500 Sceaux et un petit comptoir. L'archipel vous attend.");
}

// ---------------------------------------------------------------- boucle principale
function tick() {
  const h = S.hour % 24;
  if (h === 0) dayStart();
  if (h === 2 || h === 10 || h === 18) ISLANDS.forEach(i => popWave(i.id));
  if (h === 6 || h === 15) capitainesAct();
  if (h === 8) cabotage();
  if (h === 1 || h === 13) cabotageSell();
  if (h === 12) ISLANDS.forEach(i => producersQuote(i.id, true));
  if (h === 12) industrialsQuote();
  if (h % 6 === 3) speculatorsAct();
  arrivals();
  if (h === 23) dayEnd();
  S.hour++;
}

function dayStart() {
  const gd = gday();
  expireOrders();
  if (!S.warm) {
    if (gd > 0 && gd % SEASON_LEN === 0) newSeason(false);
    processEvents();
    spreadRumors();
    randomEvents();
    if (((gd % SEASON_LEN) + SEASON_LEN) % SEASON_LEN === 30) councilVote();
    contractsDaily();
    playerUpkeep();
    seaRisks();
    suspicionDaily();
  }
  ISLANDS.forEach(i => {
    const st = S.isl[i.id];
    // salaire
    let pool = (st.strata.manouvriers.pop + st.strata.artisans.pop) * 0.04, emp = 0;
    Object.values(S.npcs).forEach(n => { if (n.ws && n.ws.isl === i.id) emp += RECIPES[n.ws.recipe].workers * n.ws.level; });
    P().workshops.forEach(w => { if (w.isl === i.id && w.on) emp += RECIPES[w.recipe].workers * w.level; });
    st.wage = r2(2.5 * (1 + Math.max(0, emp / pool - 0.5) * 3) * (st.subsidyUntil > gd ? 0.8 : 1));
    // budgets de la population
    const incomeMult = (0.75 + 0.25 * st.wage / 2.5) * (striking(i.id) ? 0.7 : 1);
    STRATA.forEach(s => { S.accounts['pop:' + i.id + ':' + s].cash = st.strata[s].pop * INCOME[s] * incomeMult; });
    producersProduce(i.id);
    producersQuote(i.id, false);
    comptoirQuote(i.id);
  });
  industrialsProduce();
  industrialsQuote();
  if (!S.warm) playerWorkshops();
  S.blackSold = {};
}

function dayEnd() {
  ISLANDS.forEach(i => popConsume(i.id));
  // péremption
  Object.values(S.accounts).forEach(a => {
    ISLANDS.forEach(i => {
      const st = a.stock[i.id];
      for (const g in st) { const pr = G[g].perish; if (pr > 0) { const loss = iround(st[g] * pr); if (loss > 0) addStock(a, i.id, g, -loss); } }
    });
  });
  // prix de référence, historique, sentiment
  ISLANDS.forEach(i => {
    const snap = { d: gday(), p: {} };
    GOODS.forEach(g => {
      const b = S.books[i.id][g.id];
      if (b.vD > 0) { const vwap = b.vN / b.vD; b.ema = b.ema * 0.6 + vwap * 0.4; }
      if (b.unmet >= 1 && b.unmet > 0.3 * b.vD && b.unmetP > b.ema) b.ema = Math.min(b.ema * 1.06, b.ema * 0.85 + b.unmetP * 0.15);
      const ba = bestAsk(i.id, g.id), bb = bestBid(i.id, g.id);
      if (b.vD === 0 && ba != null && ba < b.ema * 0.9) b.ema = b.ema * 0.9 + ba * 0.1;
      if (b.vD < 1 && ba != null && b.unmetP > 0 && ba > b.unmetP) b.ema = b.ema * 0.8 + 0.2 * (ba + b.unmetP) / 2;
      if (b.vD === 0 && bb != null && bb > b.ema * 1.1) b.ema = b.ema * 0.9 + bb * 0.1;
      b.ema += (g.base - b.ema) * (b.vD > 0 ? 0.006 : 0.03); // ancrage de la Banque
      b.ema = clamp(b.ema, g.base * 0.2, g.base * 8);
      const close = r2(b.ema);
      b.hist.push(close);
      if (b.hist.length > 400) b.hist.shift();
      b.volEma = b.volEma * 0.8 + b.vol * 0.2;
      b.unmetEma = (b.unmetEma || 0) * 0.7 + b.unmet * 0.3;
      const h = b.hist, n = h.length;
      const mom = n > 5 ? h[n - 1] / h[n - 6] - 1 : 0;
      b.sent = clamp(b.sent * 0.9 + clamp(mom * 120, -12, 12), -100, 100);
      snap.p[g.id] = [close, bb, ba, b.vol];
      b.unmetPL = b.unmet >= 1 ? b.unmetP : 0;
      b.vN = 0; b.vD = 0; b.vol = 0; b.unmet = 0; b.unmetP = 0;
    });
    const st = S.isl[i.id];
    st.snaps.push(snap);
    if (st.snaps.length > 120) st.snaps.shift();
    // grèves
    if (!S.warm) {
      if (st.strata.manouvriers.sat < 0.45 && !striking(i.id) && st.strikeCooldown < gday()) st.lowSat++;
      else st.lowSat = 0;
      if (st.lowSat >= 5) planStrike(i.id);
    }
  });
  if (!S.warm) {
    optionsExpiry();
    contractsDeadlines();
    deliverNews();
    updateStage();
    const nw = netWorth();
    S.netHist.push(Math.round(nw));
    if (S.netHist.length > 720) S.netHist.shift();
    checkRuin(nw);
  }
}

// ---------------------------------------------------------------- production primaire
function producersProduce(isl) {
  const a = S.accounts['prod:' + isl], raw = I[isl].raw, si = seasonIdx();
  Object.keys(raw).forEach(g => {
    const elastic = clamp(0.35 + 0.65 * S.books[isl][g].ema / G[g].base, 0.3, 1.2); // on produit moins quand ça ne paie pas
    const base = raw[g] * (RAW_SEASON[g] ? RAW_SEASON[g][si] : 1) * prodMult(isl, g) * elastic;
    const have = stockOf(a, isl, g) + ownAsk(a.id, isl, g);
    if (have > raw[g] * 5) return;
    addStock(a, isl, g, iround(base));
  });
}
function producersQuote(isl, midday) {
  const a = S.accounts['prod:' + isl], raw = I[isl].raw;
  Object.keys(raw).forEach(g => {
    cancelOrders(a.id, isl, g);
    const have = stockOf(a, isl, g);
    if (have <= 0) return;
    const b = S.books[isl][g];
    let f = clamp(1.12 - 0.25 * (have / (raw[g] * 3)), 0.55, 1.3);
    let qty = have;
    if (b.sent > 25) { f *= 1 + b.sent / 400; qty = Math.floor(have * 0.7); }
    if (midday) f *= 0.98;
    place(a.id, isl, g, 'sell', Math.max(b.ema * f, G[g].base * 0.2), qty, { ttl: 24 });
  });
}
function comptoirQuote(isl) {
  const a = S.accounts['cpt:' + isl];
  cancelOrders(a.id, isl);
  GOODS.forEach(g => {
    if (S.isl[isl].banned[g.id]) return;
    let inv = stockOf(a, isl, g.id);
    if (inv < 12 && rnd() < 0.5) { addStock(a, isl, g.id, 1); inv++; }
    if (inv > 80) { addStock(a, isl, g.id, -Math.floor((inv - 80) / 2)); inv = stockOf(a, isl, g.id); }
    const b = S.books[isl][g.id];
    if (inv < 150) place(a.id, isl, g.id, 'buy', b.ema * 0.6, 20, { ttl: 24 });
    if (inv > 0) place(a.id, isl, g.id, 'sell', b.ema * 1.45, Math.min(inv, 10), { ttl: 24 });
  });
}

// ---------------------------------------------------------------- industriels
function workshopRun(aid, isl, recipe, level, payWages) {
  const a = S.accounts[aid], r = RECIPES[recipe];
  if (striking(isl)) return 0;
  const cap = r.perDay * level;
  let batches = cap;
  Object.keys(r.in).forEach(g => { batches = Math.min(batches, Math.floor(stockOf(a, isl, g) / r.in[g])); });
  if (batches <= 0) return 0;
  const wageFull = r.workers * level * S.isl[isl].wage;
  if (payWages) {
    const cost = wageFull * batches / cap;
    if (a.cash < cost) batches = Math.floor(cap * a.cash / wageFull);
    if (batches <= 0) return 0;
    a.cash -= wageFull * batches / cap;
  }
  Object.keys(r.in).forEach(g => addStock(a, isl, g, -r.in[g] * batches));
  addStock(a, isl, recipe, r.out * batches);
  return batches;
}
function industrialsProduce() {
  Object.values(S.npcs).forEach(n => {
    if (!n.ws) return;
    const a = S.accounts['npc:' + n.id], r = RECIPES[n.ws.recipe];
    const capOut = r.perDay * n.ws.level * r.out;
    if (stockOf(a, n.home, n.ws.recipe) + ownAsk(a.id, n.home, n.ws.recipe) > capOut * 4) return;
    let inCost = 0; Object.keys(r.in).forEach(g => { inCost += r.in[g] * S.books[n.home][g].ema; });
    const ratio = S.books[n.home][n.ws.recipe].ema * r.out / Math.max(1, inCost);
    if (ratio < 1.05 && stockOf(a, n.home, n.ws.recipe) + ownAsk(a.id, n.home, n.ws.recipe) > capOut) return;
    const made = workshopRun(a.id, n.home, n.ws.recipe, n.ws.level, true);
    if (made === 0 && a.cash < 60) n.ws.broke++; else n.ws.broke = 0;
    if (n.ws.broke >= 12) npcBankrupt(n);
  });
}
function industrialsQuote() {
  Object.values(S.npcs).forEach(n => {
    if (!n.ws) return;
    const isl = n.home, a = S.accounts['npc:' + n.id], r = RECIPES[n.ws.recipe], out = n.ws.recipe;
    cancelOrders(a.id, isl);
    if (a.cash < 600) a.cash = 600; // avance de la guilde
    const capOut = r.perDay * n.ws.level * r.out;
    const bo = S.books[isl][out];
    // coût des intrants au prix courant
    let inCost = 0;
    Object.keys(r.in).forEach(g => { inCost += r.in[g] * S.books[isl][g].ema; });
    const unitCost = (inCost + r.workers * S.isl[isl].wage / r.perDay) / r.out;
    const have = stockOf(a, isl, out);
    if (have > 0) {
      let f = clamp(1.12 - 0.3 * (have / (capOut * 2)), 0.8, 1.3) * (1 + (n.traits.avidite - 5) * 0.01);
      if (bo.sent > 25) f *= 1 + bo.sent / 400;
      place(a.id, isl, out, 'sell', Math.max(bo.ema * f, unitCost * 0.92), have, { ttl: 24 });
    }
    // achat des intrants
    const outValue = r.out * Math.max(bo.ema, unitCost * 0.9) / 1.06 - r.workers * S.isl[isl].wage / r.perDay;
    let spendable = a.cash * 0.85;
    Object.keys(r.in).forEach(g => {
      const bi = S.books[isl][g];
      let target = r.in[g] * r.perDay * n.ws.level * 3;
      if (bi.sent > 30) target *= 1.5;
      const need = target - stockOf(a, isl, g);
      bi.indWant = Math.max(0, need);
      if (need <= 0) return;
      const share = (r.in[g] * bi.ema) / inCost;
      const maxP = outValue * share / r.in[g];
      const p = Math.min(bi.ema * (1.03 + 0.12 * need / target), maxP);
      if (p <= 0) return;
      const q = Math.min(need, Math.floor(spendable * share / p));
      if (q > 0) { place(a.id, isl, g, 'buy', p, q, { ttl: 24 }); }
    });
  });
}
function npcBankrupt(n) {
  const a = S.accounts['npc:' + n.id];
  // liquidation : le stock est mis en vente à prix cassé
  cancelOrders(a.id);
  ISLANDS.forEach(i => { for (const g in a.stock[i.id]) place(a.id, i.id, g, 'sell', S.books[i.id][g].ema * 0.7, a.stock[i.id][g], { ttl: 24 * 5 }); });
  const old = n.name;
  n.gen++;
  n.name = old.replace(/ (fils|fille|II|III|IV|V)$/, '') + (n.gen === 2 ? ' II' : n.gen === 3 ? ' III' : ' ' + n.gen);
  a.cash = 2000;
  n.ws.broke = 0;
  n.rel = Math.round(n.rel / 2);
  news(n.home, 'faillite', `Faillite de ${old} à ${I[n.home].name}. Son stock est bradé ; ${n.name} reprend l'affaire.`, { alert: 'Faillite' });
}

// ---------------------------------------------------------------- population
const BASKET_SHARE = {};
STRATA.forEach(s => { let tot = 0; NEEDS[s].forEach(n => { tot += n.q * G[n.g].base; }); BASKET_SHARE[s] = {}; NEEDS[s].forEach(n => { BASKET_SHARE[s][n.g] = n.q * G[n.g].base / tot; }); });
function popWave(isl) {
  const st = S.isl[isl];
  STRATA.forEach(s => {
    const a = S.accounts['pop:' + isl + ':' + s], sp = st.strata[s];
    const list = [];
    let C = 0;
    NEEDS[s].forEach(n => {
      if (st.banned[n.g]) return;
      const b = S.books[isl][n.g];
      const need = n.q * sp.pop / 100 * fadMult(isl, n.g);
      const hoard = (n.u >= 0.7 && b.sent > 20) ? b.sent / 100 : 0;
      const want = Math.ceil(Math.min(sp.def[n.g] || 0, need) + need * (1 + hoard)) - stockOf(a, isl, n.g);
      if (want >= 1) { list.push({ n, want, b }); C += want * b.ema; }
    });
    if (!list.length) return;
    const bf = clamp(a.cash / C, 0.5, 1);
    list.sort((x, y) => y.n.u - x.n.u).forEach(({ n, want, b }) => {
      const m = sp.m[n.g] || 0;
      const need = n.q * sp.pop / 100 * fadMult(isl, n.g);
      const afford = a.cash * BASKET_SHARE[s][n.g] * 1.6 / Math.max(0.5, need);
      const pmax = Math.min(b.ema * (1 + n.u * m) * bf * 1.04, afford, G[n.g].base * 6);
      sp.pmax[n.g] = pmax;
      place(a.id, isl, n.g, 'buy', pmax, want, { ioc: true });
    });
  });
}
function popConsume(isl) {
  const st = S.isl[isl];
  let manSat = null;
  STRATA.forEach(s => {
    const a = S.accounts['pop:' + isl + ':' + s], sp = st.strata[s];
    let su = 0, sf = 0;
    NEEDS[s].forEach(n => {
      const need = n.q * sp.pop / 100 * fadMult(isl, n.g);
      let def = (sp.def[n.g] || 0) + need;
      const c = Math.min(stockOf(a, isl, n.g), Math.floor(def));
      if (c > 0) addStock(a, isl, n.g, -c);
      def = Math.min(def - c, need * 3);
      sp.def[n.g] = def;
      sp.m[n.g] = clamp(def / Math.max(need, 0.5) - 0.5, 0, 2);
      const fill = need < 1 ? (def < 1.5 ? 1 : 0.5) : clamp((c + 0.5) / need, 0, 1);
      su += n.u; sf += n.u * fill;
      if (def >= 1 && !st.banned[n.g]) { const b = S.books[isl][n.g]; b.unmet += def; b.unmetP = Math.max(b.unmetP, sp.pmax[n.g] || b.ema); }
    });
    sp.sat = sp.sat * 0.8 + (sf / su) * 0.2;
    if (!S.warm) {
      if (sp.sat > 0.85) sp.pop *= 1.0006;
      else if (sp.sat < 0.5) sp.pop *= 0.9985;
    }
    if (s === 'manouvriers') manSat = sp.sat;
  });
  return manSat;
}

// ---------------------------------------------------------------- capitaines
function freightCost(days) { return 0.3 + 0.1 * days; }
function inboundQty(dest, g) {
  let q = 0;
  Object.values(S.npcs).forEach(n => {
    if (!n.ship) return;
    const sh = n.ship;
    if ((sh.status === 'sailing' || sh.status === 'loading' || sh.status === 'repos') && sh.plan === dest && sh.items) q += sh.items[g] || 0;
    if (sh.status === 'selling' && sh.at === dest) q += stockOf(S.accounts['npc:' + n.id], dest, g);
  });
  return q;
}
function claimedAt(A, g, except) {
  let q = 0;
  Object.values(S.npcs).forEach(m => { if (m.ship && m !== except && m.ship.status === 'repos' && m.ship.from === A && m.ship.items) q += m.ship.items[g] || 0; });
  return q;
}
function bestTrade(n, A, extraDays, opt) {
  A = A || n.ship.at; extraDays = extraDays || 0;
  const a = S.accounts['npc:' + n.id];
  let best = null;
  GOODS.forEach(g => {
    if (S.isl[A].banned[g.id]) return;
    const ask = bestAsk(A, g.id);
    if (ask == null) return;
    const avail = depthAsk(A, g.id, ask * 1.08) - claimedAt(A, g.id, n);
    if (avail < 5) return;
    ISLANDS.forEach(B => {
      const Bi = B.id;
      if (Bi === A || embargoed(A, Bi)) return;
      const banned = S.isl[Bi].banned[g.id];
      if (banned && !n.smuggler) return;
      const pth = PATH[A][Bi], bB = S.books[Bi][g.id];
      if (G[g.id].perish > 0.02 && pth.days > 4) return;
      const inb = inboundQty(Bi, g.id);
      const sellable = banned ? 40 : bB.volEma * 7 + (bB.unmetEma || 0) * 4 + (bB.indWant || 0) * 1.5 + depthBid(Bi, g.id, ask * 1.1) - inb;
      if (sellable < 5) return;
      let est = bB.ema * 0.97;
      if (bB.volEma < 2 && (bB.unmetPL || 0) > 0) est = Math.min(est, Math.max(bB.unmetPL, bestBid(Bi, g.id) || 0));
      if ((bB.unmetEma || 0) > 1) est *= 1.04;
      if (banned) est = bB.ema * 1.6;
      const tariff = n.smuggler ? 0 : (S.isl[Bi].tariffs[g.id] || 0) * bB.ema;
      const cost = ask * 1.03 * (1 + S.isl[A].tax) + freightCost(pth.days) + tariff + est * G[g.id].perish * pth.days;
      const profit = est * (1 - S.isl[Bi].tax) - cost;
      if (profit <= cost * 0.08) return;
      const q = Math.floor(Math.min(n.ship.cap, avail, sellable, a.cash / (ask * 1.04 * (1 + S.isl[A].tax))));
      if (q < 5) return;
      const score = profit * q / (pth.days + 1 + extraDays);
      if (opt && opt.dest !== Bi) return;
      if (profit * q > 35 && (!best || score > best.score)) best = { g: g.id, dest: Bi, from: A, q, price: ask * 1.03, score, profit };
      if (opt) opt.list.push({ g: g.id, q, price: ask * 1.03, profit });
    });
  });
  return best;
}
// complète la cargaison avec d'autres biens rentables vers la même destination
function fillCargo(n, t) {
  const opt = { dest: t.dest, list: [] };
  bestTrade(n, t.from, 0, opt);
  const items = { [t.g]: t.q }, prices = { [t.g]: t.price };
  let room = n.ship.cap - t.q, cash = S.accounts['npc:' + n.id].cash - t.q * t.price * 1.05;
  opt.list.filter(x => x.g !== t.g).sort((x, y) => y.profit / y.price - x.profit / x.price).forEach(x => {
    const q = Math.floor(Math.min(x.q, room, cash / (x.price * 1.05)));
    if (q >= 5) { items[x.g] = q; prices[x.g] = x.price; room -= q; cash -= q * x.price * 1.05; }
  });
  return { items, prices };
}
function capitainesAct() {
  Object.values(S.npcs).forEach(n => {
    if (!n.ship) return;
    const sh = n.ship, a = S.accounts['npc:' + n.id];
    if (a.cash > 9000) a.cash = 9000;
    if (sh.status === 'idle') {
      cancelOrders(a.id, sh.at);
      for (const g in a.stock[sh.at]) place(a.id, sh.at, g, 'sell', S.books[sh.at][g].ema * 0.92, a.stock[sh.at][g], { ttl: 9 });
      let t = bestTrade(n);
      ISLANDS.forEach(o => {
        if (o.id === sh.at) return;
        const d = PATH[sh.at][o.id].days;
        const u = bestTrade(n, o.id, d);
        if (u && (!t || u.score > t.score * 1.15)) t = u;
      });
      if (t && t.from === sh.at) {
        const c = fillCargo(n, t);
        for (const g in c.items) place(a.id, sh.at, g, 'buy', c.prices[g], c.items[g], { ttl: 8 });
        sh.status = 'loading'; sh.plan = t.dest; sh.items = c.items; sh.costs = c.prices; sh.idle = 0;
      } else if (t) {
        sh.status = 'repos'; sh.from = t.from; sh.plan = t.dest; sh.items = { [t.g]: t.q }; sh.idle = 0;
        launch('npc:' + n.id, sh.at, t.from, {}, { npc: n.id });
      } else {
        sh.idle++;
        if (sh.idle >= 4) {
          const dest = sh.at === 'port' ? pick(ISLANDS.filter(i => i.id !== 'port')).id : (rnd() < 0.6 ? 'port' : pick(ISLANDS.filter(i => i.id !== sh.at)).id);
          sh.status = 'sailing'; sh.plan = dest; sh.items = null; sh.idle = 0;
          launch('npc:' + n.id, sh.at, dest, {}, { npc: n.id });
        }
      }
    } else if (sh.status === 'loading') {
      cancelOrders(a.id, sh.at);
      const cargo = {};
      for (const g in sh.items) { const q = stockOf(a, sh.at, g); if (q > 0) { cargo[g] = q; addStock(a, sh.at, g, -q); } }
      if (Object.keys(cargo).length) {
        sh.items = cargo; sh.status = 'sailing';
        launch('npc:' + n.id, sh.at, sh.plan, cargo, { npc: n.id, smuggle: n.smuggler });
      } else { sh.status = 'idle'; sh.items = null; }
    } else if (sh.status === 'selling') {
      const isl = sh.at;
      cancelOrders(a.id, isl);
      const goods = Object.keys(a.stock[isl]);
      if (!goods.length) { sh.status = 'idle'; sh.items = null; return; }
      sh.sell++;
      if (sh.sell > 4) {
        goods.forEach(g => place(a.id, isl, g, 'sell', S.books[isl][g].ema * 0.55, a.stock[isl][g] || 0, { ioc: true }));
        dumpToComptoir(a, isl);
        sh.status = 'idle'; sh.items = null;
        return;
      }
      goods.forEach(g => {
        const b = S.books[isl][g], cost = (sh.costs && sh.costs[g]) || b.ema * 0.8;
        const floor = sh.sell > 2 ? cost * 0.8 : cost * 1.02;
        place(a.id, isl, g, 'sell', Math.max(b.ema * (1.04 - 0.035 * sh.sell), floor), a.stock[isl][g], { ttl: 10 });
      });
    }
  });
}

// ---------------------------------------------------------------- cabotage (petits caboteurs anonymes)
function cabotage() {
  const cab = S.accounts.cab;
  ROUTES.forEach(([x, y]) => {
    [[x, y], [y, x]].forEach(([A, B]) => {
      if (embargoed(A, B)) return;
      const days = ROUTE_INFO[rkey(A, B)].days;
      GOODS.forEach(g => {
        if (S.isl[A].banned[g.id] || S.isl[B].banned[g.id]) return;
        if (G[g.id].perish > 0.02 && days > 3) return;
        const ask = bestAsk(A, g.id); if (ask == null) return;
        const bB = S.books[B][g.id];
        const demand = (bB.unmetEma || 0) + (bB.indWant || 0) * 0.5 + bB.volEma * 0.3;
        if (demand < 2) return;
        let est = bB.ema;
        if ((bB.unmetPL || 0) > 0 && bB.volEma < 3) est = Math.min(est, bB.unmetPL);
        if (est < ask * 1.22 + freightCost(days) * 2) return;
        const inb = S.shipments.reduce((t, sh) => t + (sh.owner === 'cab' && sh.to === B ? (sh.cargo[g.id] || 0) : 0), 0);
        const q = Math.floor(Math.min(90, demand * 2.5 - inb, depthAsk(A, g.id, ask * 1.08)));
        if (q < 3) return;
        const r = place('cab', A, g.id, 'buy', ask * 1.05, q, { ioc: true });
        if (r.filled > 0) { addStock(cab, A, g.id, -r.filled); launch('cab', A, B, { [g.id]: r.filled }, {}); }
      });
    });
  });
}
function cabotageSell() {
  const cab = S.accounts.cab;
  ISLANDS.forEach(i => {
    cancelOrders('cab', i.id);
    for (const g in cab.stock[i.id]) {
      const q = cab.stock[i.id][g];
      const b = S.books[i.id][g];
      let p = b.ema;
      if ((b.unmetPL || 0) > 0 && b.volEma < 3) p = Math.min(p, b.unmetPL * 0.98);
      place('cab', i.id, g, 'sell', p, q, { ttl: 22 });
    }
  });
}

// ---------------------------------------------------------------- navigation
function launch(owner, from, to, cargo, opt) {
  opt = opt || {};
  const p = PATH[from][to];
  const fogF = 1 + rnd() * 0.4 * p.fog;
  const storm = seasonIdx() === 2 ? 1.12 : 1;
  const hours = Math.max(24, Math.round(p.days * 24 * fogF * storm));
  const sh = { id: S.seq++, owner, from, to, cargo, dep: S.hour, arr: S.hour + hours, nodes: p.nodes,
    escort: !!opt.escort, smuggle: !!opt.smuggle, shipId: opt.shipId || null, npc: opt.npc || null, fret: !!opt.fret };
  S.shipments.push(sh);
  return sh;
}
function arrivals() {
  if (!S.shipments.length) return;
  const keep = [];
  for (const sh of S.shipments) {
    if (sh.arr <= S.hour) deliver(sh); else keep.push(sh);
  }
  S.shipments = keep;
}
function cargoValue(cargo, isl) { let v = 0; for (const g in cargo) v += cargo[g] * S.books[isl][g].ema; return v; }
function deliver(sh) {
  const a = S.accounts[sh.owner], to = sh.to, st = S.isl[to];
  if (sh.npc) {
    const n = S.npcs[sh.npc];
    for (const g in sh.cargo) {
      const q = sh.cargo[g];
      if (q <= 0) continue;
      if (st.banned[g]) {
        // contrebande PNJ : vendue au marché noir local
        if (rnd() < 0.2) { news(to, 'loi', `La garde de ${I[to].name} saisit une cargaison de ${G[g].name} de contrebande.`); continue; }
        a.cash += q * S.books[to][g].ema * 1.6;
        const pa = S.accounts['pop:' + to + ':bourgeois']; addStock(pa, to, g, q);
        continue;
      }
      const tariff = sh.smuggle ? 0 : (st.tariffs[g] || 0) * S.books[to][g].ema * q;
      const pay = Math.min(a.cash, tariff); a.cash -= pay; st.treasury += pay;
      addStock(a, to, g, q);
    }
    n.ship.at = to;
    n.ship.status = Object.keys(sh.cargo).length ? 'selling' : 'idle';
    if (n.ship.status === 'idle' && n.ship.from !== to) { n.ship.items = null; }
    n.ship.sell = 0;
    if (n.ship.status === 'selling') capitaineSellNow(n);
    return;
  }
  if (sh.owner === 'cab') { for (const g in sh.cargo) if (sh.cargo[g] > 0) addStock(a, to, g, sh.cargo[g]); return; }
  // joueur
  const pl = P();
  if (sh.shipId) { const ship = pl.ships.find(s => s.id === sh.shipId); if (ship) { ship.at = to; ship.status = 'idle'; } }
  const parts = [];
  let illicit = false, hidden = sh.smuggle;
  for (const g in sh.cargo) if (st.banned[g] && sh.cargo[g] > 0) illicit = true;
  if (illicit || hidden) {
    const chance = clamp((sh.fret ? 0.35 : 0.18) + st.suspicion / 250 + (pl.probite < 40 ? -0.04 : 0), 0.05, 0.85);
    if (rnd() < chance) {
      const val = cargoValue(sh.cargo, to);
      const seized = {};
      for (const g in sh.cargo) if (hidden || st.banned[g]) seized[g] = sh.cargo[g];
      for (const g in seized) delete sh.cargo[g];
      const fine = Math.min(PA().cash, val * 0.3);
      PA().cash -= fine;
      st.suspicion = clamp(st.suspicion + 22, 0, 100);
      pl.probite = clamp(pl.probite - 10, 0, 100);
      log('loi', `Fouille à ${I[to].name} ! La douane saisit ${Object.keys(seized).map(g => seized[g] + ' ' + G[g].name).join(', ')} et vous inflige ${fmt(fine)} § d'amende.`, { alert: 'Saisie en douane' });
    } else if (illicit || hidden) {
      st.suspicion = clamp(st.suspicion + 4, 0, 100);
      log('loi', `Votre cargaison passe la douane de ${I[to].name} sans encombre.`);
    }
  }
  for (const g in sh.cargo) {
    let q = sh.cargo[g];
    if (q <= 0) continue;
    if (!hidden && !st.banned[g]) {
      const tariff = (st.tariffs[g] || 0) * S.books[to][g].ema * q;
      if (tariff > 0) {
        const pay = Math.min(PA().cash, tariff);
        PA().cash -= pay; st.treasury += pay;
        if (pay < tariff) { const lost = Math.ceil(q * (1 - pay / tariff)); q -= lost; parts.push(`${lost} ${G[g].name} saisis faute de droits payés`); }
        else parts.push(`${fmt(tariff)} § de droits sur ${G[g].name}`);
      }
    }
    if (q > 0) addStock(PA(), to, g, q);
  }
  const what = Object.keys(sh.cargo).filter(g => sh.cargo[g] > 0).map(g => sh.cargo[g] + ' ' + G[g].name).join(', ');
  log('mer', `Arrivée à ${I[to].name}${what ? ' : ' + what : ' (à vide)'}.${parts.length ? ' ' + parts.join(', ') + '.' : ''}`, { alert: 'Navire arrivé', pause: false });
}
// le Comptoir de guilde rachète tout, à vil prix
function dumpToComptoir(a, isl) {
  const c = S.accounts['cpt:' + isl];
  for (const g in a.stock[isl]) {
    if (S.isl[isl].banned[g]) continue;
    const q = a.stock[isl][g];
    a.cash += q * S.books[isl][g].ema * 0.5;
    addStock(a, isl, g, -q); addStock(c, isl, g, q);
  }
}
function capitaineSellNow(n) {
  const sh = n.ship, a = S.accounts['npc:' + n.id];
  for (const g in a.stock[sh.at]) {
    const cost = (sh.costs && sh.costs[g]) || S.books[sh.at][g].ema * 0.8;
    place(a.id, sh.at, g, 'sell', Math.max(S.books[sh.at][g].ema * 1.05, cost * 1.02), a.stock[sh.at][g], { ttl: 10 });
  }
}
function seaRisks() {
  const si = seasonIdx();
  S.shipments.forEach(sh => {
    const p = PATH[sh.from][sh.to];
    const loaded = Object.values(sh.cargo).some(q => q > 0);
    if (!loaded) return;
    if (rnd() < 0.01 * STORM_SEASON[si] * (0.5 + p.fog)) {
      const frac = 0.15 + rnd() * 0.3;
      for (const g in sh.cargo) sh.cargo[g] = Math.floor(sh.cargo[g] * (1 - frac));
      sh.arr += rint(12, 36);
      if (sh.owner === 'player') log('mer', `Tempête ! Votre convoi vers ${I[sh.to].name} perd ${Math.round(frac * 100)} % de sa cargaison et prend du retard.`, { alert: 'Tempête' });
    }
    if (rnd() < 0.006 * p.danger * (sh.escort ? 0.2 : 1) * (sh.smuggle ? 0.7 : 1)) {
      for (const g in sh.cargo) sh.cargo[g] = 0;
      if (sh.owner === 'player') log('mer', `Pirates ! Votre convoi vers ${I[sh.to].name} est pillé. La cargaison est perdue.`, { alert: 'Pillage' });
    }
  });
}

// ---------------------------------------------------------------- spéculateurs
const SPEC_GOODS = ['cereales', 'sel', 'bois', 'minerai', 'houille', 'cristal', 'farine', 'planches', 'fonte', 'eclat', 'outils', 'accu', 'lanterne', 'rations'];
function speculatorsAct() {
  Object.values(S.npcs).forEach(n => {
    if (!n.spec) return;
    const isl = 'port', a = S.accounts['npc:' + n.id];
    if (n.style === 'tendance') {
      SPEC_GOODS.forEach(g => {
        const b = S.books[isl][g], h = b.hist, k = h.length;
        if (k < 6) return;
        const mom = h[k - 1] / h[k - 6] - 1;
        const sig = mom * 100 + b.sent * 0.05 * n.traits.credulite;
        const hold = stockOf(a, isl, g);
        if (sig > 9 && hold * b.ema < a.cash * 0.3) {
          const ask = bestAsk(isl, g); if (ask == null) return;
          const q = Math.floor(a.cash * 0.04 * n.traits.audace / ask);
          if (q > 0) place(a.id, isl, g, 'buy', ask * 1.03, q, { ioc: true });
        } else if (sig < -2 && hold > 0) {
          const bid = bestBid(isl, g);
          if (bid != null && bid > b.ema * 0.8) place(a.id, isl, g, 'sell', bid * 0.99, hold, { ioc: true });
          else { cancelOrders(a.id, isl, g); place(a.id, isl, g, 'sell', b.ema * 0.97, stockOf(a, isl, g), { ttl: 12 }); }
        }
      });
    } else if (n.style === 'valeur') {
      SPEC_GOODS.forEach(g => {
        const b = S.books[isl][g], base = G[g].base, hold = stockOf(a, isl, g);
        if (b.ema < base * 0.78 && b.sent > -40 && hold * b.ema < a.cash * 0.25) {
          const ask = bestAsk(isl, g); if (ask == null || ask > base * 0.85) return;
          place(a.id, isl, g, 'buy', ask * 1.02, Math.floor(a.cash * 0.05 / ask), { ioc: true });
        } else if (b.ema > base * 1.2 && hold > 0) {
          cancelOrders(a.id, isl, g);
          place(a.id, isl, g, 'sell', b.ema * 1.01, hold, { ttl: 12 });
        }
      });
    } else if (n.style === 'accapareur') {
      const sp = n.spec;
      if (!sp.target) {
        if (rnd() < 0.01 * n.traits.audace / 5 && !S.warm) {
          sp.target = pick(['sel', 'houille', 'planches', 'farine', 'outils', 'fonte', 'eclat']);
          sp.since = gday(); sp.entry = S.books[isl][sp.target].ema; sp.phase = 'achat';
          if (rnd() < 0.5) createRumor({ origin: isl, island: isl, g: sp.target, dir: 1, truth: false, cred: rint(30, 60), src: 'npc', npc: n.id,
            text: `On murmure qu'un gros acheteur rafle tout le ${G[sp.target].name.toLowerCase()} de Port-Sablier.` });
        }
        return;
      }
      const g = sp.target, b = S.books[isl][g], hold = stockOf(a, isl, g);
      if (sp.phase === 'achat') {
        if (gday() - sp.since > 8 || hold * b.ema > a.cash) sp.phase = 'garde';
        else { const ask = bestAsk(isl, g); if (ask != null && ask < sp.entry * 1.3) place(a.id, isl, g, 'buy', ask * 1.05, Math.floor(a.cash * 0.08 / ask), { ioc: true }); }
      } else if (sp.phase === 'garde') {
        if (b.ema > sp.entry * 1.45 || gday() - sp.since > 30) sp.phase = 'vente';
      } else {
        if (hold <= 0) { sp.target = null; return; }
        cancelOrders(a.id, isl, g);
        const bid = bestBid(isl, g);
        if (bid != null) place(a.id, isl, g, 'sell', bid, Math.ceil(hold / 4), { ioc: true });
        if (stockOf(a, isl, g) > 0) place(a.id, isl, g, 'sell', b.ema * 0.99, stockOf(a, isl, g), { ttl: 6 });
      }
    }
  });
}

// ---------------------------------------------------------------- rumeurs
const RUMOR_UP = [
  (g, i) => `On dit que le ${g} va manquer à ${i}.`,
  (g, i) => `Un capitaine jure qu'un convoi de ${g} a sombré en route pour ${i}.`,
  (g, i) => `Les entrepôts de ${g} de ${i} seraient presque vides.`,
];
const RUMOR_DOWN = [
  (g, i) => `On murmure qu'une montagne de ${g} attend dans les entrepôts de ${i}.`,
  (g, i) => `Des marchands affirment que le prix du ${g} va s'effondrer à ${i}.`,
  (g, i) => `Une flotte chargée de ${g} serait en route vers ${i}.`,
];
function createRumor(o) {
  const r = { id: S.seq++, text: o.text, g: o.g, island: o.island, origin: o.origin, dir: o.dir, mag: o.mag || 35,
    truth: o.truth, cred: o.cred, day: gday(), src: o.src, npc: o.npc || null, resolve: gday() + (o.resolveIn || rint(9, 15)),
    status: 'circule', heard: gday() + infoDelay(o.origin), event: o.event || null, reached: {} };
  if (r.src === 'player') r.heard = gday();
  S.rumors.push(r);
  if (S.rumors.length > 80) S.rumors.shift();
  return r;
}
function spreadRumors() {
  const gd = gday();
  S.rumors.forEach(r => {
    if (r.status !== 'circule') return;
    ISLANDS.forEach(i => {
      if (r.reached[i.id]) return;
      if (gd >= r.day + PATH[r.origin][i.id].days) {
        r.reached[i.id] = true;
        if (!r.g) return;
        const scale = i.id === r.island ? 1 : 0.45;
        const b = S.books[i.id][r.g];
        b.sent = clamp(b.sent + r.dir * r.mag * (r.cred / 100) * scale * 1.2, -100, 100);
      }
    });
    if (gd >= r.heard && !r.logged && r.src !== 'player') { r.logged = true; log('rumeur', 'Rumeur : ' + r.text, { alert: r.cred >= 55 ? 'Une rumeur circule' : null, pause: r.cred >= 55 }); }
    if (gd >= r.resolve) {
      if (r.truth) r.status = 'confirmée';
      else {
        r.status = 'démentie';
        if (r.g) ISLANDS.forEach(i => { const b = S.books[i.id][r.g]; b.sent = clamp(b.sent - r.dir * r.mag * (r.cred / 100) * 0.7, -100, 100); });
        news(r.origin, 'rumeur', `Démenti : « ${r.text} » était une fausse rumeur.`);
        if (r.src === 'player') {
          const st = S.isl[r.origin];
          if (rnd() < 0.2 + st.suspicion / 200) {
            P().probite = clamp(P().probite - 12, 0, 100);
            st.suspicion = clamp(st.suspicion + 18, 0, 100);
            log('loi', `On remonte jusqu'à vous la fausse rumeur sur le ${G[r.g].name.toLowerCase()} de ${I[r.origin].name}. Votre probité en souffre.`, { alert: 'Rumeur démasquée' });
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------- événements
function schedule(ev) { S.events.push(ev); }
function processEvents() {
  const gd = gday();
  const keep = [];
  S.events.forEach(ev => {
    if (ev.day > gd) { keep.push(ev); return; }
    const isl = ev.isl, nm = isl ? I[isl].name : '';
    if (ev.type === 'prod') {
      S.isl[isl].mods.push({ g: ev.g, mult: ev.mult, until: gd + ev.dur, why: ev.why });
      news(isl, 'choc', ev.text, { alert: ev.title });
    } else if (ev.type === 'fad') {
      S.isl[isl].fads.push({ g: ev.g, mult: ev.mult, until: gd + ev.dur });
      news(isl, 'mode', ev.text, { alert: 'Une mode est lancée' });
    } else if (ev.type === 'embargo') {
      S.embargos.push({ a: ev.a, b: ev.b, until: gd + ev.dur });
      S.isl[ev.a].laws.push({ text: `Embargo contre ${I[ev.b].name}`, until: gd + ev.dur });
      news(ev.a, 'politique', ev.text, { alert: 'Embargo' });
    } else if (ev.type === 'strike') {
      S.isl[isl].strikeUntil = gd + ev.dur;
      S.isl[isl].strikeCooldown = gd + ev.dur + 25;
      S.isl[isl].lowSat = 0;
      news(isl, 'choc', `Grève générale à ${nm} ! Mines et ateliers sont à l'arrêt pour environ ${ev.dur} jours.`, { alert: 'Grève' });
    }
  });
  S.events = keep;
}
function planStrike(isl) {
  const st = S.isl[isl];
  if (S.events.some(e => e.type === 'strike' && e.isl === isl)) return;
  st.strikeCooldown = gday() + 30;
  const days = rint(2, 4);
  createRumor({ origin: isl, island: isl, g: 'rations', dir: 1, truth: true, cred: 60, src: 'event', resolveIn: days,
    text: `Les manouvriers de ${I[isl].name} grondent : on parle de grève.` });
  schedule({ type: 'strike', isl, day: gday() + days, dur: rint(7, 12) });
}
function newSeason(first) {
  const gd = gday(), si = seasonIdx();
  // fin des lois saisonnières
  ISLANDS.forEach(i => {
    const st = S.isl[i.id];
    st.mods = st.mods.filter(m => m.until > gd);
    st.fads = st.fads.filter(m => m.until > gd);
    st.laws = st.laws.filter(l => !l.until || l.until > gd);
  });
  S.embargos = S.embargos.filter(e => e.until > gd);
  // récoltes
  const harvest = (isl, g, pBad, pGood) => {
    const r = rnd();
    if (r < pBad) {
      const mult = 0.4 + rnd() * 0.15;
      const lag = rint(8, 14);
      createRumor({ origin: isl, island: isl, g, dir: 1, truth: true, cred: rint(40, 65), src: 'event', resolveIn: lag,
        text: g === 'cereales' ? `Les paysans des Verdanes s'inquiètent : la ${['pluie', 'sécheresse', 'grêle'][rint(0, 2)]} menace la récolte.` : `Les pêcheurs de Corallie rentrent les filets presque vides.` });
      schedule({ type: 'prod', isl, g, mult, day: gd + lag, dur: SEASON_LEN - lag, why: 'mauvaise saison', title: 'Mauvaise récolte',
        text: g === 'cereales' ? `C'est officiel : la récolte de céréales des Verdanes est désastreuse cette saison.` : `C'est officiel : la saison de pêche à Corallie est catastrophique.` });
    } else if (r > 1 - pGood) {
      const lag = rint(8, 14);
      createRumor({ origin: isl, island: isl, g, dir: -1, truth: true, cred: rint(35, 60), src: 'event', resolveIn: lag,
        text: g === 'cereales' ? `Les champs des Verdanes ploient sous les épis : on annonce une récolte record.` : `Les bancs de poissons abondent au large de Corallie.` });
      schedule({ type: 'prod', isl, g, mult: 1.35, day: gd + lag, dur: SEASON_LEN - lag, why: 'saison abondante', title: 'Récolte abondante',
        text: g === 'cereales' ? `Récolte record de céréales aux Verdanes.` : `Pêche miraculeuse à Corallie.` });
    }
  };
  harvest('verd', 'cereales', 0.2, 0.15);
  harvest('cora', 'poisson', si === 2 ? 0.35 : 0.15, 0.12);
  // conseils
  ISLANDS.forEach(i => newProposal(i.id));
  // options
  if (first) { createSeries(seasonStart() + SEASON_LEN - 1); }
  createSeries(seasonStart() + 2 * SEASON_LEN - 1);
  S.optSeries = S.optSeries.filter(s => s.exp >= gd);
  if (!first) log('info', `Début de la saison : ${D.SEASONS[si]}, an ${year()}. Les Conseils examinent de nouvelles propositions.`);
}
function randomEvents() {
  const gd = gday();
  // accident dans les mines d'éclat
  if (rnd() < 0.003 && !S.events.some(e => e.g === 'cristal')) {
    const lag = rint(3, 5);
    createRumor({ origin: 'eclat', island: 'eclat', g: 'cristal', dir: 1, truth: true, cred: 50, src: 'event', resolveIn: lag,
      text: `Des grondements inquiétants montent des mines de cristal de Haute-Éclat.` });
    schedule({ type: 'prod', isl: 'eclat', g: 'cristal', mult: 0.3, day: gd + lag, dur: rint(15, 25), why: 'effondrement', title: "Accident dans les mines d'éclat",
      text: `Un filon instable s'est effondré à Haute-Éclat : l'extraction de cristal chute pour plusieurs semaines.` });
  }
  // épuisement forestier / minier
  if (rnd() < 0.0015) {
    const [isl, g] = pick([['bois', 'bois'], ['ferre', 'minerai'], ['ferre', 'houille']]);
    const lag = rint(4, 8);
    createRumor({ origin: isl, island: isl, g, dir: 1, truth: true, cred: 40, src: 'event', resolveIn: lag, text: `À ${I[isl].name}, on dit que les meilleurs filons de ${G[g].name.toLowerCase()} s'épuisent.` });
    schedule({ type: 'prod', isl, g, mult: 0.6, day: gd + lag, dur: rint(30, 60), why: 'épuisement', title: 'Gisement épuisé',
      text: `${I[isl].name} : la production de ${G[g].name.toLowerCase()} recule, les filons faciles sont épuisés.` });
  }
  // mode
  if (rnd() < 0.004) {
    const g = pick(['lanterne', 'essence', 'accu', 'outils']);
    const isl = pick(['port', 'port', 'verd', 'cora', 'ferre', 'eclat', 'bois', 'brum'].filter(x => !S.isl[x].banned[g]));
    const lag = rint(3, 6);
    createRumor({ origin: isl, island: isl, g, dir: 1, truth: true, cred: 45, src: 'event', resolveIn: lag,
      text: `Les salons de ${I[isl].name} ne parlent que de ${G[g].name.toLowerCase()} : une mode se prépare.` });
    schedule({ type: 'fad', isl, g, mult: 3, day: gd + lag, dur: rint(25, 40), text: `La mode est aux ${G[g].name.toLowerCase()} à ${I[isl].name} : la demande triple.` });
  }
  // tensions et embargo
  if (rnd() < 0.0018) {
    const [a, b] = pick(ROUTES);
    if (!embargoed(a, b) && a !== 'port' && b !== 'port') {
      const lag = rint(4, 7);
      createRumor({ origin: a, island: a, g: null, dir: 0, truth: true, cred: 50, src: 'event', resolveIn: lag, text: `Les tensions montent entre ${I[a].name} et ${I[b].name}.` });
      schedule({ type: 'embargo', a, b, day: gd + lag, dur: rint(30, 50), text: `${I[a].name} décrète un embargo contre ${I[b].name}. Plus aucun navire ne relie les deux îles.` });
    }
  }
  // fausses rumeurs lancées par des PNJ
  if (rnd() < 0.014) {
    const cands = Object.values(S.npcs).filter(n => n.traits.avidite >= 6 && (n.role === 'speculateur' || n.role === 'capitaine' || n.role === 'industriel'));
    if (cands.length) {
      const n = pick(cands);
      const isl = n.ship ? n.ship.at : n.home;
      const g = n.ws ? n.ws.recipe : pick(SPEC_GOODS);
      const dir = n.ws ? 1 : (rnd() < 0.7 ? 1 : -1);
      const gname = G[g].name.toLowerCase();
      createRumor({ origin: isl, island: isl, g, dir, truth: false, cred: rint(25, 60), src: 'npc', npc: n.id,
        text: (dir > 0 ? pick(RUMOR_UP) : pick(RUMOR_DOWN))(gname, I[isl].name) });
    }
  }
}

// ---------------------------------------------------------------- conseils
const FOOD = ['cereales', 'farine', 'rations', 'poisson_sale', 'poisson'];
function newProposal(isl) {
  const st = S.isl[isl], gd = gday();
  const types = ['taxe_hausse', 'taxe_baisse', 'tarif', 'subvention', 'embargo'];
  if (isl === 'eclat' || isl === 'port' || isl === 'verd') types.push('interdiction');
  let type = pick(types);
  const p = { type, isl, vote: seasonStart() + 30, resolved: false, passed: null, sway: 0, stance: {} };
  if (type === 'taxe_hausse') { p.text = `Relever la taxe de bourse de ${(st.tax * 100).toFixed(1)} % à ${((st.tax + 0.005) * 100).toFixed(1)} %`; p.stance = { guilde: -1, armateurs: -1, terriens: 1, ouvriers: 1, arcanistes: 1 }; }
  if (type === 'taxe_baisse') { p.text = `Baisser la taxe de bourse de ${(st.tax * 100).toFixed(1)} % à ${(Math.max(0.003, st.tax - 0.005) * 100).toFixed(1)} %`; p.stance = { guilde: 1, armateurs: 1, terriens: -1, ouvriers: -1, arcanistes: 0 }; }
  if (type === 'tarif') {
    p.g = pick(GOODS.filter(g => !I[isl].raw[g.id] && !st.banned[g.id])).id;
    p.text = `Taxer à 15 % les importations de ${G[p.g].name.toLowerCase()} pendant un an`;
    p.stance = FOOD.includes(p.g) ? { guilde: -1, armateurs: -1, terriens: 1, ouvriers: -1, arcanistes: 0 } : { guilde: -1, armateurs: -1, terriens: 0, ouvriers: 1, arcanistes: 0 };
  }
  if (type === 'subvention') { p.text = `Subventionner les salaires de 20 % pendant la prochaine saison`; p.stance = { guilde: 1, armateurs: 0, terriens: -1, ouvriers: 1, arcanistes: 0 }; }
  if (type === 'embargo') {
    p.target = pick(ADJ[isl].filter(x => x !== 'port'));
    if (!p.target) { p.type = type = 'subvention'; p.text = `Subventionner les salaires de 20 % pendant la prochaine saison`; p.stance = { guilde: 1, armateurs: 0, terriens: -1, ouvriers: 1, arcanistes: 0 }; }
    else { p.text = `Décréter un embargo de 60 jours contre ${I[p.target].name}`; p.stance = { guilde: -1, armateurs: -1, terriens: 1, ouvriers: 1, arcanistes: 0 }; }
  }
  if (type === 'interdiction') {
    p.g = 'essence';
    if (st.banned.essence) { p.type = 'levee'; p.text = `Lever l'interdiction de l'essence de brume`; p.stance = { guilde: 1, armateurs: 1, terriens: 0, ouvriers: -1, arcanistes: -1 }; }
    else { p.text = `Interdire l'essence de brume`; p.stance = { guilde: -1, armateurs: -1, terriens: 0, ouvriers: 1, arcanistes: 1 }; }
  }
  let sup = 0;
  const f = I[isl].factions;
  for (const k in f) sup += f[k] * (p.stance[k] > 0 ? 1 : p.stance[k] < 0 ? 0 : 0.5);
  p.base = clamp(sup + (rnd() - 0.5) * 0.24, 0.05, 0.95);
  p.noise = (rnd() - 0.5) * 0.3;
  S.council[isl] = p;
  P().insider[isl] = false;
}
function councilVote() {
  ISLANDS.forEach(i => {
    const p = S.council[i.id];
    if (!p || p.resolved) return;
    const st = S.isl[i.id], gd = gday();
    p.resolved = true;
    p.passed = p.base + p.sway > 0.5;
    if (p.passed) {
      if (p.type === 'taxe_hausse') st.tax = r2((st.tax + 0.005) * 1000) / 1000;
      if (p.type === 'taxe_baisse') st.tax = Math.max(0.003, Math.round((st.tax - 0.005) * 1000) / 1000);
      if (p.type === 'tarif') { st.tariffs[p.g] = 0.15; st.laws.push({ text: `Droits de 15 % sur ${G[p.g].name}`, until: gd + 360, tariff: p.g }); }
      if (p.type === 'subvention') { st.subsidyUntil = seasonStart() + 2 * SEASON_LEN; st.laws.push({ text: 'Salaires subventionnés', until: st.subsidyUntil }); }
      if (p.type === 'embargo') { S.embargos.push({ a: i.id, b: p.target, until: gd + 60 }); st.laws.push({ text: `Embargo contre ${I[p.target].name}`, until: gd + 60 }); }
      if (p.type === 'interdiction') { st.banned.essence = true; cancelOrders('player', i.id, 'essence'); Object.keys(S.accounts).forEach(id => cancelOrders(id, i.id, 'essence')); }
      if (p.type === 'levee') { delete st.banned.essence; }
    }
    news(i.id, 'politique', `Conseil de ${i.name} : « ${p.text} » est ${p.passed ? 'adopté' : 'rejeté'} (${Math.round((p.base + p.sway) * 100)} % des voix).`, { alert: P().sway[i.id] ? 'Vote du Conseil' : null });
    P().sway[i.id] = 0;
  });
  // expiration des droits de douane
  ISLANDS.forEach(i => { const st = S.isl[i.id]; st.laws.forEach(l => { if (l.tariff && l.until <= gday()) delete st.tariffs[l.tariff]; }); });
}

// ---------------------------------------------------------------- options
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const ncdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
function createSeries(exp) {
  if (S.optSeries.some(s => s.exp === exp)) return;
  OPTION_GOODS.forEach(g => {
    const spot = S.books.port[g].ema;
    const step = spot > 100 ? 10 : spot > 30 ? 2 : spot > 10 ? 1 : 0.5;
    const strikes = [0.8, 0.9, 1, 1.1, 1.25].map(f => Math.max(step, Math.round(spot * f / step) * step));
    S.optSeries.push({ id: S.seq++, g, exp, strikes: [...new Set(strikes)] });
  });
}
function optPrice(g, K, type, exp) {
  const Sp = S.books.port[g].ema, T = Math.max(1, exp - gday() + 1) / 360;
  const vol = OPTION_VOL[g] * (1 + Math.abs(S.books.port[g].sent) / 80);
  const d1 = (Math.log(Sp / K) + 0.5 * vol * vol * T) / (vol * Math.sqrt(T)), d2 = d1 - vol * Math.sqrt(T);
  const prem = type === 'call' ? Sp * ncdf(d1) - K * ncdf(d2) : K * ncdf(-d2) - Sp * ncdf(-d1);
  const intr = type === 'call' ? Math.max(0, Sp - K) : Math.max(0, K - Sp);
  const fair = Math.max(prem, intr);
  return { fair, ask: r2(fair * 1.06 + 0.05), bid: r2(Math.max(0, fair * 0.94 - 0.05)), spot: Sp };
}
function optionsExpiry() {
  const gd = gday();
  P().options = P().options.filter(pos => {
    if (pos.exp > gd) return true;
    const Sp = S.books.port[pos.g].ema;
    const pay = Math.max(0, pos.type === 'call' ? Sp - pos.K : pos.K - Sp) * OPTION_SIZE * pos.n;
    PA().cash += pay;
    log('options', `Échéance : vos ${pos.n} option(s) ${pos.type === 'call' ? "d'achat" : 'de vente'} sur ${G[pos.g].name} à ${pos.K} § rapportent ${fmt(pay)} § (prime payée : ${fmt(pos.paid)} §).`, { alert: 'Échéance des options', pause: true });
    return false;
  });
}

// ---------------------------------------------------------------- contrats, faveurs, réputation
function contractsDaily() {
  const pl = P(), gd = gday();
  S.contracts = S.contracts.filter(c => !(c.status === 'offre' && c.offerUntil < gd));
  if (!pl.unlocked[2]) return;
  if (S.contracts.filter(c => c.status === 'offre').length >= 3 || rnd() > 0.3 + pl.fiabilite / 400) return;
  const cands = Object.values(S.npcs).filter(n => (n.role === 'industriel' || n.role === 'notable') && n.rel > -40);
  const n = pick(cands);
  let g;
  if (n.ws) g = pick(Object.keys(RECIPES[n.ws.recipe].in));
  else g = pick(['rations', 'outils', 'lanterne', 'planches', 'poisson_sale', 'essence', 'fonte', 'accu', 'farine'].filter(x => !S.isl[n.home].banned[x]));
  const ema = S.books[n.home][g].ema;
  const scale = 1 + Math.min(3, netWorth() / 8000);
  const qty = clamp(Math.round(rint(350, 1100) * scale / ema), 3, 250);
  const price = r2(ema * (1.2 + n.rel / 500 + (pl.fiabilite - 50) / 800 + rnd() * 0.1));
  S.contracts.push({ id: S.seq++, npc: n.id, isl: n.home, g, qty, price, deadline: gd + rint(12, 22), offerUntil: gd + 5, status: 'offre' });
}
function contractsDeadlines() {
  const gd = gday(), pl = P();
  S.contracts.forEach(c => {
    if (c.status === 'actif' && c.deadline < gd) {
      c.status = 'échoué';
      const n = S.npcs[c.npc];
      n.rel = clamp(n.rel - 15 - n.traits.rancune * 2, -100, 100);
      pl.fiabilite = clamp(pl.fiabilite - 8, 0, 100);
      pl.contractsFailed++;
      remember(n, `Le joueur n'a pas livré ${c.qty} ${G[c.g].name}.`);
      log('contrat', `Contrat manqué : ${n.name} attendait ${c.qty} ${G[c.g].name}. Votre fiabilité baisse.`, { alert: 'Contrat manqué' });
    }
  });
  S.contracts = S.contracts.filter(c => !((c.status === 'livré' || c.status === 'échoué') && c.deadline < gd - 20));
}
function remember(n, text) { n.memory.unshift({ d: gday(), text }); if (n.memory.length > 8) n.memory.pop(); }

function suspicionDaily() {
  const pl = P();
  ISLANDS.forEach(i => {
    const st = S.isl[i.id];
    st.suspicion = Math.max(0, st.suspicion - 0.7);
    if (st.suspicion > 60 && !st.investigating) {
      st.investigating = true;
      log('loi', `Un inspecteur de ${i.name} enquête sur vos affaires. Restez discret, ou faites-le taire.`, { alert: 'Enquête ouverte' });
    }
    if (st.suspicion < 45) st.investigating = false;
    if (st.suspicion > 85) {
      const fine = Math.round(PA().cash * 0.15);
      PA().cash -= fine;
      const a = PA();
      for (const g in a.stock[i.id]) addStock(a, i.id, g, -Math.floor(a.stock[i.id][g] * 0.3));
      pl.banUntil[i.id] = gday() + 10;
      cancelOrders('player', i.id);
      st.suspicion = 40; st.investigating = false;
      pl.probite = clamp(pl.probite - 10, 0, 100);
      log('loi', `Sanction à ${i.name} : ${fmt(fine)} § d'amende, 30 % de votre stock local confisqué et 10 jours d'exclusion de la bourse.`, { alert: 'Sanction' });
    }
  });
}

// ---------------------------------------------------------------- joueur : coûts, ateliers, progression
const COSTS = { comptoir: 500, comptoirDay: 4, ship: 2200, shipFar: 2800, shipDay: 6, escortDay: 12, informant: 300, informantDay: 3,
  colombier: 1200, seat: 2500, rumor: 150, fad: 900, corruption: 300 };
function playerUpkeep() {
  const pl = P(), a = PA();
  let cost = pl.comptoirs.length * COSTS.comptoirDay + pl.ships.length * COSTS.shipDay + pl.informants.length * COSTS.informantDay;
  S.shipments.forEach(sh => { if (sh.owner === 'player' && sh.escort) cost += COSTS.escortDay; });
  if (a.cash >= cost) { a.cash -= cost; pl.broke = 0; }
  else {
    a.cash = 0; pl.broke++;
    if (pl.broke === 1) log('info', `Vous ne pouvez plus payer vos frais (${fmt(cost)} §/jour). Vendez du stock : sans paiement d'ici 5 jours, vos comptoirs fermeront.`, { alert: 'Caisses vides' });
    if (pl.broke >= 5) {
      const closed = pl.comptoirs.filter(c => c !== 'port');
      pl.comptoirs = ['port']; pl.informants = [];
      closed.forEach(c => cancelOrders('player', c));
      if (closed.length) log('info', `Faute de paiement, vos comptoirs ferment : ${closed.map(c => I[c].name).join(', ')}.`, { alert: 'Comptoirs fermés' });
      pl.broke = 0;
    }
  }
  pl.lastUpkeep = cost;
}
function playerWorkshops() {
  const pl = P();
  pl.workshops.forEach(w => {
    w.last = 0;
    if (!w.on) return;
    if (!present(w.isl)) { w.status = 'comptoir fermé'; return; }
    if (striking(w.isl)) { w.status = 'grève'; return; }
    const made = workshopRun('player', w.isl, w.recipe, w.level, true);
    w.last = made * RECIPES[w.recipe].out;
    w.status = made > 0 ? 'en marche' : 'manque d\'intrants ou de fonds';
  });
}
// valeur de revente réaliste : un gros stock ne se vend pas au cours affiché
function liqValue(isl, g, q) {
  const b = S.books[isl][g], depth = b.volEma * 8 + 10;
  return b.ema * 0.9 * Math.min(q, depth) + b.ema * 0.25 * Math.max(0, q - depth);
}
function netWorth() {
  const a = PA(), pl = P();
  let v = a.cash;
  ISLANDS.forEach(i => { for (const g in a.stock[i.id]) v += liqValue(i.id, g, a.stock[i.id][g]); });
  ISLANDS.forEach(i => GOODS.forEach(g => {
    const b = S.books[i.id][g.id];
    b.bids.forEach(o => { if (o.a === 'player') v += o.esc || 0; });
    b.asks.forEach(o => { if (o.a === 'player') v += liqValue(i.id, g.id, o.qty); });
  }));
  S.shipments.forEach(sh => { if (sh.owner === 'player') for (const g in sh.cargo) v += liqValue(sh.from, g, sh.cargo[g]); });
  pl.options.forEach(pos => { v += optPrice(pos.g, pos.K, pos.type, pos.exp).bid * OPTION_SIZE * pos.n; });
  v += pl.ships.length * 1500;
  pl.workshops.forEach(w => { v += RECIPES[w.recipe].cost * w.level * 0.5; });
  return v;
}
function prestige() {
  const nw = netWorth();
  return Math.max(0, Math.round(P().prestigeBase + 12 * Math.log2(Math.max(1, nw / 1500))));
}
function updateStage() {
  const pl = P(), nw = netWorth(), pr = prestige();
  const unlock = (k, why) => { if (!pl.unlocked[k]) { pl.unlocked[k] = true; log('stade', why, { alert: `Nouveau stade : ${D.STAGES[k - 1].name}` }); } };
  if (nw >= 5000) unlock(2, "Vous êtes désormais Négociant : comptoirs illimités, navires, informateurs, colombier, contrats des PNJ et rumeurs sont accessibles.");
  if (nw >= 12000 && pl.unlocked[2]) unlock(3, "Vous êtes désormais Manufacturier : vous pouvez construire des ateliers. Un siège à la Grande Bourse est à vendre.");
  if (pl.seat && pl.unlocked[3]) unlock(4, "Vous siégez à la Grande Bourse : les options sont ouvertes.");
  if (pr >= 50 && pl.unlocked[3]) unlock(5, "Vous êtes un Notable : vous pouvez peser sur les Conseils et lancer des modes.");
  pl.stage = Math.max(...Object.keys(pl.unlocked).map(Number));
}
function checkRuin(nw) {
  const pl = P();
  if (nw > 40 || S.shipments.some(s => s.owner === 'player')) return;
  pl.ruins++;
  PA().cash = 500;
  pl.comptoirs = ['port']; pl.informants = []; pl.ships = []; pl.workshops = []; pl.options = [];
  pl.unlocked = { 1: true }; pl.stage = 1; pl.seat = false;
  pl.prestigeBase -= 15;
  log('info', "Vous êtes ruiné. La Banque vous avance 500 § pour repartir de zéro. Vos relations, elles, se souviennent de vous.", { alert: 'Ruine' });
}

// ---------------------------------------------------------------- actions du joueur
function canTrade(isl) {
  if (!present(isl)) return 'Il faut un comptoir sur cette île.';
  if ((P().banUntil[isl] || -1) > gday()) return 'Vous êtes exclu de cette bourse pour quelques jours.';
  return null;
}
const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra || {});
const ko = msg => ({ ok: false, msg });
const A = {
  buyMarket(isl, g, qty) {
    const e = canTrade(isl); if (e) return ko(e);
    if (S.isl[isl].banned[g]) return ko('Ce bien est interdit ici.');
    const asks = S.books[isl][g].asks; let need = qty, lim = 0;
    for (const o of asks) { lim = o.price; need -= o.qty; if (need <= 0) break; }
    if (!lim) return ko('Personne ne vend ce bien en ce moment.');
    const r = place('player', isl, g, 'buy', lim, qty, { ioc: true });
    if (!r.filled) return ko(r.err === 'fonds' ? 'Fonds insuffisants.' : 'Rien acheté.');
    const msg = `Acheté ${r.filled} ${G[g].name} pour ${fmt(r.cost)} § (moyenne ${r2(r.cost / r.filled)} §).`;
    log('bourse', msg); return ok(msg);
  },
  sellMarket(isl, g, qty) {
    const e = canTrade(isl); if (e) return ko(e);
    const r = place('player', isl, g, 'sell', 0.01, qty, { ioc: true });
    if (!r.filled) return ko(r.err === 'stock' ? 'Stock insuffisant.' : 'Aucun acheteur.');
    const msg = `Vendu ${r.filled} ${G[g].name} pour ${fmt(r.cost)} § (moyenne ${r2(r.cost / r.filled)} §).`;
    log('bourse', msg); return ok(msg);
  },
  limit(isl, g, side, price, qty) {
    const e = canTrade(isl); if (e) return ko(e);
    if (!(price > 0) || !(qty > 0)) return ko('Prix et quantité requis.');
    const r = place('player', isl, g, side, price, qty, { ttl: 24 * 30 });
    if (r.err === 'fonds') return ko('Fonds insuffisants.');
    if (r.err === 'stock') return ko('Stock insuffisant.');
    if (r.err) return ko('Ordre refusé.');
    let msg = `Ordre ${side === 'buy' ? "d'achat" : 'de vente'} placé : ${qty} ${G[g].name} à ${r2(price)} §.`;
    if (r.filled) msg += ` ${r.filled} exécutés immédiatement.`;
    log('bourse', msg); return ok(msg);
  },
  cancel(isl, g, id) {
    const b = S.books[isl][g];
    for (const side of ['bids', 'asks']) {
      const k = b[side].findIndex(o => o.id === id && o.a === 'player');
      if (k >= 0) { refund(b[side][k], isl, g); b[side].splice(k, 1); return ok('Ordre annulé.'); }
    }
    return ko('Ordre introuvable.');
  },
  openComptoir(isl) {
    const pl = P();
    if (present(isl)) return ko('Vous avez déjà un comptoir ici.');
    if (!pl.unlocked[2] && pl.comptoirs.length >= 2) return ko('Un colporteur ne peut tenir que 2 comptoirs. Devenez Négociant (5 000 § de valeur nette).');
    if (PA().cash < COSTS.comptoir) return ko(`Il faut ${COSTS.comptoir} §.`);
    PA().cash -= COSTS.comptoir; pl.comptoirs.push(isl);
    log('info', `Comptoir ouvert à ${I[isl].name}. Vous y voyez désormais la bourse en direct.`);
    return ok('Comptoir ouvert.');
  },
  closeComptoir(isl) {
    const pl = P();
    if (isl === 'port') return ko('Votre comptoir de Port-Sablier est votre siège.');
    cancelOrders('player', isl);
    pl.comptoirs = pl.comptoirs.filter(c => c !== isl);
    return ok(`Comptoir de ${I[isl].name} fermé. Votre stock y reste entreposé.`);
  },
  ship(from, to, cargo, mode, shipId, escort, smuggle) {
    const pl = P(), a = PA();
    if (from === to) return ko('Choisissez une autre destination.');
    if (embargoed(from, to)) return ko('Embargo : aucune liaison directe entre ces îles.');
    const items = Object.keys(cargo).filter(g => cargo[g] > 0);
    let total = 0;
    for (const g of items) { if (stockOf(a, from, g) < cargo[g]) return ko(`Stock insuffisant de ${G[g].name}.`); total += cargo[g]; }
    const days = PATH[from][to].days;
    let ship = null, cost = 0;
    if (mode === 'fret') {
      if (!items.length) return ko('Rien à expédier.');
      cost = Math.ceil(total * freightCost(days));
      if (smuggle) return ko('La contrebande demande votre propre navire.');
    } else {
      if (!pl.unlocked[2]) return ko('Il faut être Négociant pour avoir un navire.');
      ship = pl.ships.find(s => s.id === shipId);
      if (!ship || ship.at !== from || ship.status !== 'idle') return ko('Aucun de vos navires disponible dans ce port.');
      if (total > ship.cap) return ko(`Capacité du navire : ${ship.cap}.`);
    }
    if (a.cash < cost) return ko('Fonds insuffisants pour le fret.');
    a.cash -= cost;
    items.forEach(g => addStock(a, from, g, -cargo[g]));
    const c = {}; items.forEach(g => { c[g] = cargo[g]; });
    const sh = launch('player', from, to, c, { fret: mode === 'fret', shipId: ship && ship.id, escort: !!escort && !!ship, smuggle: !!smuggle && !!ship });
    if (ship) ship.status = 'sailing';
    const eta = Math.round((sh.arr - S.hour) / 24 * 10) / 10;
    const msg = `Expédition vers ${I[to].name} : arrivée prévue dans ${eta} jours${cost ? ` (fret : ${fmt(cost)} §)` : ''}.`;
    log('mer', msg); return ok(msg);
  },
  buyShip(isl) {
    const pl = P();
    if (!pl.unlocked[2]) return ko('Il faut être Négociant.');
    if (!present(isl)) return ko('Il faut un comptoir sur cette île.');
    const price = isl === 'bois' ? COSTS.ship : COSTS.shipFar;
    if (PA().cash < price) return ko(`Il faut ${fmt(price)} §.`);
    PA().cash -= price;
    const names = ['La Mouette', "L'Audacieuse", 'Le Sceau d\'Or', 'La Brumeuse', 'Le Héron', 'La Fortune', 'Le Vif-Argent', "L'Intrépide"];
    const name = names[pl.ships.length % names.length] + (pl.ships.length >= names.length ? ' II' : '');
    pl.ships.push({ id: S.seq++, name, at: isl, status: 'idle', cap: 150 });
    log('mer', `Vous achetez le navire « ${name} » (${fmt(price)} §).`);
    return ok(`Navire « ${name} » acheté.`);
  },
  sellShip(id) {
    const pl = P(); const s = pl.ships.find(x => x.id === id);
    if (!s || s.status !== 'idle') return ko('Navire indisponible.');
    pl.ships = pl.ships.filter(x => x.id !== id); PA().cash += 1500;
    return ok(`« ${s.name} » vendu 1 500 §.`);
  },
  hireInformant(isl) {
    const pl = P();
    if (!pl.unlocked[2]) return ko('Il faut être Négociant.');
    if (pl.informants.includes(isl)) return ko('Déjà un informateur ici.');
    if (PA().cash < COSTS.informant) return ko(`Il faut ${COSTS.informant} §.`);
    PA().cash -= COSTS.informant; pl.informants.push(isl);
    return ok(`Un informateur vous renseigne désormais sur ${I[isl].name} avec un jour de retard.`);
  },
  fireInformant(isl) { P().informants = P().informants.filter(x => x !== isl); return ok('Informateur congédié.'); },
  buyColombier() {
    const pl = P();
    if (!pl.unlocked[2]) return ko('Il faut être Négociant.');
    if (pl.colombier) return ko('Vous avez déjà un colombier.');
    if (PA().cash < COSTS.colombier) return ko(`Il faut ${fmt(COSTS.colombier)} §.`);
    PA().cash -= COSTS.colombier; pl.colombier = true;
    return ok('Vos oiseaux-messagers divisent par deux le retard des nouvelles.');
  },
  buildWorkshop(isl, recipe) {
    const pl = P();
    if (!pl.unlocked[3]) return ko('Il faut être Manufacturier.');
    if (!present(isl)) return ko('Il faut un comptoir sur cette île.');
    const r = RECIPES[recipe];
    if (PA().cash < r.cost) return ko(`Il faut ${fmt(r.cost)} §.`);
    PA().cash -= r.cost;
    pl.workshops.push({ id: S.seq++, isl, recipe, level: 1, on: true, status: 'en attente', last: 0 });
    log('atelier', `${r.name} construit à ${I[isl].name}.`);
    return ok(`${r.name} construit.`);
  },
  upgradeWorkshop(id) {
    const w = P().workshops.find(x => x.id === id); if (!w) return ko('Atelier introuvable.');
    if (w.level >= 3) return ko('Niveau maximal atteint.');
    const cost = Math.round(RECIPES[w.recipe].cost * (w.level === 1 ? 1.2 : 1.8));
    if (PA().cash < cost) return ko(`Il faut ${fmt(cost)} §.`);
    PA().cash -= cost; w.level++;
    return ok(`Atelier amélioré au niveau ${w.level}.`);
  },
  toggleWorkshop(id) { const w = P().workshops.find(x => x.id === id); if (!w) return ko('?'); w.on = !w.on; return ok(w.on ? 'Atelier relancé.' : 'Atelier arrêté.'); },
  buySeat() {
    const pl = P();
    if (!pl.unlocked[3]) return ko('Il faut être Manufacturier.');
    if (pl.seat) return ko('Vous avez déjà un siège.');
    if (PA().cash < COSTS.seat) return ko(`Il faut ${fmt(COSTS.seat)} §.`);
    PA().cash -= COSTS.seat; pl.seat = true; updateStage();
    return ok('Vous siégez à la Grande Bourse.');
  },
  buyOption(sid, K, type, n) {
    const pl = P();
    if (!pl.unlocked[4]) return ko('Il faut un siège à la Grande Bourse.');
    const s = S.optSeries.find(x => x.id === sid); if (!s) return ko('Série introuvable.');
    const pr = optPrice(s.g, K, type, s.exp), cost = pr.ask * OPTION_SIZE * n;
    if (!(n > 0)) return ko('Quantité invalide.');
    if (PA().cash < cost) return ko('Fonds insuffisants.');
    PA().cash -= cost;
    pl.options.push({ id: S.seq++, sid, g: s.g, K, type, n, paid: cost, exp: s.exp });
    const msg = `Acheté ${n} option(s) ${type === 'call' ? "d'achat" : 'de vente'} ${G[s.g].name} à ${K} § pour ${fmt(cost)} §.`;
    log('options', msg); return ok(msg);
  },
  sellOption(id) {
    const pl = P(); const pos = pl.options.find(x => x.id === id); if (!pos) return ko('Position introuvable.');
    const v = optPrice(pos.g, pos.K, pos.type, pos.exp).bid * OPTION_SIZE * pos.n;
    PA().cash += v; pl.options = pl.options.filter(x => x.id !== id);
    const msg = `Options revendues ${fmt(v)} § (payées ${fmt(pos.paid)} §).`;
    log('options', msg); return ok(msg);
  },
  acceptContract(id) {
    const c = S.contracts.find(x => x.id === id);
    if (!c || c.status !== 'offre') return ko('Offre indisponible.');
    if (S.contracts.filter(x => x.status === 'actif').length >= 4) return ko('Vous avez déjà 4 contrats en cours.');
    c.status = 'actif'; return ok('Contrat accepté.');
  },
  declineContract(id) { S.contracts = S.contracts.filter(x => x.id !== id); return ok('Offre déclinée.'); },
  deliverContract(id) {
    const c = S.contracts.find(x => x.id === id), pl = P();
    if (!c || c.status !== 'actif') return ko('Contrat indisponible.');
    if (stockOf(PA(), c.isl, c.g) < c.qty) return ko(`Il vous faut ${c.qty} ${G[c.g].name} dans votre entrepôt de ${I[c.isl].name}.`);
    addStock(PA(), c.isl, c.g, -c.qty);
    addStock(S.accounts['npc:' + c.npc], c.isl, c.g, c.qty);
    const pay = c.qty * c.price; PA().cash += pay;
    const n = S.npcs[c.npc];
    n.rel = clamp(n.rel + 12, -100, 100); n.favors++;
    pl.fiabilite = clamp(pl.fiabilite + 3, 0, 100); pl.prestigeBase += 1; pl.contractsDone++;
    c.status = 'livré';
    remember(n, `Le joueur a livré ${c.qty} ${G[c.g].name} comme promis.`);
    const msg = `Contrat honoré : ${fmt(pay)} § et une faveur de ${n.name}.`;
    log('contrat', msg); return ok(msg);
  },
  favor(npcId, action, arg) {
    const n = S.npcs[npcId], pl = P();
    const cost = { secret: 1, etouffer: 2, vote: 1 }[action];
    if (n.favors < cost) return ko(`${n.name} ne vous doit pas assez de faveurs.`);
    if (action === 'secret') {
      const known = S.rumors.filter(r => r.heard <= gday() && (r.origin === n.home || r.island === n.home) && !pl.revealed[r.id]);
      known.forEach(r => { pl.revealed[r.id] = true; });
      pl.insider[n.home] = true;
      const up = S.events.filter(e => e.isl === n.home || e.a === n.home);
      n.favors -= cost;
      let msg = `${n.name} vous confie ses secrets. `;
      msg += known.length ? `Rumeurs vérifiées : ${known.map(r => `« ${r.text} » est ${r.truth ? 'VRAIE' : 'FAUSSE'}`).join(' ; ')}. ` : 'Aucune rumeur à vérifier sur son île. ';
      if (up.length) msg += `Elle/il sait que quelque chose se prépare : ${up.map(e => e.type === 'prod' ? `production de ${G[e.g].name.toLowerCase()} ${e.mult < 1 ? 'en forte baisse' : 'en hausse'} d'ici ${e.day - gday()} jours` : e.type === 'fad' ? `une mode des ${G[e.g].name.toLowerCase()} dans ${e.day - gday()} jours` : e.type === 'strike' ? `une grève dans ${e.day - gday()} jours` : `un embargo dans ${e.day - gday()} jours`).join(', ')}. `;
      const p = S.council[n.home];
      if (p && !p.resolved) msg += `Au Conseil, « ${p.text} » recueille ${Math.round((p.base + p.sway) * 100)} % des voix.`;
      log('faveur', msg, { alert: "Information d'initié", pause: true });
      return ok(msg);
    }
    if (action === 'etouffer') {
      S.isl[n.home].suspicion = Math.max(0, S.isl[n.home].suspicion - 35);
      n.favors -= cost;
      const msg = `${n.name} fait taire les curieux à ${I[n.home].name}.`;
      log('faveur', msg); return ok(msg);
    }
    if (action === 'vote') {
      if (!pl.unlocked[5]) return ko('Il faut être Notable.');
      const p = S.council[n.home]; if (!p || p.resolved) return ko('Aucun vote en cours.');
      p.sway += arg > 0 ? 0.1 : -0.1; pl.sway[n.home] = (pl.sway[n.home] || 0) + 1;
      n.favors -= cost;
      return ok(`${n.name} pèsera ${arg > 0 ? 'pour' : 'contre'} la proposition.`);
    }
    return ko('?');
  },
  spreadRumor(isl, g, dir) {
    const pl = P();
    if (!pl.unlocked[2]) return ko('Il faut être Négociant.');
    if (!present(isl) && !pl.informants.includes(isl)) return ko('Il faut un comptoir ou un informateur sur cette île.');
    if (PA().cash < COSTS.rumor) return ko(`Il faut ${COSTS.rumor} §.`);
    PA().cash -= COSTS.rumor;
    const cred = clamp(30 + prestige() / 2 + (pl.probite - 50) / 4, 15, 85);
    const gname = G[g].name.toLowerCase();
    const r = createRumor({ origin: isl, island: isl, g, dir, truth: false, cred: Math.round(cred), src: 'player', text: (dir > 0 ? pick(RUMOR_UP) : pick(RUMOR_DOWN))(gname, I[isl].name) });
    pl.revealed[r.id] = true;
    S.isl[isl].suspicion = clamp(S.isl[isl].suspicion + 10, 0, 100);
    pl.probite = clamp(pl.probite - 2, 0, 100);
    const msg = `Vos hommes répandent la rumeur à ${I[isl].name} (crédibilité ${Math.round(cred)}).`;
    log('rumeur', msg); return ok(msg);
  },
  sway(isl, kind, dir, amount) {
    const pl = P();
    if (!pl.unlocked[5]) return ko('Il faut être Notable.');
    const p = S.council[isl]; if (!p || p.resolved) return ko('Aucun vote en cours.');
    const sgn = dir > 0 ? 1 : -1;
    if (kind === 'don') {
      amount = Math.floor(amount);
      if (!(amount >= 50)) return ko('Don minimum : 50 §.');
      if (PA().cash < amount) return ko('Fonds insuffisants.');
      PA().cash -= amount; p.sway += sgn * Math.min(0.15, amount / 2500); pl.prestigeBase += amount / 1000;
      pl.sway[isl] = (pl.sway[isl] || 0) + 1;
      return ok(`Don de ${fmt(amount)} § aux factions ${sgn > 0 ? 'favorables' : 'opposées'}.`);
    }
    if (kind === 'corruption') {
      if (PA().cash < COSTS.corruption) return ko(`Il faut ${COSTS.corruption} §.`);
      PA().cash -= COSTS.corruption; p.sway += sgn * 0.15;
      S.isl[isl].suspicion = clamp(S.isl[isl].suspicion + 18, 0, 100); pl.probite = clamp(pl.probite - 6, 0, 100);
      pl.sway[isl] = (pl.sway[isl] || 0) + 1;
      return ok('Quelques conseillers ont été « convaincus ».');
    }
    return ko('?');
  },
  launchFad(isl, g) {
    const pl = P();
    if (!pl.unlocked[5]) return ko('Il faut être Notable.');
    if (PA().cash < COSTS.fad) return ko(`Il faut ${fmt(COSTS.fad)} §.`);
    if (S.isl[isl].banned[g]) return ko('Ce bien est interdit sur cette île.');
    PA().cash -= COSTS.fad;
    const lag = 4;
    const r = createRumor({ origin: isl, island: isl, g, dir: 1, truth: true, cred: 55, src: 'player', resolveIn: lag, text: `Un patricien en vue ne jure plus que par les ${G[g].name.toLowerCase()} à ${I[isl].name}.` });
    pl.revealed[r.id] = true;
    schedule({ type: 'fad', isl, g, mult: 3, day: gday() + lag, dur: 30, text: `Sous votre influence, la mode est aux ${G[g].name.toLowerCase()} à ${I[isl].name}.` });
    return ok(`Vous financez un patricien de ${I[isl].name} : la mode prendra dans ${lag} jours.`);
  },
  blackSell(isl, g, qty) {
    const st = S.isl[isl];
    if (!st.banned[g]) return ko("Ce bien n'est pas interdit ici : vendez-le en bourse.");
    const have = stockOf(PA(), isl, g); qty = Math.min(qty, have);
    const sold = S.blackSold[isl] || 0;
    qty = Math.min(qty, 20 - sold);
    if (qty <= 0) return ko(sold >= 20 ? "Le marché noir est saturé aujourd'hui." : 'Rien à vendre.');
    const legal = ISLANDS.filter(i => !S.isl[i.id].banned[g]).map(i => S.books[i.id][g].ema);
    const ref = legal.reduce((x, y) => x + y, 0) / Math.max(1, legal.length);
    const price = ref * 2.2 * (1 - 0.02 * sold);
    addStock(PA(), isl, g, -qty);
    addStock(S.accounts['pop:' + isl + ':bourgeois'], isl, g, qty);
    PA().cash += price * qty; S.blackSold[isl] = sold + qty;
    st.suspicion = clamp(st.suspicion + 2 + qty * 0.5, 0, 100);
    P().probite = clamp(P().probite - 1, 0, 100);
    const msg = `Marché noir de ${I[isl].name} : ${qty} ${G[g].name} vendus ${fmt(price * qty)} §.`;
    log('loi', msg); return ok(msg);
  },
};

// ---------------------------------------------------------------- vues pour l'interface
function knownSnap(isl) {
  const d = infoDelay(isl);
  if (d === 0) return { delay: 0, live: true };
  const st = S.isl[isl], target = gday() - d;
  let snap = null;
  for (let k = st.snaps.length - 1; k >= 0; k--) { if (st.snaps[k].d <= target) { snap = st.snaps[k]; break; } }
  return { delay: d, live: false, snap, hist: st.snaps.filter(s => s.d <= target) };
}
function knownRumors() { return S.rumors.filter(r => r.heard <= gday()).slice().reverse(); }
function playerOrders() {
  const out = [];
  ISLANDS.forEach(i => GOODS.forEach(g => {
    const b = S.books[i.id][g.id];
    b.bids.forEach(o => { if (o.a === 'player') out.push({ isl: i.id, g: g.id, side: 'buy', price: o.price, qty: o.qty, id: o.id }); });
    b.asks.forEach(o => { if (o.a === 'player') out.push({ isl: i.id, g: g.id, side: 'sell', price: o.price, qty: o.qty, id: o.id }); });
  }));
  return out;
}

const API = { _bestTrade: (n, A, x, o) => bestTrade(n, A, x, o), _fill: (n,t)=>fillCargo(n,t),
  newGame, tick, A, get S() { return S; }, set S(v) { S = v; },
  load(state) { S = state; }, save() { return JSON.stringify(S); },
  day, gday, seasonIdx, year, seasonStart, PATH, ROUTE_INFO, rkey, stockOf, bestAsk, bestBid, infoDelay, present, knownSnap,
  knownRumors, playerOrders, netWorth, prestige, optPrice, striking, embargoed, fadMult, prodMult, freightCost, COSTS, D,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ARCHIPEL = API;
})(typeof window !== 'undefined' ? window : globalThis);
