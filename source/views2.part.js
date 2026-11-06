// ---------------------------------------------------------------- INFLUENCE
function pInfluence() {
  const pl = P(), gd = E.gday();
  let h = `<h2>Influence</h2><p class="sub">Réputation, contrats et faveurs : la seconde monnaie de l'archipel.</p>`;
  const susp = ISLANDS.filter(i => S().isl[i.id].suspicion > 1).sort((x, y) => S().isl[y.id].suspicion - S().isl[x.id].suspicion);
  h += `<div class="kpis"><div><span>Fiabilité ${q('fiabilite')}</span><b>${Math.round(pl.fiabilite)}</b>${bar(pl.fiabilite / 100)}</div><div><span>Probité ${q('probite')}</span><b>${Math.round(pl.probite)}</b>${bar(pl.probite / 100)}</div><div><span>Prestige ${q('prestige')}</span><b>${E.prestige()}</b>${bar(E.prestige() / 100, ' ')}</div>
    <div><span>Suspicion ${q('suspicion')}</span><b>${susp.length ? Math.round(S().isl[susp[0].id].suspicion) : 0}</b><span class="note">${susp.length ? esc(susp[0].name) : 'personne'}</span></div></div>`;
  // contrats
  const cs = S().contracts.filter(c => c.status !== 'expiré').sort((a, b) => ({ actif: 0, offre: 1, livré: 2, échoué: 3 })[a.status] - ({ actif: 0, offre: 1, livré: 2, échoué: 3 })[b.status] || a.deadline - b.deadline);
  h += `<h4>Contrats ${q('contrats')}</h4>`;
  if (!pl.unlocked[2]) h += `<p class="note">Les marchands vous proposeront des contrats quand vous serez Négociant.</p>`;
  else if (!cs.length) h += `<p class="note">Aucune offre pour l'instant. Elles arrivent plus souvent quand votre fiabilité est bonne.</p>`;
  cs.forEach(c => {
    const n = S().npcs[c.npc], have = E.stockOf(PA(), c.isl, c.g);
    const label = { offre: 'Offre', actif: 'En cours', livré: 'Livré', échoué: 'Manqué' }[c.status];
    const left = c.deadline - gd;
    h += `<div class="card ${c.status === 'actif' ? 'hl' : ''} ${c.status === 'livré' || c.status === 'échoué' ? 'done' : ''}"><div class="row-flex" style="justify-content:space-between"><b>${fmt(c.qty)} ${esc(G[c.g].name)} → ${esc(I[c.isl].name)}</b><span class="chip ${c.status === 'livré' ? 'green' : c.status === 'échoué' ? 'red' : 'gold'}">${label}</span></div>
      <div class="kv"><span>Pour</span><b>${esc(n.name)}</b><span>Payé</span><b>${fp(c.price)} § l'unité, ${fmt(c.qty * c.price)} § au total <span class="muted">(cours ${fp(S().books[c.isl][c.g].ema)} §)</span></b><span>Échéance</span><b class="${left <= 5 && c.status === 'actif' ? 'down' : ''}">jour ${c.deadline}, dans ${left} j</b>${c.status === 'actif' ? `<span>Votre stock là-bas</span><b class="${have >= c.qty ? 'up' : ''}">${fmt(have)} / ${fmt(c.qty)}</b>` : ''}</div>
      <div class="row-flex" style="margin-top:6px">${c.status === 'offre' ? `<button class="btn primary small" data-act="c-accept" data-id="${c.id}">Accepter</button><button class="btn small" data-act="c-decline" data-id="${c.id}">Décliner</button><span class="note">offre valable ${c.offerUntil - gd} j</span>` : ''}
      ${c.status === 'actif' ? `<button class="btn primary small" data-act="c-deliver" data-id="${c.id}" ${have >= c.qty ? '' : 'disabled'}>Livrer</button><button class="btn small" data-act="goto-good" data-isl="${c.isl}" data-g="${c.g}">Voir le bien</button>` : ''}</div></div>`;
  });
  // personnages
  const busy = new Set(S().contracts.filter(c => c.status === 'actif' || c.status === 'offre').map(c => c.npc));
  const npcs = Object.values(S().npcs).sort((a, b) => (b.favors - a.favors) || ((busy.has(b.id) ? 1 : 0) - (busy.has(a.id) ? 1 : 0)) || (Math.abs(b.rel) - Math.abs(a.rel)) || a.name.localeCompare(b.name, 'fr'));
  h += `<h4>Personnages ${q('faveurs')} ${q('traits')}</h4><p class="note">Ceux qui vous doivent des faveurs et ceux avec qui vous êtes en affaires apparaissent en premier. Touchez un nom pour le détail.</p><div class="npcs">`;
  npcs.forEach(n => {
    const role = n.style ? STYLE_NAMES[n.style] : ROLE_NAMES[n.role] + (n.ws ? ' · ' + RECIPES[n.ws.recipe].name.toLowerCase() : '');
    const open = ui.openNpc === n.id;
    h += `<div class="npc ${open ? 'open' : ''}"><button class="npc-row" data-act="npc" data-id="${n.id}"><span class="nm"><b>${esc(n.name)}</b><span class="note">${esc(role)} · ${esc(SHORT[n.home])}</span></span>
      <span class="rel ${n.rel > 10 ? 'up' : n.rel < -10 ? 'down' : 'muted'}">${n.rel > 0 ? '+' : ''}${Math.round(n.rel)}</span>${n.favors ? `<span class="chip gold">${n.favors} faveur${n.favors > 1 ? 's' : ''}</span>` : ''}${busy.has(n.id) ? '<span class="chip">contrat</span>' : ''}<span class="chev">${open ? '▾' : '▸'}</span></button>`;
    if (open) {
      const tr = Object.keys(TRAITS).map(k => `<span>${TRAITS[k]}</span><b>${n.traits[k]}/10</b>`).join('');
      h += `<div class="npc-body">${n.title ? `<p class="note" style="margin:0 0 4px">${esc(n.title)}</p>` : ''}<div class="kv">${tr}<span>Relation ${q('relation')}</span><b>${n.rel > 0 ? '+' : ''}${Math.round(n.rel)}</b></div>
        ${n.memory.length ? `<p class="note" style="margin:6px 0 0">Se souvient : ${n.memory.slice(0, 3).map(m => esc(m.text)).join(' · ')}</p>` : ''}
        <div class="row-flex" style="margin-top:8px">${n.favors >= 1 ? `<button class="btn small" data-act="favor" data-npc="${n.id}" data-a="secret">Demander un secret (1)</button>` : ''}${n.favors >= 2 ? `<button class="btn small" data-act="favor" data-npc="${n.id}" data-a="etouffer">Étouffer une enquête (2)</button>` : ''}
        ${n.favors >= 1 && pl.unlocked[5] && n.role === 'notable' && S().council[n.home] && !S().council[n.home].resolved ? `<button class="btn small" data-act="favor" data-npc="${n.id}" data-a="vote" data-v="1">Vote pour (1)</button><button class="btn small" data-act="favor" data-npc="${n.id}" data-a="vote" data-v="-1">Vote contre (1)</button>` : ''}
        ${!n.favors ? '<span class="note">Il ne vous doit aucune faveur. Honorez ses contrats pour en gagner.</span>' : ''}</div></div>`;
    }
    h += `</div>`;
  });
  h += `</div>`;
  if (susp.length) h += `<h4>Suspicion par île ${q('suspicion')}</h4>` + susp.map(i => `<div class="row-flex" style="justify-content:space-between;font-size:14px"><span>${esc(i.name)}</span><span>${Math.round(S().isl[i.id].suspicion)}</span></div>${bar(S().isl[i.id].suspicion / 100, S().isl[i.id].suspicion > 60 ? 'bad' : 'warn')}`).join('');
  if (pl.unlocked[2]) {
    const f = ui.form;
    h += `<h4>Lancer une rumeur ${q('lancer')}</h4><p class="note">Coût ${E.COSTS.rumor} §, suspicion +10 sur l'île. Il faut y avoir un comptoir ou un informateur.</p>
      <div class="row-flex"><select data-bind="rIsl">${islOptions(f.rIsl, x => E.present(x) || pl.informants.includes(x))}</select><select data-bind="rGood">${goodOptions(f.rGood)}</select>
      <select data-bind="rDir"><option value="1" ${+f.rDir > 0 ? 'selected' : ''}>pénurie (hausse)</option><option value="-1" ${+f.rDir < 0 ? 'selected' : ''}>abondance (baisse)</option></select>
      <button class="btn danger" data-act="rumor">Répandre</button></div>`;
  }
  if (pl.unlocked[5]) {
    const f = ui.form;
    h += `<h4>Lancer une mode ${q('mode')}</h4><p class="note">La demande d'un bien triple sur une île pendant 30 jours. Coût ${fmt(E.COSTS.fad)} §.</p>
      <div class="row-flex"><select data-bind="fadIsl">${islOptions(f.fadIsl)}</select><select data-bind="fadGood">${goodOptions(f.fadGood, ['lanterne', 'essence', 'accu', 'outils'])}</select><button class="btn primary" data-act="fad">Lancer la mode</button></div>`;
  }
  return h;
}

