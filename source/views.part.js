// ---------------------------------------------------------------- données connues (avec le brouillard)
const SHORT = { port: 'Port-S.', ferre: 'Ferrecr.', verd: 'Verdanes', cora: 'Corallie', bois: 'Boisnoir', eclat: 'H.-Éclat', brum: 'Brumaille' };
function known(isl, g) {
  const k = E.knownSnap(isl);
  if (k.live) { const b = S().books[isl][g]; return { p: b.ema, bid: E.bestBid(isl, g), ask: E.bestAsk(isl, g), delay: 0, live: true }; }
  if (!k.snap) return null;
  const v = k.snap.p[g];
  return { p: v[0], bid: v[1], ask: v[2], delay: k.delay, live: false };
}
// meilleure île connue pour revendre un bien (hors île de départ)
function bestResale(isl, g) {
  let best = null;
  ISLANDS.forEach(i => {
    if (i.id === isl || S().isl[i.id].banned[g]) return;
    const k = known(i.id, g); if (!k) return;
    if (!best || k.p > best.p) best = { isl: i.id, p: k.p, delay: k.delay };
  });
  return best;
}
// meilleures affaires connues : acheter en A, revendre en B (en mettant en vente au cours), fret compris
function deals(n) {
  const best = {};
  GOODS.forEach(g => ISLANDS.forEach(A => {
    if (S().isl[A.id].banned[g.id]) return;
    const ka = known(A.id, g.id); if (!ka) return;
    const buy = ka.ask != null ? ka.ask : ka.p * 1.1;
    const cost = buy * (1 + S().isl[A.id].tax);
    ISLANDS.forEach(B => {
      if (B.id === A.id || S().isl[B.id].banned[g.id] || E.embargoed(A.id, B.id)) return;
      const kb = known(B.id, g.id); if (!kb) return;
      const days = E.PATH[A.id][B.id].days;
      if (G[g.id].perish > 0.02 && days > 4) return;
      const sell = kb.p * 0.97 * (1 - S().isl[B.id].tax) - (S().isl[B.id].tariffs[g.id] || 0) * kb.p;
      const gain = sell - cost - E.freightCost(days) - kb.p * G[g.id].perish * days;
      const pc = gain / cost;
      if (gain <= 0.3 || pc < 0.12) return;
      const score = pc * Math.sqrt(gain) / (1 + days / 6);
      if (!best[g.id] || score > best[g.id].score) best[g.id] = { g: g.id, A: A.id, B: B.id, buy, sell, gain, pc, days, score, delay: Math.max(ka.delay, kb.delay) };
    });
  }));
  return Object.values(best).sort((a, b) => b.score - a.score).slice(0, n);
}
function ageTag(d) { return d ? `<span class="age">il y a ${d} j</span>` : '<span class="age live">direct</span>'; }

// ---------------------------------------------------------------- À FAIRE
function todo() {
  const pl = P(), a = PA(), gd = E.gday();
  const act = [], ctr = [], opp = [], dng = [];
  const btn = (label, attrs) => `<button class="btn small" ${attrs}>${label}</button>`;
  // stock qui attend d'être vendu
  ISLANDS.forEach(i => {
    const st = a.stock[i.id];
    Object.keys(st).forEach(g => {
      const q = st[g], b = S().books[i.id][g], val = q * b.ema;
      if (val < 60) return;
      if (S().isl[i.id].banned[g]) act.push({ t: `${fmt(q)} ${gname(g)} illicites dorment à ${i.name}.`, b: btn('Marché noir', `data-act="goto-good" data-isl="${i.id}" data-g="${g}"`) });
      else if (!E.present(i.id)) act.push({ t: `${fmt(q)} ${gname(g)} sont bloqués à ${i.name}, où vous n'avez plus de comptoir.`, b: btn('Ouvrir un comptoir', `data-act="open-cpt" data-isl="${i.id}"`) });
      else act.push({ t: `${fmt(q)} ${gname(g)} attendent à ${i.name} (≈ ${fmt(val)} §).`, b: btn('Vendre', `data-act="goto-good" data-isl="${i.id}" data-g="${g}"`) });
    });
  });
  S().shipments.filter(s => s.owner === 'player' && s.arr - S().hour < 24).forEach(s => act.push({ t: `Votre convoi pour ${I[s.to].name} arrive dans ${Math.max(1, Math.round(s.arr - S().hour))} h.`, b: '' }));
  pl.workshops.filter(w => w.on && !w.last).forEach(w => act.push({ t: `${RECIPES[w.recipe].name} de ${I[w.isl].name} à l'arrêt : ${w.status || 'en attente'}.`, b: btn('Voir', `data-act="tab" data-tab="ateliers"`) }));
  S().journal.filter(j => j.cat === 'bourse' && j.d >= gd - 2 && /exécuté|expiré/.test(j.text)).slice(-3).reverse().forEach(j => act.push({ t: j.text, b: '', old: true }));
  // contrats
  S().contracts.forEach(c => {
    const n = S().npcs[c.npc], have = E.stockOf(a, c.isl, c.g);
    if (c.status === 'offre') ctr.push({ t: `${n.name} propose ${fmt(c.qty)} ${gname(c.g)} à livrer à ${I[c.isl].name}, payés ${fp(c.price)} § l'unité.`, b: btn('Voir', `data-act="tab" data-tab="influence"`) });
    if (c.status === 'actif' && have >= c.qty) ctr.push({ t: `Vous pouvez livrer ${n.name} dès maintenant (${fmt(c.qty)} ${gname(c.g)} à ${I[c.isl].name}).`, b: btn('Livrer', `data-act="c-deliver" data-id="${c.id}"`), hot: true });
    else if (c.status === 'actif' && c.deadline - gd <= 6) ctr.push({ t: `Plus que ${c.deadline - gd} j pour livrer ${fmt(c.qty)} ${gname(c.g)} à ${I[c.isl].name} (vous en avez ${fmt(have)}).`, b: btn('Voir', `data-act="tab" data-tab="influence"`), hot: true });
  });
  // dangers
  const upkeep = pl.lastUpkeep || 0;
  if (upkeep && a.cash < upkeep * 4) dng.push({ t: `Caisses presque vides : ${fmt(a.cash)} § pour ${fmt(upkeep)} § de frais par jour.`, b: btn('Mes biens', `data-act="tab" data-tab="entrepots"`) });
  ISLANDS.forEach(i => { const s = S().isl[i.id].suspicion; if (s > 45) dng.push({ t: `Les autorités de ${i.name} vous soupçonnent (${Math.round(s)}/100)${s > 60 ? ' : une enquête est ouverte' : ''}.`, b: btn('Influence', `data-act="tab" data-tab="influence"`) }); });
  S().shipments.filter(s => s.owner === 'player' && !s.escort && E.PATH[s.from][s.to].danger > 0.4).forEach(s => dng.push({ t: `Votre convoi vers ${I[s.to].name} passe par des eaux infestées de pirates, sans escorte.`, b: '' }));
  ISLANDS.forEach(i => Object.keys(a.stock[i.id]).forEach(g => { if (G[g].perish >= 0.01 && a.stock[i.id][g] >= 40) dng.push({ t: `${fmt(a.stock[i.id][g])} ${gname(g)} se gâtent à ${i.name} (−${Math.round(G[g].perish * 100)} % par jour).`, b: btn('Vendre', `data-act="goto-good" data-isl="${i.id}" data-g="${g}"`) }); }));
  if (E.seasonIdx() === 2 && S().shipments.some(s => s.owner === 'player')) dng.push({ t: `Saison des tempêtes : vos convois risquent de perdre une partie de leur cargaison.`, b: '' });
  // opportunités
  deals(3).forEach(d => opp.push({ t: `${G[d.g].name} : acheter à ${I[d.A].name} (${fp(d.buy)} §), revendre à ${I[d.B].name} (≈ ${fp(d.sell)} §) : <b>+${fp(d.gain)} § l'unité</b>, ${d.days} j de mer.`, b: btn('Voir', `data-act="goto-good" data-isl="${d.A}" data-g="${d.g}"`) }));
  E.knownRumors().filter(r => r.heard >= gd - 3 && r.status === 'circule').slice(0, 2).forEach(r => opp.push({ t: `Rumeur fraîche : « ${esc(r.text)} »`, b: btn('Rumeurs', `data-act="tab" data-tab="rumeurs"`) }));
  ISLANDS.forEach(i => { const p = S().council[i.id]; if (p && !p.resolved && p.vote - gd <= 7 && p.vote - gd >= 0) opp.push({ t: `Vote à ${i.name} dans ${p.vote - gd} j : « ${esc(p.text)} ».`, b: btn('Conseils', `data-act="tab" data-tab="conseils"`) }); });
  const nw = E.netWorth();
  const next = !pl.unlocked[2] ? [5000, 'Négociant'] : !pl.unlocked[3] ? [12000, 'Manufacturier'] : null;
  if (next && nw >= next[0] * 0.75) opp.push({ t: `Plus que ${fmt(next[0] - nw)} § de valeur nette pour devenir ${next[1]}.`, b: '' });
  return { act, ctr, opp, dng, count: act.filter(x => !x.old).length + ctr.length + dng.length };
}
function pAfaire() {
  const t = todo();
  let h = `<h2>À faire ${q('afaire')}</h2><p class="sub">Ce qui demande votre attention, et les occasions à saisir.</p>`;
  const sec = (title, cls, items, empty) => {
    let s = `<h4>${title}</h4>`;
    if (!items.length) return s + `<p class="note">${empty}</p>`;
    return s + `<ul class="todo ${cls}">` + items.map(x => `<li class="${x.hot ? 'hot' : ''} ${x.old ? 'old' : ''}"><span>${x.t}</span>${x.b || ''}</li>`).join('') + `</ul>`;
  };
  h += sec('Dangers', 'dng', t.dng, 'Rien à craindre pour l\'instant.');
  h += sec('Contrats', 'ctr', t.ctr, P().unlocked[2] ? 'Aucun contrat en attente.' : 'Les marchands vous proposeront des contrats au stade Négociant.');
  h += sec('Votre activité', 'act', t.act, 'Aucune marchandise en attente.');
  h += sec('Opportunités', 'opp', t.opp, 'Aucune affaire évidente avec vos informations actuelles. Ouvrir des comptoirs ou engager des informateurs vous en révélera.');
  h += `<div class="row-flex" style="margin-top:12px"><button class="btn" data-act="bview" data-v="tout">Comparer tous les prix</button></div>`;
  return h;
}