// ---------------------------------------------------------------- CONSEILS
function pConseils() {
  const pl = P(), gd = E.gday();
  let h = `<h2>Conseils des îles ${q('conseil')}</h2><p class="sub">Chaque saison, chaque Conseil vote une mesure le 31<sup>e</sup> jour. ${pl.unlocked[5] ? 'En tant que Notable, vous pouvez peser sur le vote.' : 'Devenez Notable (prestige 50) pour peser sur les votes.'}</p>`;
  const order = ISLANDS.slice().sort((a, b) => {
    const pa = S().council[a.id], pb = S().council[b.id];
    const ka = pa && !pa.resolved ? (pa.vote - gd) * 10 + Math.abs(pa.base + pa.sway - 0.5) * 10 : 9999;
    const kb = pb && !pb.resolved ? (pb.vote - gd) * 10 + Math.abs(pb.base + pb.sway - 0.5) * 10 : 9999;
    return ka - kb;
  });
  order.forEach(i => {
    const p = S().council[i.id], st = S().isl[i.id];
    h += `<div class="card ${p && !p.resolved ? 'hl' : 'done'}"><div class="row-flex" style="justify-content:space-between"><b>${esc(i.name)}</b>${p && !p.resolved ? `<span class="chip gold">vote dans ${p.vote - gd} j</span>` : ''}</div>`;
    if (p) {
      const kn = E.present(i.id) || pl.informants.includes(i.id);
      const sup = p.base + p.sway;
      let est;
      if (p.resolved) est = `<span class="chip ${p.passed ? 'green' : 'red'}">${p.passed ? 'Adoptée' : 'Rejetée'} (${Math.round(sup * 100)} %)</span>`;
      else if (pl.insider[i.id]) est = `<span class="chip gold">Secret d'initié : ${Math.round(sup * 100)} % pour</span>`;
      else if (kn) { const c = Math.round((sup + p.noise) * 100); est = `<span class="chip">Estimation : ${Math.max(0, c - 15)} à ${Math.min(100, c + 15)} % pour</span>`; }
      else est = `<span class="chip blue">Tendance inconnue sans comptoir ni informateur</span>`;
      h += `<p style="margin:4px 0;font-size:16px">« ${esc(p.text)} »</p><div class="row-flex">${est}${q('estimation')}</div>`;
      h += `<div class="factions">${Object.keys(i.factions).map(k => `<span class="${p.stance[k] > 0 ? 'pour' : p.stance[k] < 0 ? 'contre' : 'neutre'}" style="flex:${i.factions[k]}" title="${esc(FACTIONS[k])} : ${p.stance[k] > 0 ? 'pour' : p.stance[k] < 0 ? 'contre' : 'neutre'}">${esc(FACTIONS[k].split(' ')[0])} ${Math.round(i.factions[k] * 100)} %</span>`).join('')}</div>
        <p class="note" style="margin:2px 0 6px">${q('factions')} Vert : pour · rouge : contre · gris : neutre. Largeur = poids au Conseil.</p>`;
      if (pl.unlocked[5] && !p.resolved) {
        h += `<div class="row-flex"><input class="num" type="number" min="50" step="50" data-bind="don" value="${esc(ui.form.don)}"> §
          ${q('influencer')}<button class="btn small" data-act="sway" data-isl="${i.id}" data-k="don" data-v="1">Don pour</button><button class="btn small" data-act="sway" data-isl="${i.id}" data-k="don" data-v="-1">Don contre</button>
          <button class="btn small danger" data-act="sway" data-isl="${i.id}" data-k="corruption" data-v="1">Corrompre pour (${E.COSTS.corruption} §)</button><button class="btn small danger" data-act="sway" data-isl="${i.id}" data-k="corruption" data-v="-1">contre</button></div>`;
      }
    }
    const laws = [`taxe de bourse ${(st.tax * 100).toFixed(1).replace('.', ',')} %`, ...Object.keys(st.banned).map(g => 'interdiction de ' + G[g].name.toLowerCase()), ...st.laws.filter(l => !l.until || l.until > gd).map(l => l.text)];
    h += `<details class="fold"><summary>Lois en vigueur (${laws.length})</summary><p class="note">${laws.map(esc).join(' · ')}</p></details></div>`;
  });
  return h;
}