// ---------------------------------------------------------------- BOURSE
function pBourse() {
  const seg = `<div class="seg"><button class="${ui.bview !== 'tout' ? 'on' : ''}" data-act="bview" data-v="ile">Cette île</button><button class="${ui.bview === 'tout' ? 'on' : ''}" data-act="bview" data-v="tout">Toutes les îles</button></div>`;
  if (ui.bview === 'tout') return seg + pCompare();
  const isl = ui.sel, i = I[isl], st = S().isl[isl], pres = E.present(isl);
  const info = E.knownSnap(isl);
  let h = seg + `<h2>${esc(i.name)}</h2><p class="sub">${esc(i.desc)}</p><div class="chips">`;
  h += pres ? `<span class="chip green">Comptoir : bourse en direct ${q('comptoir')}</span>` : `<span class="chip blue">Nouvelles vieilles de ${info.delay} j ${q('nouvelles')}</span>`;
  h += `<span class="chip">Taxe ${(st.tax * 100).toFixed(1).replace('.', ',')} % ${q('taxe')}</span><span class="chip">Salaire ${fp(st.wage)} §/j ${q('salaire')}</span>`;
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
    h += `<details class="fold" data-k="pop"><summary>Habitants : satisfaction des besoins ${q('satisfaction')}</summary><div class="grid2" style="margin:6px 0">` + STRATA.map(s => `<div><div class="row-flex" style="justify-content:space-between;font-size:13px"><span>${STRATA_NAMES[s]}</span><span class="muted">${fmt(st.strata[s].pop)} · ${Math.round(st.strata[s].sat * 100)} %</span></div>${bar(st.strata[s].sat)}</div>`).join('') + `</div><p class="note">En dessous de 45 % chez les manouvriers, la grève menace.</p></details>`;
  } else {
    h += `<div class="card hl"><b>Vous n'avez pas de comptoir ici.</b> Les prix ci-dessous datent d'il y a ${info.delay} jour(s). Pour commercer et voir la bourse en direct, ouvrez un comptoir.
      <div class="row-flex" style="margin-top:8px"><button class="btn primary" data-act="open-cpt" data-isl="${isl}">Ouvrir un comptoir (${E.COSTS.comptoir} § + ${E.COSTS.comptoirDay} §/j)</button>
      ${P().unlocked[2] && !P().informants.includes(isl) ? `<button class="btn" data-act="hire-inf" data-isl="${isl}">Engager un informateur (${E.COSTS.informant} § + ${E.COSTS.informantDay} §/j)</button>` : ''}</div></div>`;
  }
  if (ui.good) h += pDetail(isl, ui.good, pres, info);
  else h += `<p class="hint">👉 Touchez un bien pour l'acheter ou le vendre.</p>`;
  h += `<table class="t market"><thead><tr><th>Bien</th><th class="n">Prix ${q('prix')}</th><th class="n hide-m">5 j ${q('cinqj')}</th>${pres ? `<th class="n">Vous achetez à ${q('achetez')}</th><th class="n hide-m">Vous vendez à ${q('vendez')}</th>` : ''}<th class="n">Votre stock ${q('stock')}</th><th>Meilleure revente ${q('revente')}</th><th class="hide-m">Humeur ${q('humeur')}</th></tr></thead><tbody>`;
  let tier = -1;
  GOODS.forEach(g => {
    if (g.tier !== tier) { tier = g.tier; h += `<tr class="tier"><td colspan="8">${['Matières brutes', 'Produits transformés', 'Composants', 'Produits finis'][tier]}</td></tr>`; }
    const b = S().books[isl][g.id];
    const mine = E.stockOf(PA(), isl, g.id);
    let price = null, ch = 0, bid, ask;
    if (pres) {
      price = b.ema; const hh = b.hist; ch = hh.length > 5 ? price / hh[hh.length - 6] - 1 : 0; bid = E.bestBid(isl, g.id); ask = E.bestAsk(isl, g.id);
    } else if (info.snap) {
      const p = info.snap.p[g.id]; price = p[0];
      const hs = info.hist; const prev = hs.length > 5 ? hs[hs.length - 6].p[g.id][0] : price; ch = price / prev - 1;
    }
    const banned = st.banned[g.id];
    const rs = bestResale(isl, g.id);
    const rcell = rs && price ? `<span class="rs">${esc(SHORT[rs.isl])} ${fp(rs.p)}</span> <span class="${rs.p > price * 1.05 ? 'up' : rs.p < price * 0.95 ? 'down' : 'muted'}">${rs.p >= price ? '+' : '−'}${Math.round(Math.abs(rs.p / price - 1) * 100)} %</span>${rs.delay ? `<span class="age">${rs.delay} j</span>` : ''}` : '<span class="muted">—</span>';
    h += `<tr class="row ${ui.good === g.id ? 'sel' : ''} ${mine ? 'own' : ''}" data-act="sel-good" data-g="${g.id}"><td>${esc(g.name)}${banned ? ' <span class="tag" style="background:#f0d2c8">interdit</span>' : ''}</td>
      <td class="n"><b>${fp(price)}</b></td><td class="n hide-m ${ch > 0.005 ? 'up' : ch < -0.005 ? 'down' : 'muted'}">${price != null ? pct(ch) : '—'}</td>
      ${pres ? `<td class="n">${fp(ask)}</td><td class="n hide-m">${fp(bid)}</td>` : ''}
      <td class="n">${mine ? '<b>' + fmt(mine) + '</b>' : '<span class="muted">·</span>'}</td><td class="rcell">${rcell}</td><td class="hide-m">${pres ? sentBar(b.sent) : ''}</td></tr>`;
  });
  h += `</tbody></table><p class="note">Vos biens sont surlignés en doré. « Meilleure revente » : l'île où ce bien vaut le plus selon vos informations (avec leur âge), et l'écart avec ici ${q('ecart')}.</p>`;
  const myo = E.playerOrders().filter(o => o.isl === isl);
  if (myo.length) {
    h += `<h4>Vos offres en attente ici</h4><table class="t"><tbody>` + myo.map(o => `<tr><td>${o.side === 'buy' ? 'Achat' : 'Vente'} ${esc(G[o.g].name)}</td><td class="n">${fmt(o.qty)} à ${fp(o.price)} §</td><td class="n"><button class="btn small" data-act="cancel" data-isl="${o.isl}" data-g="${o.g}" data-id="${o.id}">Annuler</button></td></tr>`).join('') + `</tbody></table>`;
  }
  return h;
}
function pCompare() {
  let h = `<h2>Toutes les îles ${q('comparer')}</h2><p class="sub">Où acheter, où revendre. Les prix des îles sans comptoir datent de vos dernières nouvelles.</p>`;
  const ds = deals(10);
  h += `<h4>Meilleures affaires connues</h4>`;
  if (!ds.length) h += `<p class="note">Aucun écart rentable avec vos informations actuelles.</p>`;
  else {
    h += `<table class="t deals"><thead><tr><th>Bien</th><th>Acheter à</th><th>Revendre à</th><th class="n">Gain / unité</th><th class="n hide-m">Trajet</th></tr></thead><tbody>` + ds.map(d => `<tr class="row" data-act="goto-good" data-isl="${d.A}" data-g="${d.g}">
      <td><b>${esc(G[d.g].name)}</b></td>
      <td>${esc(SHORT[d.A])} <span class="muted">${fp(d.buy)} §</span>${E.present(d.A) ? '' : ' <span class="tag">sans comptoir</span>'}</td>
      <td>${esc(SHORT[d.B])} <span class="muted">≈ ${fp(d.sell)} §</span>${E.present(d.B) ? '' : ' <span class="tag">sans comptoir</span>'}</td>
      <td class="n"><b class="up">+${fp(d.gain)} §</b> <span class="muted">(${Math.round(d.pc * 100)} %)</span>${d.delay ? `<br><span class="age">info de ${d.delay} j</span>` : ''}</td><td class="n hide-m">${d.days} j</td></tr>`).join('') + `</tbody></table>
      <p class="note">Gain estimé par unité, taxes et fret compris, si vous revendez en mettant en vente au cours de l'île d'arrivée. Touchez une ligne pour ouvrir le bien sur l'île d'achat.</p>`;
  }
  h += `<h4>Tous les prix</h4><div class="scrollx"><table class="t grid"><thead><tr><th>Bien</th>` + ISLANDS.map(i => { const d = E.infoDelay(i.id); return `<th class="n">${esc(SHORT[i.id])}<br><span class="age ${d ? '' : 'live'}">${d ? d + ' j' : 'direct'}</span></th>`; }).join('') + `</tr></thead><tbody>`;
  let tier = -1;
  GOODS.forEach(g => {
    if (g.tier !== tier) { tier = g.tier; h += `<tr class="tier"><td colspan="8">${['Matières brutes', 'Produits transformés', 'Composants', 'Produits finis'][tier]}</td></tr>`; }
    const vals = ISLANDS.map(i => { const k = known(i.id, g.id); return S().isl[i.id].banned[g.id] ? null : k ? k.p : null; });
    const ok = vals.filter(v => v != null);
    const lo = Math.min(...ok), hi = Math.max(...ok);
    h += `<tr><td>${esc(g.name)}</td>` + ISLANDS.map((i, k) => {
      const v = vals[k], mine = E.stockOf(PA(), i.id, g.id);
      if (S().isl[i.id].banned[g.id]) return `<td class="n muted">interdit</td>`;
      const cls = ok.length > 1 && v === lo ? 'lo' : ok.length > 1 && v === hi ? 'hi' : '';
      return `<td class="n cell ${cls} ${mine ? 'own' : ''}" data-act="goto-good" data-isl="${i.id}" data-g="${g.id}">${fp(v)}</td>`;
    }).join('') + `</tr>`;
  });
  h += `</tbody></table></div><p class="note"><span class="lo pill">vert</span> le moins cher · <span class="hi pill">rouge</span> le plus cher · <span class="own pill">doré</span> vous en avez sur cette île. Touchez un prix pour ouvrir la bourse de l'île.</p>`;
  return h;
}

// ---------------------------------------------------------------- COMPTOIRS : tout ce que vous possédez
function pEntrepots() {
  const pl = P(), a = PA();
  let stockVal = 0, seaVal = 0, ordVal = 0;
  ISLANDS.forEach(i => { for (const g in a.stock[i.id]) stockVal += a.stock[i.id][g] * S().books[i.id][g].ema; });
  const sea = S().shipments.filter(s => s.owner === 'player');
  sea.forEach(s => { for (const g in s.cargo) seaVal += s.cargo[g] * S().books[s.from][g].ema; });
  const orders = E.playerOrders();
  orders.forEach(o => { ordVal += o.side === 'buy' ? o.qty * o.price : o.qty * S().books[o.isl][o.g].ema; });
  const wages = pl.workshops.filter(w => w.on).reduce((t, w) => t + RECIPES[w.recipe].workers * w.level * S().isl[w.isl].wage, 0);
  const esc_ = sea.filter(s => s.escort).length;
  const fees = [
    [`${pl.comptoirs.length} comptoir(s) × ${E.COSTS.comptoirDay} §`, pl.comptoirs.length * E.COSTS.comptoirDay],
    [`${pl.ships.length} navire(s) × ${E.COSTS.shipDay} §`, pl.ships.length * E.COSTS.shipDay],
    [`${pl.informants.length} informateur(s) × ${E.COSTS.informantDay} §`, pl.informants.length * E.COSTS.informantDay],
    [`${esc_} escorte(s) en mer × ${E.COSTS.escortDay} §`, esc_ * E.COSTS.escortDay],
    [`Salaires des ateliers (à pleine production)`, wages],
  ];
  const feeTot = fees.reduce((t, f) => t + f[1], 0);
  let h = `<h2>Comptoirs et biens</h2><p class="sub">Tout ce que vous possédez, où que ce soit.</p>`;
  h += `<div class="kpis"><div><span>Sceaux ${q('sceaux')}</span><b>${fmt(a.cash)} §</b></div><div><span>En entrepôt</span><b>${fmt(stockVal)} §</b></div><div><span>En mer</span><b>${fmt(seaVal)} §</b></div><div><span>Offres en attente</span><b>${fmt(ordVal)} §</b></div><div><span>Frais / jour</span><b class="down">−${fmt(feeTot)} §</b></div></div>`;
  // stocks
  const view = ui.stockView || 'bien';
  h += `<h4>Stocks en entrepôt ${q('stock')}</h4><div class="seg small"><button class="${view === 'bien' ? 'on' : ''}" data-act="stockview" data-v="bien">Par bien</button><button class="${view === 'ile' ? 'on' : ''}" data-act="stockview" data-v="ile">Par île</button></div>`;
  const byGood = {};
  ISLANDS.forEach(i => { for (const g in a.stock[i.id]) (byGood[g] = byGood[g] || []).push([i.id, a.stock[i.id][g]]); });
  if (!Object.keys(byGood).length) h += `<p class="note">Aucun stock. Achetez en bourse pour remplir vos entrepôts.</p>`;
  else if (view === 'bien') {
    h += `<table class="t"><thead><tr><th>Bien</th><th class="n">Total</th><th>Où</th><th class="n hide-m">Valeur</th><th>Meilleure revente</th></tr></thead><tbody>`;
    GOODS.filter(g => byGood[g.id]).forEach(g => {
      const list = byGood[g.id], tot = list.reduce((t, x) => t + x[1], 0);
      const val = list.reduce((t, x) => t + x[1] * S().books[x[0]][g.id].ema, 0);
      const main = list.slice().sort((x, y) => y[1] - x[1])[0][0];
      const rs = bestResale(null, g.id);
      h += `<tr><td><b>${esc(g.name)}</b>${G[g.id].perish >= 0.01 ? ' <span class="tag">périssable</span>' : ''}</td><td class="n"><b>${fmt(tot)}</b></td>
        <td>${list.map(([i, qq]) => `<button class="chipbtn" data-act="goto-good" data-isl="${i}" data-g="${g.id}">${esc(SHORT[i])} ${fmt(qq)}</button>`).join(' ')}</td>
        <td class="n hide-m">${fmt(val)} §</td><td>${rs ? `${esc(SHORT[rs.isl])} <b>${fp(rs.p)} §</b>${rs.delay ? ` <span class="age">${rs.delay} j</span>` : ''}` : '—'} <button class="btn small" data-act="ship-from" data-isl="${main}">Expédier</button></td></tr>`;
    });
    h += `</tbody></table>`;
  } else {
    ISLANDS.forEach(i => {
      const st = a.stock[i.id], goods = Object.keys(st);
      if (!goods.length) return;
      let val = 0; goods.forEach(g => { val += st[g] * S().books[i.id][g].ema; });
      h += `<div class="card ${E.present(i.id) ? 'hl' : ''}"><div class="row-flex" style="justify-content:space-between"><b>${esc(i.name)}</b><span class="muted">≈ ${fmt(val)} §</span></div>
        <div class="chips">${goods.map(g => `<button class="chipbtn" data-act="goto-good" data-isl="${i.id}" data-g="${g}">${esc(G[g].name)} <b>${fmt(st[g])}</b></button>`).join('')}</div>
        <div class="row-flex"><button class="btn small" data-act="goto" data-isl="${i.id}">Bourse</button><button class="btn small" data-act="ship-from" data-isl="${i.id}">Expédier</button></div></div>`;
    });
  }
  // en mer
  h += `<h4>Marchandises en mer (${sea.length})</h4>`;
  if (!sea.length) h += `<p class="note">Aucun convoi en route.</p>`;
  else h += `<table class="t"><tbody>` + sea.map(s => `<tr><td><b>${esc(SHORT[s.from])} → ${esc(SHORT[s.to])}</b><br><span class="note">${Object.keys(s.cargo).map(g => fmt(s.cargo[g]) + ' ' + gname(g)).join(', ') || 'à vide'}</span></td><td class="n">arrivée dans<br><b>${Math.max(0, (s.arr - S().hour) / 24).toFixed(1).replace('.', ',')} j</b></td></tr>`).join('') + `</tbody></table>`;
  // offres
  h += `<h4>Offres en attente (${orders.length}) ${q('limite')}</h4>`;
  if (!orders.length) h += `<p class="note">Aucune offre en attente.</p>`;
  else h += `<table class="t"><tbody>` + orders.map(o => `<tr><td>${o.side === 'buy' ? 'Achat' : 'Vente'} · <b>${esc(G[o.g].name)}</b><br><span class="note">${esc(I[o.isl].name)}</span></td><td class="n">${fmt(o.qty)} à ${fp(o.price)} §</td><td class="n"><button class="btn small" data-act="cancel" data-isl="${o.isl}" data-g="${o.g}" data-id="${o.id}">Annuler</button></td></tr>`).join('') + `</tbody></table>`;
  // frais
  h += `<h4>Frais quotidiens</h4><table class="t"><tbody>` + fees.filter(f => f[1] > 0).map(f => `<tr><td>${f[0]}</td><td class="n">${fmt(f[1])} §</td></tr>`).join('') + `<tr><td><b>Total</b></td><td class="n"><b>${fmt(feeTot)} §</b></td></tr></tbody></table>`;
  // réseau
  h += `<h4>Comptoirs et réseau d'information ${q('nouvelles')}</h4>`;
  h += `<table class="t"><thead><tr><th>Île</th><th>Présence</th><th class="n">Retard</th><th></th></tr></thead><tbody>` + ISLANDS.map(i => {
    const pres = E.present(i.id), inf = pl.informants.includes(i.id);
    return `<tr><td>${esc(i.name)}</td><td>${pres ? '<b>Comptoir</b>' : inf ? 'Informateur' : '—'}</td><td class="n">${E.infoDelay(i.id)} j</td><td class="n">
      ${!pres ? `<button class="btn small" data-act="open-cpt" data-isl="${i.id}">Comptoir ${E.COSTS.comptoir} §</button>` : i.id !== 'port' ? `<button class="btn small" data-act="close-cpt" data-isl="${i.id}">Fermer</button>` : ''}
      ${!pres && !inf && pl.unlocked[2] ? `<button class="btn small" data-act="hire-inf" data-isl="${i.id}">Informateur ${E.COSTS.informant} §</button>` : ''}
      ${inf ? `<button class="btn small" data-act="fire-inf" data-isl="${i.id}">Congédier</button>` : ''}</td></tr>`;
  }).join('') + `</tbody></table>`;
  if (pl.unlocked[2] && !pl.colombier) h += `<div class="row-flex" style="margin-top:8px"><button class="btn" data-act="colombier">Bâtir un colombier (${fmt(E.COSTS.colombier)} §)</button>${q('colombier')}</div>`;
  if (pl.colombier) h += `<p class="note">Votre colombier est en service.</p>`;
  if (!pl.unlocked[2]) h += `<p class="note">Informateurs et colombier s'ouvrent au stade Négociant. Un colporteur ne peut tenir que 2 comptoirs.</p>`;
  h += `<h4>Votre fortune ${q('fortune')}</h4>` + chart(S().netHist, { color: '#4d6a37', n: 360 });
  return h;
}