// ---------------------------------------------------------------- RUMEURS
function pRumeurs() {
  const rs = E.knownRumors(), gd = E.gday();
  let h = `<h2>Rumeurs ${q('rumeurs')}</h2><p class="sub">Elles voyagent avec les navires. Certaines annoncent un vrai choc avant tout le monde, d'autres sont lancées pour manipuler les prix.</p>`;
  if (!rs.length) return h + `<p class="note">Aucune rumeur ne vous est parvenue.</p>`;
  rs.forEach(r => {
    const rev = P().revealed[r.id];
    const status = r.status === 'démentie' ? '<span class="chip red">démentie</span>' : r.status === 'confirmée' ? '<span class="chip green">confirmée</span>' : '<span class="chip">circule</span>';
    const fresh = r.heard >= gd - 2 && r.status === 'circule';
    let eff = '';
    if (r.g) {
      const k = known(r.island, r.g);
      const hist = E.present(r.island) ? S().books[r.island][r.g].hist : null;
      const before = hist && hist.length > (gd - r.day) ? hist[hist.length - 1 - Math.max(0, gd - r.day)] : null;
      const chg = k && before ? k.p / before - 1 : null;
      eff = `<div class="eff"><span>${esc(G[r.g].name)} à ${esc(I[r.island].name)} : <b>${k ? fp(k.p) + ' §' : '?'}</b>${chg != null ? ` <span class="${chg > 0.01 ? 'up' : chg < -0.01 ? 'down' : 'muted'}">${pct(chg)} depuis la rumeur</span>` : k && k.delay ? ` <span class="age">info de ${k.delay} j</span>` : ''}</span>
        <span class="note">${r.dir > 0 ? 'pousse à la hausse' : 'pousse à la baisse'}</span><button class="btn small" data-act="goto-good" data-isl="${r.island}" data-g="${r.g}">Voir la bourse</button></div>`;
    }
    h += `<div class="card ${fresh ? 'hl' : ''} ${r.status !== 'circule' ? 'done' : ''}"><div class="row-flex" style="justify-content:space-between"><span class="note">${fresh ? '<b class="newtag">nouveau</b> ' : ''}jour ${r.day} · ${esc(I[r.origin].name)}${r.src === 'player' ? ' · lancée par vous' : ''}</span><span>${status}${q('statut')}</span></div>
      <p style="margin:4px 0;font-style:italic;font-size:16px">« ${esc(r.text)} »</p>${eff}
      <div class="row-flex"><span class="note" style="width:120px">crédibilité ${Math.round(r.cred)} ${q('credibilite')}</span><div style="flex:1">${bar(r.cred / 100, ' ')}</div>
      ${rev && r.status === 'circule' ? (r.truth ? '<span class="verdict-t">VRAIE</span>' : '<span class="verdict-f">FAUSSE</span>') : ''}</div></div>`;
  });
  return h;
}