// ---------------------------------------------------------------- NAVIGATION
function pNavigation() {
  const pl = P(), a = PA(), f = ui.form;
  const origins = ISLANDS.filter(i => Object.keys(a.stock[i.id]).length || pl.ships.some(s => s.at === i.id && s.status === 'idle')).map(i => i.id);
  if (!f.from || !origins.includes(f.from)) f.from = origins[0] || null;
  const dests = pl.comptoirs.filter(x => x !== f.from);
  if (!f.to || !dests.includes(f.to)) f.to = dests[0] || null;
  let h = `<h2>Navigation</h2><p class="sub">Expédiez vos marchandises vers une île où vous avez un comptoir.</p>`;
  if (!f.from) h += `<div class="card"><p class="note">Vous n'avez de stock nulle part. Achetez d'abord en bourse.</p></div>`;
  else if (!f.to) h += `<div class="card"><p class="note">Il vous faut un comptoir sur une autre île pour y recevoir des marchandises.</p><button class="btn small" data-act="tab" data-tab="entrepots">Ouvrir un comptoir</button></div>`;
  else {
    const st = a.stock[f.from];
    let total = 0; const loaded = [];
    Object.keys(st).forEach(g => { const qq = Math.min(+f.cargo[g] || 0, st[g]); if (qq > 0) { total += qq; loaded.push([g, qq]); } });
    // 1. chargement
    h += `<div class="step"><div class="sh"><span class="num">1</span><b>Départ et chargement</b></div>
      <label class="field">Port de départ<select data-bind="from">${islOptions(f.from, x => origins.includes(x))}</select></label>
      <table class="t" style="margin-top:6px"><thead><tr><th>Bien</th><th class="n">En stock</th><th class="n">À charger</th></tr></thead><tbody>`;
    Object.keys(st).forEach(g => {
      h += `<tr class="${+f.cargo[g] > 0 ? 'own' : ''}"><td>${esc(G[g].name)}${G[g].perish >= 0.01 ? ' <span class="tag">périssable</span>' : ''}</td><td class="n">${fmt(st[g])}</td>
        <td class="n"><input class="num" type="number" min="0" max="${st[g]}" data-bind="cargo.${g}" value="${f.cargo[g] || ''}"> <button class="btn small" data-act="cargo-all" data-g="${g}" data-v="${st[g]}">tout</button></td></tr>`;
    });
    h += `</tbody></table></div>`;
    // 2. destination
    h += `<div class="step"><div class="sh"><span class="num">2</span><b>Destination</b> ${q('risques')}</div><table class="t dest"><thead><tr><th></th><th>Île</th><th class="n">Trajet</th><th>Risques</th><th class="n">${loaded.length ? 'Revente estimée' : 'Prix connus'}</th></tr></thead><tbody>`;
    dests.forEach(d => {
      const pth = E.PATH[f.from][d], dst = S().isl[d];
      const emb = E.embargoed(f.from, d);
      let rev = 0, cost = 0, warn = [];
      loaded.forEach(([g, qq]) => {
        const k = known(d, g); if (dst.banned[g]) warn.push(`${gname(g)} interdit`); else if (dst.tariffs[g]) warn.push(`droits sur ${gname(g)}`);
        if (k) rev += qq * k.p * 0.97 * (1 - dst.tax); cost += qq * S().books[f.from][g].ema;
      });
      const risk = [pth.danger > 0.4 ? '<span class="down">pirates</span>' : pth.danger > 0.15 ? 'pirates modérés' : 'calme', E.seasonIdx() === 2 ? '<span class="down">tempêtes</span>' : ''].filter(Boolean).join(', ');
      h += `<tr class="row ${f.to === d ? 'sel' : ''}" data-act="set-dest" data-v="${d}"><td><input type="radio" ${f.to === d ? 'checked' : ''} ${emb ? 'disabled' : ''}></td><td><b>${esc(I[d].name)}</b>${emb ? ' <span class="tag">embargo</span>' : ''}${warn.length ? `<br><span class="note down">${esc(warn.join(', '))}</span>` : ''}</td>
        <td class="n">${pth.days} j</td><td>${risk}</td><td class="n">${loaded.length ? `<b>${fmt(rev)} §</b> <span class="${rev > cost ? 'up' : 'down'}">${cost ? (rev >= cost ? '+' : '−') + Math.round(Math.abs(rev / cost - 1) * 100) + ' %' : ''}</span>` : '<span class="muted">chargez d\'abord</span>'}${E.infoDelay(d) ? ` <span class="age">${E.infoDelay(d)} j</span>` : ''}</td></tr>`;
    });
    h += `</tbody></table><p class="note">Revente estimée : ce que rapporterait votre chargement mis en vente au cours connu de l'île, comparé à sa valeur ici.</p></div>`;
    // 3. transport
    const pth = E.PATH[f.from][f.to];
    const idle = pl.ships.filter(s => s.at === f.from && s.status === 'idle');
    if (f.mode === 'navire' && !idle.length) f.mode = 'fret';
    if (f.mode === 'navire' && !idle.some(s => s.id === +f.shipId)) f.shipId = idle[0].id;
    const cost = f.mode === 'fret' ? Math.ceil(total * E.freightCost(pth.days)) : 0;
    h += `<div class="step"><div class="sh"><span class="num">3</span><b>Transport</b></div>
      <div class="row-flex" style="margin:2px 0 6px"><label><input type="radio" name="mode" data-bind="mode" value="fret" ${f.mode === 'fret' ? 'checked' : ''}> Fret, ${fp(E.freightCost(pth.days))} § par unité</label>${q('fret')}
      <label><input type="radio" name="mode" data-bind="mode" value="navire" ${f.mode === 'navire' ? 'checked' : ''} ${idle.length ? '' : 'disabled'}> Mon navire ${idle.length ? '' : '(aucun à quai ici)'}</label>${q('navire')}</div>`;
    if (f.mode === 'navire') h += `<div class="row-flex"><select data-bind="shipId">${idle.map(s => `<option value="${s.id}" ${+f.shipId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.cap} places)</option>`).join('')}</select>
        <label><input type="checkbox" data-bind="escort" ${f.escort ? 'checked' : ''}> Escorte (${E.COSTS.escortDay} §/j)</label>${q('escorte')}
        <label><input type="checkbox" data-bind="smuggle" ${f.smuggle ? 'checked' : ''}> Contrebande</label>${q('contrebande')}</div>`;
    h += `<div class="recap"><div><span>Chargement</span><b>${fmt(total)} unités</b></div><div><span>Vers</span><b>${esc(I[f.to].name)}</b></div><div><span>Durée</span><b>≈ ${pth.days} j</b></div><div><span>Coût</span><b>${f.mode === 'fret' ? fmt(cost) + ' §' : 'entretien' + (f.escort ? ' + escorte' : '')}</b></div></div>`;
    if (cost > a.cash) h += `<p class="warn-box">Il vous manque ${fmt(cost - a.cash)} § pour payer le fret. Avec vos ${fmt(a.cash)} §, vous pouvez expédier au plus ${fmt(Math.floor(a.cash / E.freightCost(pth.days)))} unités.</p>`;
    h += `<button class="btn primary wide" data-act="ship" ${(total || f.mode === 'navire') && cost <= a.cash && !E.embargoed(f.from, f.to) ? '' : 'disabled'}>Expédier ${fmt(total)} unités vers ${esc(I[f.to].name)}</button></div>`;
  }
  const mine = S().shipments.filter(s => s.owner === 'player');
  h += `<h4>En mer (${mine.length})</h4>`;
  if (!mine.length) h += `<p class="note">Aucun convoi en route.</p>`;
  mine.forEach(sh => {
    const p = Math.min(1, (S().hour - sh.dep) / (sh.arr - sh.dep));
    const ship = sh.shipId ? pl.ships.find(s => s.id === sh.shipId) : null;
    h += `<div class="card"><div class="row-flex" style="justify-content:space-between"><b>${esc(I[sh.from].name)} → ${esc(I[sh.to].name)}</b><span class="muted">arrivée dans <b>${Math.max(0, (sh.arr - S().hour) / 24).toFixed(1).replace('.', ',')} j</b></span></div>
      ${bar(p, ' ')}<div class="chips">${Object.keys(sh.cargo).map(g => `<span class="chip">${esc(G[g].name)} : ${fmt(sh.cargo[g])}</span>`).join('') || '<span class="chip">à vide</span>'}<span class="chip">${ship ? esc(ship.name) : 'fret'}${sh.escort ? ' · escorte' : ''}${sh.smuggle ? ' · contrebande' : ''}</span></div></div>`;
  });
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
