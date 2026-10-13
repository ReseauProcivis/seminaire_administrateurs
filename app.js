/* Cartographie des risques Procivis - application
   Vanilla JS, sans dépendance. Routage par ancre : #/ accueil, #/univers, #/u/CODE, #/aide, #/resultats */
(function () {
  "use strict";

  const CFG = window.CARTO_CONFIG || {};
  const PARAMS = new URLSearchParams(location.search);
  const SESSION = PARAMS.get("s") || CFG.session || "session";
  const app = document.getElementById("app");
  const bottom = document.getElementById("bottombar");
  const toastEl = document.getElementById("toast");
  const tip = document.getElementById("tooltip");

  /* ---------- Utilitaires ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fr = s => String(s ?? "").replace(/ ([:;!?»%])/g, " $1").replace(/« /g, "« ");
  const t = s => esc(fr(s));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const ecartType = a => { if (a.length < 2) return 0; const m = moy(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
  const fmt1 = n => (n === null || n === undefined || isNaN(n)) ? "-" : (Math.round(n * 10) / 10).toLocaleString("fr-FR");
  const pct = n => (n === null || n === undefined || isNaN(n)) ? "-" : Math.round(n * 100) + " %";
  const fmtDate = iso => { try { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

  function niveau(c) {
    if (!c) return { k: "none", l: "Non coté" };
    if (c <= 3) return { k: "faible", l: "Faible" };
    if (c <= 6) return { k: "modere", l: "Modéré" };
    if (c <= 9) return { k: "eleve", l: "Élevé" };
    return { k: "critique", l: "Critique" };
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2600);
  }
  function setStatut(etat, txt) {
    const el = document.getElementById("statut");
    el.className = "statut " + (etat === "ok" ? "" : etat);
    document.getElementById("statut-txt").textContent = txt;
  }

  /* ---------- État ---------- */
  const S = {
    ref: null, soc: null, store: null,
    participant: lsGet("carto.participant", null),
    mes: lsGet("carto.mesReponses", {}),
    file: lsGet("carto.fileAttente", []),
    res: { rows: [], maj: null, filtres: { societe: "", fonction: "", perimetre: "", bloc: "" }, seuil: Number(CFG.seuilDefaut) || 6, chargement: false, erreur: null, timer: null, actif: false }
  };
  const persist = () => { lsSet("carto.participant", S.participant); lsSet("carto.mesReponses", S.mes); lsSet("carto.fileAttente", S.file); };

  const universActifs = p => {
    const u = S.ref.univers;
    if (!p || p.perimetre !== "sacicap" || !p.metiers || !p.metiers.length) return u;
    return u.filter(x => !x.metiers.length || x.metiers.some(m => p.metiers.includes(m)));
  };
  const parCode = code => S.ref.univers.find(u => u.code === code);
  const MAX_AJOUTS = 5;
  const idAjout = (code, list) => { let n = 1; while (list.some(a => a.id === code + "-X" + n)) n++; return code + "-X" + n; };
  const mesU = code => {
    const m = (S.mes[code] = S.mes[code] || { maitrise: {}, cotation: {}, ajouts: [], modifie: null, envoye: null });
    if (!Array.isArray(m.ajouts)) m.ajouts = [];
    // Ancienne forme (question libre en texte seul) : reprise comme question ajoutée, à coter
    if (m.question && String(m.question).trim()) { m.ajouts.push({ id: idAjout(code, m.ajouts), texte: String(m.question).trim().slice(0, 300) }); delete m.question; }
    return m;
  };

  function progression(u) {
    const m = S.mes[u.code] || { maitrise: {}, cotation: {}, ajouts: [] };
    const aj = Array.isArray(m.ajouts) ? m.ajouts : [];
    const q = u.questions.filter(x => m.maitrise[x.id] !== undefined).length + aj.filter(a => a.v !== undefined && a.v !== null).length;
    const r = u.risques.filter(x => m.cotation[x.id] && m.cotation[x.id].p && m.cotation[x.id].i).length;
    const tot = u.questions.length + aj.length + u.risques.length, fait = q + r;
    return { fait, tot, q, r, etat: fait === 0 ? "afaire" : fait < tot ? "encours" : "termine" };
  }

  /* ---------- Liens entre mesures et risques (référentiel v5) ----------
     Chaque risque porte « mesures » (identifiants, parfois d'un autre chapitre) ; les risques couverts
     par une mesure s'en déduisent. « subi » marque un risque externe sans mesure de prévention. */
  function indexer(ref) {
    S.items = {}; S.parMesure = {};
    ref.univers.forEach(u => {
      u.questions.forEach(q => { S.items[q.id] = { u, it: q, type: "m" }; });
      u.risques.forEach(r => {
        S.items[r.id] = { u, it: r, type: "r" };
        (r.mesures || []).forEach(id => (S.parMesure[id] = S.parMesure[id] || []).push(r.id));
      });
    });
  }
  const libItem = id => { const x = S.items[id]; return x ? fr(x.it.texte || x.it.libelle) : ""; };
  const chipsLiens = (ids, code) => ids.map(id => {
    const x = S.items[id], ailleurs = x && x.u.code !== code;
    return `<span class="lien${ailleurs ? " ailleurs" : ""}" title="${esc(libItem(id))}">${esc(id)}${ailleurs ? ` <small>(${t(x.u.court)})</small>` : ""}</span>`;
  }).join(" ");
  const liensMesure = (id, code) => { const rs = S.parMesure[id] || []; return `<div class="liens">${rs.length ? "Risques couverts : " + chipsLiens(rs, code) : '<span class="orphelin">Aucun risque lié</span>'}</div>`; };
  const liensRisque = (r, code) => {
    const ms = r.mesures || [];
    const subi = r.subi ? '<span class="chip subi" title="Événement extérieur : pas de mesure de prévention, il se surveille et s\'accepte ou se réduit par un plan d\'action">Risque subi</span>' : "";
    return `<div class="liens">${subi}${ms.length ? "Mesures : " + chipsLiens(ms, code) : (r.subi ? "" : '<span class="orphelin">Aucune mesure de maîtrise liée</span>')}</div>`;
  };

  /* ---------- Routage ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("u/")) return { name: "saisie", code: h.slice(2) };
    if (h === "univers") return { name: "univers" };
    if (h === "aide") return { name: "aide" };
    if (h === "resultats") return { name: "resultats" };
    return { name: "accueil" };
  }
  const go = h => { location.hash = h; };

  /* ---------- Rendu ---------- */
  function render() {
    const r = route();
    app.className = "page" + (r.name === "resultats" || r.name === "accueil" ? " large" : "");
    bottom.innerHTML = "";
    if (r.name !== "resultats" && S.res.timer) { clearInterval(S.res.timer); S.res.timer = null; S.res.actif = false; }
    if (r.name === "accueil") app.innerHTML = vueAccueil();
    else if (r.name === "univers") { if (!S.participant) return go("/"); app.innerHTML = vueUnivers(); }
    else if (r.name === "saisie") {
      if (!S.participant) return go("/");
      const u = parCode(r.code);
      if (!u || !universActifs(S.participant).includes(u)) return go("/univers");
      app.innerHTML = vueSaisie(u); bottom.innerHTML = barreSaisie(u);
    }
    else if (r.name === "aide") app.innerHTML = vueAide();
    else if (r.name === "resultats") vueResultats();
    window.scrollTo(0, 0);
  }

  /* ---------- Accueil (reprend la page d'accueil de l'artifact d'origine) ---------- */
  function vueAccueil() {
    const p = S.participant, cur = p || {};
    const soc = S.soc.societes, fon = S.soc.fonctions, metiers = S.ref.metiers;
    const sel = (v, c) => v === c ? " selected" : "";
    const mets = cur.metiers && cur.metiers.length ? cur.metiers : metiers.map(m => m.id);
    const intro = `
      <div class="intro-txt">
        <p class="lead">Un autodiagnostic pour le séminaire des administrateurs : il couvre tous les métiers du réseau Procivis et les règles propres au statut de SACICAP. Il mesure la maîtrise de chaque univers, cote les risques et les compare à l'appétence au risque choisie par le groupe.</p>
        <div class="etapes">
          <div class="etape"><b>1</b><p><strong>Choisir le périmètre.</strong> « Réseau » pour la vision d'ensemble du séminaire. « SACICAP » pour décliner ensuite société par société, avec les seuls métiers exercés.</p></div>
          <div class="etape"><b>2</b><p><strong>Évaluer et coter.</strong> Maîtrise de chaque univers, puis probabilité et impact de 1 à 4 pour chaque risque, en tenant compte des mesures déjà en place. Décidez pour chacun : accepter ou réduire.</p></div>
          <div class="etape"><b>3</b><p><strong>Lire la synthèse.</strong> Maîtrise et exposition par univers, matrice des risques, risques hors appétence, export CSV. L'onglet <a href="#/aide">« Cadre de référence »</a> rappelle les textes et les échelles.</p></div>
        </div>
        <div class="famlist">${metiers.map(m => `<span class="chip accent">${t(m.nom)}</span>`).join("")}</div>
      </div>`;
    const form = `
      <div class="panel">
        <h3 style="margin-bottom:12px">${p ? "Votre rapport" : "Nouveau rapport"}</h3>
        <form class="newform" id="f-profil" autocomplete="off">
          <div class="row">
            <label class="f" for="f-societe">Structure
              <select id="f-societe" required><option value="">Ex. Réseau Procivis</option>${soc.map(x => `<option value="${esc(x)}"${sel(x, cur.societe)}>${esc(x)}</option>`).join("")}</select></label>
            <label class="f" for="f-fonction">Fonction
              <select id="f-fonction" required><option value="">Choisir</option>${fon.map(x => `<option value="${esc(x)}"${sel(x, cur.fonction)}>${esc(x)}</option>`).join("")}</select></label>
          </div>
          <label class="f" for="f-prenom">Intitulé <span class="muted">(votre prénom, facultatif)</span>
            <input type="text" id="f-prenom" maxlength="60" value="${esc(cur.prenom || "")}" placeholder="Ex. Séminaire ${new Date().getFullYear()}"></label>
          <label class="f" for="f-perimetre">Périmètre
            <select id="f-perimetre" name="perim"><option value="reseau"${cur.perimetre !== "sacicap" ? " selected" : ""}>Réseau Procivis (tous les métiers)</option><option value="sacicap"${cur.perimetre === "sacicap" ? " selected" : ""}>Une SACICAP (métiers à choisir)</option></select></label>
          <fieldset class="mets${cur.perimetre === "sacicap" ? "" : " inactif"}" id="f-metiers"><legend>Métiers exercés (pour une SACICAP)</legend>
            ${metiers.map(m => `<label for="f-m-${m.id}"><input type="checkbox" name="met" id="f-m-${m.id}" value="${m.id}"${mets.includes(m.id) ? " checked" : ""}>${t(m.nom)}</label>`).join("")}
          </fieldset>
          <button class="btn primaire" type="submit">${p ? "Mettre à jour le rapport" : "Créer le rapport"}</button>
          <p class="note">${S.store.isRemote ? "Le rapport est enregistré au fil de la saisie et visible par les personnes ayant accès à cet outil." : "Aperçu local : le rapport ne sera pas conservé après fermeture."}</p>
        </form>
      </div>`;
    let rapports = `<section class="rapports"><div class="rap-head"><h2>Rapports</h2><span class="muted">${p ? "1 rapport" : "0 rapport"}</span></div>`;
    if (!p) {
      rapports += `<div class="panel"><p><strong>Aucun rapport pour l'instant.</strong></p><p class="muted">Créez le premier avec le formulaire « Nouveau rapport » : il apparaîtra ici avec sa progression et son niveau de maîtrise.</p></div>`;
    } else {
      const act = universActifs(p);
      const tot = act.reduce((x, u) => x + progression(u).tot, 0), fait = act.reduce((x, u) => x + progression(u).fait, 0);
      const vals = []; act.forEach(u => { const m = S.mes[u.code]; if (m) Object.values(m.maitrise).forEach(v => { if (typeof v === "number") vals.push(v); }); });
      const mat = vals.length ? moy(vals) / 3 : null;
      const maj = Math.max(0, ...act.map(u => (S.mes[u.code] || {}).modifie || 0));
      rapports += `<div class="panel" style="padding:0;overflow-x:auto"><table class="res rap"><thead><tr><th>Structure</th><th>Intitulé</th><th>Périmètre</th><th>Mis à jour</th><th>Progression</th><th class="num">Maîtrise</th><th></th></tr></thead><tbody>
        <tr><td><a class="btn lien" href="#/univers">${esc(p.societe)}</a></td><td>${esc(p.prenom || p.fonction)}</td><td><span class="chip">${p.perimetre === "sacicap" ? "SACICAP" : "Réseau"}</span></td><td class="muted">${maj ? fmtDate(maj) : "-"}</td>
        <td><div style="display:flex;gap:8px;align-items:center;min-width:140px"><div class="progress" style="flex:1"><span style="width:${tot ? Math.round(fait / tot * 100) : 0}%"></span></div><span class="num">${tot ? Math.round(fait / tot * 100) : 0} %</span></div></td>
        <td class="num">${pct(mat)}</td><td><a class="btn" href="#/univers">Ouvrir</a></td></tr></tbody></table></div>`;
    }
    rapports += "</section>";
    return `
      <div class="hero"><p class="eyebrow">Réseau Procivis · séminaire des administrateurs</p><h1>Cartographie des risques Procivis</h1><p class="muted">${t(CFG.sessionLabel || "")}</p></div>
      <section class="intro">${intro}${form}</section>
      ${rapports}`;
  }

  function soumettreProfil(form) {
    const societe = form.querySelector("#f-societe").value;
    const fonction = form.querySelector("#f-fonction").value;
    const prenom = form.querySelector("#f-prenom").value.trim();
    const perimetre = form.querySelector("#f-perimetre").value;
    const metiers = [...form.querySelectorAll("input[name=met]:checked")].map(x => x.value);
    if (!societe || !fonction) { toast("Indiquez votre société et votre fonction."); return; }
    if (perimetre === "sacicap" && !metiers.length) { toast("Cochez au moins un métier exercé."); return; }
    S.participant = { id: (S.participant && S.participant.id) || uid(), societe, fonction, prenom, perimetre, metiers };
    S.editionProfil = false; persist(); go("/univers");
  }

  /* ---------- Liste des univers ---------- */
  function vueUnivers() {
    const p = S.participant, act = universActifs(p);
    const fin = act.filter(u => progression(u).etat === "termine").length;
    const tot = act.reduce((s, u) => s + progression(u).tot, 0), fait = act.reduce((s, u) => s + progression(u).fait, 0);
    const enAttente = S.file.length;
    let h = `
      <div class="panel">
        <div class="resume">
          <div><strong>${esc(p.prenom || p.fonction)}</strong> · ${esc(p.societe)}<br><span class="small muted">${p.perimetre === "sacicap" ? "Périmètre : ma société (" + p.metiers.map(id => (S.ref.metiers.find(m => m.id === id) || {}).nom || id).join(", ") + ")" : "Périmètre : le réseau dans son ensemble"}</span></div>
          <a class="btn lien" href="#/" data-act="editer-profil">Modifier</a>
        </div>
        <div style="margin-top:12px" class="progress" aria-label="Progression"><span style="width:${tot ? Math.round(fait / tot * 100) : 0}%"></span></div>
        <p class="small muted" style="margin:8px 0 0">${fin} univers terminé${fin > 1 ? "s" : ""} sur ${act.length} · ${fait} réponses sur ${tot}${enAttente ? ` · <span class="chip encours">${enAttente} envoi${enAttente > 1 ? "s" : ""} en attente</span>` : ""}</p>
      </div>
      ${S.store.isRemote ? "" : '<div class="bandeau">Mode local : les réponses restent sur cet appareil tant que la base partagée n\'est pas branchée.</div>'}`;
    S.ref.blocs.forEach(b => {
      const us = act.filter(u => u.bloc === b.id); if (!us.length) return;
      h += `<div class="bloc-titre">${t(b.nom)}</div>`;
      us.forEach(u => {
        const pr = progression(u), m = S.mes[u.code];
        const chip = pr.etat === "termine" ? '<span class="chip ok">Terminé</span>' : pr.etat === "encours" ? `<span class="chip encours">${pr.fait}/${pr.tot}</span>` : '<span class="chip">À faire</span>';
        const sync = m && m.envoye ? `<span class="chip sync" title="Envoyé le ${fmtDate(m.envoye)}">Envoyé</span>` : (m && m.modifie ? '<span class="chip">Non envoyé</span>' : "");
        h += `<button class="ucard" data-act="ouvrir" data-code="${u.code}"><span class="code">${u.code}</span><span class="nom">${t(u.court || u.nom)}<span class="meta">${u.questions.length} questions · ${u.risques.length} risques</span></span>${sync}${chip}</button>`;
      });
    });
    h += `<p class="small muted" style="margin-top:18px"><a href="#/aide">Cadre de référence : textes et échelles</a></p>`;
    return h;
  }

  /* ---------- Saisie d'un univers ---------- */
  const nomProba = { 1: "Improbable", 2: "Rare", 3: "Occasionnel", 4: "Fréquent" };
  const nomImpact = { 1: "Limité", 2: "Significatif", 3: "Critique", 4: "Catastrophique" };

  function badgeCrit(c) {
    if (!c || !c.p || !c.i) return '<span class="badge">Criticité : à coter</span>';
    const v = c.p * c.i, n = niveau(v);
    return `<span class="badge ${n.k}">Criticité ${v} · ${n.l}</span>`;
  }

  function blocMaitrise(id, html, val, act, ajoutee, code) {
    const E = S.ref.echelles;
    return `
          <div class="q${ajoutee ? " ajoutee" : ""}" data-q="${esc(id)}">
            <div class="lib"><span class="code">${esc(id)}</span><p>${html}${ajoutee ? ' <span class="chip accent">Question ajoutée</span>' : ""}</p></div>
            ${ajoutee ? "" : liensMesure(id, code)}
            <div class="pills" role="group" aria-label="${esc(id)}">
              ${E.maitrise.map(a => `<button type="button" class="pill${isNaN(Number(a.v)) ? " na" : ""}${val !== undefined && val !== null && String(val) === String(a.v) ? " on" : ""}" data-act="${act}" data-q="${esc(id)}" data-v="${a.v}">${t(a.l)}</button>`).join("")}
            </div>${ajoutee ? `<div class="ajout-actions"><button type="button" class="btn lien" data-act="ajout-retirer" data-id="${esc(id)}">Retirer cette question</button></div>` : ""}
          </div>`;
  }

  function vueSaisie(u) {
    const p = S.participant, m = mesU(u.code), act = universActifs(p);
    const idx = act.indexOf(u), prec = act[idx - 1], suiv = act[idx + 1];
    const bloc = S.ref.blocs.find(b => b.id === u.bloc);
    const E = S.ref.echelles;
    const txtQ = q => (p.perimetre !== "sacicap" && q.texte_reseau) ? q.texte_reseau : q.texte;
    let h = `
      <div class="rhead">
        <div class="nav"><a class="btn lien" href="#/univers">← Tous les univers</a>${suiv ? `<a class="btn lien" href="#/u/${suiv.code}">Suivant : ${t(suiv.court)} →</a>` : ""}</div>
        <div><span class="chip">${t(bloc ? bloc.nom : "")}</span> <span class="chip">${idx + 1} / ${act.length}</span></div>
        <h1>${t(u.nom)}</h1>
        <p>${t(u.intro)}</p>
        <div class="ref">Références : ${t(u.reference)}</div>
        <details class="cadre"><summary>Comment coter ?</summary>
          <p class="small" style="margin-top:8px"><strong>Maîtrise</strong> : répondez pour chaque mesure selon ce qui existe réellement aujourd'hui. <strong>Probabilité</strong> et <strong>impact</strong> se cotent de 1 à 4 en tenant compte des mesures déjà en place. La criticité est le produit des deux. Pour chaque risque, indiquez votre décision : l'<strong>accepter</strong> à son niveau actuel, ou le <strong>réduire</strong> par un plan d'action. Cette décision ne change pas la note. Sous chaque mesure figurent les risques qu'elle couvre, sous chaque risque les mesures liées ; un <strong>risque subi</strong> est un événement extérieur sans mesure de prévention. ${E.impact_note ? t(E.impact_note) + " " : ""}<a href="#/aide">Voir le cadre de référence</a>.</p>
        </details>
      </div>
      <div class="panel">
        <div class="section-titre"><span class="num">1</span><h2>Maîtrise des risques</h2></div>
        ${u.questions.map(q => blocMaitrise(q.id, t(txtQ(q)), m.maitrise[q.id], "maitrise", false, u.code)).join("")}
      </div>
      <div class="panel">
        <div class="section-titre"><span class="num">2</span><h2>Cotation des risques</h2></div>
        ${u.risques.map(r => {
          const c = m.cotation[r.id] || {};
          return `
          <div class="risque" data-r="${r.id}">
            <div class="lib"><span class="code">${r.id}</span><b>${t(r.libelle)}</b></div>
            ${liensRisque(r, u.code)}
            <div class="rate"><span class="lab">Probabilité</span><div class="scale" role="group" aria-label="Probabilité">
              ${[1, 2, 3, 4].map(n => `<button type="button" class="pill${c.p === n ? " on" : ""}" data-act="p" data-r="${r.id}" data-v="${n}" aria-label="Probabilité ${n}, ${nomProba[n]}" title="${t(E.probabilite[n].def)}">${n}<small>${nomProba[n]}</small></button>`).join("")}
            </div></div>
            <div class="rate"><span class="lab">Impact</span><div class="scale" role="group" aria-label="Impact">
              ${[1, 2, 3, 4].map(n => `<button type="button" class="pill${c.i === n ? " on" : ""}" data-act="i" data-r="${r.id}" data-v="${n}" aria-label="Impact ${n}, ${nomImpact[n]}" title="${t(E.impact[n].financier + " ; " + E.impact[n].juridique + " ; " + E.impact[n].image)}">${n}<small>${nomImpact[n]}</small></button>`).join("")}
            </div></div>
            <div class="crit"><span class="crit-badge">${badgeCrit(c)}</span>
              <span class="trait" role="group" aria-label="Traitement">
                <button type="button" class="pill${c.t === "acc" ? " on" : ""}" data-act="t" data-r="${r.id}" data-v="acc">Accepter</button>
                <button type="button" class="pill red${c.t === "red" ? " on" : ""}" data-act="t" data-r="${r.id}" data-v="red">Réduire</button>
              </span>
            </div>
          </div>`;
        }).join("")}
        <div class="ajout-zone">
          <h3>Ajouter une question</h3>
          <p class="small muted">Une mesure de maîtrise manque dans ce chapitre ? Formulez-la : elle s'ajoute à la liste et se cote comme les autres (${MAX_AJOUTS} au plus par chapitre).</p>
          ${m.ajouts.map(a => blocMaitrise(a.id, esc(a.texte), a.v, "ajout-v", true, u.code)).join("")}
          ${m.ajouts.length < MAX_AJOUTS ? `
          <form class="q libre" id="f-ajout" autocomplete="off">
            <label for="ajout-texte" class="small muted">Votre question</label>
            <div class="ajout-ligne"><input type="text" id="ajout-texte" maxlength="300" placeholder="Ex. Un comité d'audit se réunit chaque trimestre."><button class="btn" type="submit">Ajouter</button></div>
          </form>` : `<p class="small muted">Nombre maximal de questions ajoutées atteint pour ce chapitre (${MAX_AJOUTS}).</p>`}
        </div>
      </div>
      <div class="actions">
        ${prec ? `<a class="btn" href="#/u/${prec.code}">← ${t(prec.court)}</a>` : ""}
        <button class="btn primaire" data-act="enregistrer" data-code="${u.code}" data-suite="${suiv ? suiv.code : ""}">${suiv ? "Enregistrer et continuer" : "Enregistrer et terminer"}</button>
      </div>`;
    return h;
  }

  function barreSaisie(u) {
    const pr = progression(u), m = S.mes[u.code] || {};
    const etat = m.envoye && m.modifie && m.modifie > m.envoye ? "Modifié depuis le dernier envoi" : m.envoye ? "Envoyé le " + fmtDate(m.envoye) : m.modifie ? "Enregistré sur l'appareil, pas encore envoyé" : "Rien de renseigné";
    return `<div class="bottombar"><div class="bottombar-in">
      <div class="info"><strong>${pr.fait} / ${pr.tot}</strong> renseignés<br><span class="muted">${etat}</span></div>
      <button class="btn primaire" data-act="enregistrer" data-code="${u.code}" data-suite="">Enregistrer</button>
    </div></div>`;
  }
  const majBarre = u => { bottom.innerHTML = barreSaisie(u); };
  const redessinerSaisie = u => { const y = window.scrollY; app.innerHTML = vueSaisie(u); majBarre(u); window.scrollTo(0, y); };

  async function enregistrer(code, suite) {
    const u = parCode(code), m = mesU(code), p = S.participant;
    const pr = progression(u);
    const ajouts = (m.ajouts || []).map(a => ({ id: a.id, texte: String(a.texte || "").trim().slice(0, 300), ...(a.v !== undefined && a.v !== null ? { v: a.v } : {}) })).filter(a => a.texte);
    if (pr.fait === 0 && !ajouts.length) { toast("Rien à enregistrer pour cet univers."); return; }
    const row = {
      session: SESSION, participant_id: p.id, prenom: p.prenom || null, societe: p.societe, fonction: p.fonction,
      perimetre: p.perimetre, metiers: p.perimetre === "sacicap" ? p.metiers : null, univers: code,
      // Les questions ajoutées par le participant voyagent dans le jsonb « maitrise » sous la clé _ajouts (liste {id, texte, v}),
      // ignorée par l'agrégation des notes : elles sont restituées à part dans les résultats et les exports.
      maitrise: ajouts.length ? { ...m.maitrise, _ajouts: ajouts } : m.maitrise,
      cotation: m.cotation, remarques: null, version_ref: S.ref.version
    };
    setStatut("busy", "Enregistrement");
    try {
      await S.store.saveReponse(row);
      m.envoye = Date.now(); persist();
      setStatut(S.store.isRemote ? "ok" : "off", S.store.isRemote ? "Enregistré" : "Mode local");
      toast(S.store.isRemote ? "Univers enregistré, merci." : "Enregistré sur cet appareil.");
    } catch (e) {
      S.file.push(row); persist();
      setStatut("err", "Envoi en attente");
      toast("Enregistré sur l'appareil. L'envoi reprendra dès que la connexion revient.");
    }
    if (suite) go("/u/" + suite); else go("/univers");
  }

  async function viderFile() {
    if (!S.file.length || !S.store.isRemote) return;
    const reste = [];
    for (const row of S.file) { try { await S.store.saveReponse(row); if (S.mes[row.univers]) S.mes[row.univers].envoye = Date.now(); } catch (e) { reste.push(row); } }
    S.file = reste; persist();
    if (!reste.length) { setStatut("ok", "Enregistré"); if (route().name === "univers") render(); }
  }

  /* ---------- Aide ---------- */
  function vueAide() {
    const E = S.ref.echelles;
    return `
      <div class="rhead"><div class="nav"><button class="btn lien" data-act="retour">← Retour</button></div><h1>Cadre de référence</h1></div>
      <div class="panel">
        <h2>Maîtrise des risques</h2>
        <table class="echelle"><tr><th>Réponse</th><th>Sens</th></tr>
          <tr><td><strong>Non</strong></td><td>La mesure n'existe pas.</td></tr>
          <tr><td><strong>En partie</strong></td><td>Elle existe de façon informelle ou incomplète.</td></tr>
          <tr><td><strong>Oui, formalisé</strong></td><td>Elle est écrite et appliquée.</td></tr>
          <tr><td><strong>Oui, formalisé et contrôlé</strong></td><td>Elle est écrite, appliquée et son application est vérifiée.</td></tr>
          <tr><td><strong>Je ne sais pas</strong></td><td>Vous n'avez pas l'information. La réponse est enregistrée mais n'entre pas dans la moyenne.</td></tr>
          <tr><td><strong>Non concerné</strong></td><td>La mesure ne s'applique pas à la structure évaluée.</td></tr>
        </table>
      </div>
      <div class="panel">
        <h2>Probabilité</h2>
        <table class="echelle"><tr><th>Note</th><th>Niveau</th><th>Définition</th></tr>
          ${[1, 2, 3, 4].map(n => `<tr><td><strong>${n}</strong></td><td>${t(E.probabilite[n].nom)}</td><td>${t(E.probabilite[n].def)}</td></tr>`).join("")}
        </table>
      </div>
      <div class="panel">
        <h2>Impact</h2>
        <p class="small muted">Retenir la dimension la plus pénalisante.</p>
        <table class="echelle"><tr><th>Note</th><th>Niveau</th><th>Financier</th><th>Juridique</th><th>Image</th></tr>
          ${[1, 2, 3, 4].map(n => `<tr><td><strong>${n}</strong></td><td>${t(E.impact[n].nom)}</td><td>${t(E.impact[n].financier)}</td><td>${t(E.impact[n].juridique)}</td><td>${t(E.impact[n].image)}</td></tr>`).join("")}
        </table>
        ${E.impact_note ? `<p class="small muted" style="margin-top:8px">${t(E.impact_note)}</p>` : ""}
      </div>
      <div class="panel">
        <h2>Repères de lecture</h2>
        <p>Chaque mesure de maîtrise porte un identifiant <strong>CODE-M</strong> et chaque risque un identifiant <strong>CODE-R</strong>, numérotés dans l'ordre d'affichage du chapitre. Sous chaque mesure figurent les risques qu'elle couvre, sous chaque risque les mesures qui le réduisent, parfois dans un autre chapitre. Un risque marqué <span class="chip subi">Risque subi</span> est un événement extérieur sans mesure de prévention : il se surveille, et il s'accepte ou se réduit par un plan d'action.</p>
        <p>La question ajoutée au bas d'un chapitre est une mesure de maîtrise à part entière : elle se cote comme les autres et ressort dans les résultats, hors de la moyenne du chapitre.</p>
      </div>
      <div class="panel">
        <h2>Criticité et appétence</h2>
        <p>La criticité est le produit probabilité × impact, de 1 à 16 : <span class="badge faible">1 à 3 Faible</span> <span class="badge modere">4 à 6 Modéré</span> <span class="badge eleve">8 à 9 Élevé</span> <span class="badge critique">12 à 16 Critique</span></p>
        <p><strong>Accepter ou réduire.</strong> Pour chaque risque, vous indiquez si le réseau peut vivre avec le risque à son niveau actuel (accepter) ou s'il faut un plan d'action pour le faire baisser (réduire). Ce choix ne modifie pas la criticité : les résultats affichent, pour chaque risque, la part des répondants qui demandent de le réduire.</p>
        <p><strong>Seuil d'appétence.</strong> C'est la criticité maximale que le conseil accepte de porter sans plan d'action. Il n'est pas demandé aux répondants : l'animateur le choisit à la lecture des résultats, parmi ${E.seuils.map(s => "<strong>" + t(s.l) + "</strong>").join(", ")}. Les risques dont la criticité moyenne dépasse ce seuil sont mis en avant.</p>
      </div>
      <div class="panel">
        <h2>Cadre de référence du réseau</h2>
        ${S.ref.cadre_juridique.map(c => `<p><strong>${t(c.titre)}.</strong> ${t(c.texte)}</p>`).join("")}
        <p class="small muted">Sources : ${S.ref.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${t(s.titre)}</a>`).join(" · ")}</p>
      </div>`;
  }

  /* ---------- Résultats (animateur) ---------- */
  /* La clé d'accès n'est plus dans le code : elle est vérifiée côté base par la fonction lire_reponses
     (supabase/securite.sql). La page la demande une fois par session de navigation. */
  const cleStockee = () => { try { return sessionStorage.getItem("carto.cle") || ""; } catch (e) { return ""; } };
  const stockerCle = c => { try { if (c) sessionStorage.setItem("carto.cle", c); else sessionStorage.removeItem("carto.cle"); } catch (e) { /* stockage indisponible */ } };
  function accesResultats() {
    if (!S.store.isRemote) return true;
    const c = PARAMS.get("cle"); if (c) { stockerCle(c); return true; }
    return !!cleStockee();
  }

  function dedupe(rows) {
    const map = new Map();
    rows.forEach(r => { const k = r.participant_id + "|" + r.univers; const prev = map.get(k); if (!prev || (r.created_at || "") > (prev.created_at || "")) map.set(k, r); });
    return [...map.values()];
  }

  async function chargerResultats() {
    if (S.res.chargement) return;
    S.res.chargement = true; S.res.erreur = null;
    let change = true;
    try {
      const rows = dedupe(await S.store.listReponses(SESSION, cleStockee()));
      const emp = rows.length + "|" + rows.reduce((m, r) => (r.created_at || "") > m ? r.created_at : m, "");
      change = emp !== S.res.empreinte || !!S.res.erreur; S.res.empreinte = emp;
      S.res.rows = rows; S.res.maj = new Date();
    } catch (e) {
      if (e && e.code === "cle") { S.res.chargement = false; stockerCle(""); S.res.rows = []; S.res.empreinte = null; if (route().name === "resultats") { render(); toast("Clé d'accès incorrecte."); } return; }
      S.res.erreur = e.message || String(e);
    }
    S.res.chargement = false;
    if (route().name !== "resultats") return;
    if (change || !app.querySelector(".kpis, .vide")) dessinerResultats();
    else { const el = app.querySelector("#res-maj"); if (el) el.textContent = libMaj(); }
  }

  function vueResultats() {
    if (!accesResultats()) {
      app.innerHTML = `<div class="panel" style="max-width:480px;margin:30px auto"><h2>Résultats</h2><p class="small muted">Cet espace est réservé à l'animation. Saisissez la clé d'accès.</p><form id="f-cle"><input type="text" id="cle" placeholder="Clé d'accès" autocomplete="off"><div class="actions"><button class="btn primaire" type="submit">Entrer</button></div></form></div>`;
      return;
    }
    app.innerHTML = '<div class="vide">Chargement des réponses…</div>';
    S.res.actif = true;
    chargerResultats();
    if (!S.res.timer && (Number(CFG.rafraichissement) || 0) > 0) S.res.timer = setInterval(chargerResultats, Number(CFG.rafraichissement) * 1000);
  }

  function filtrer(rows) {
    const f = S.res.filtres;
    return rows.filter(r => (!f.societe || r.societe === f.societe) && (!f.fonction || r.fonction === f.fonction) && (!f.perimetre || r.perimetre === f.perimetre) && (!f.bloc || (parCode(r.univers) || {}).bloc === f.bloc));
  }

  function agreger(rows) {
    const U = {}; S.ref.univers.forEach(u => U[u.code] = { u, n: 0, mat: [], parQ: {}, remarques: [], questions: [] });
    const R = {}; S.ref.univers.forEach(u => u.risques.forEach(r => R[r.id] = { r, u, p: [], i: [], c: [], acc: 0, red: 0 }));
    const participants = new Set(), societes = new Set();
    rows.forEach(row => {
      const cu = U[row.univers]; if (!cu) return;
      participants.add(row.participant_id); if (row.societe) societes.add(row.societe);
      cu.n++;
      const vals = [];
      Object.entries(row.maitrise || {}).forEach(([q, v]) => { if (typeof v === "number") { vals.push(v); (cu.parQ[q] = cu.parQ[q] || []).push(v); } });
      if (vals.length) cu.mat.push(moy(vals) / 3);
      const qui = [row.prenom, row.societe, row.fonction].filter(Boolean).join(" · ");
      if (row.remarques && String(row.remarques).trim()) cu.remarques.push({ texte: String(row.remarques).trim(), qui, date: row.created_at });
      const aj = row.maitrise && Array.isArray(row.maitrise._ajouts) ? row.maitrise._ajouts : [];
      aj.forEach(a => { if (a && typeof a.texte === "string" && a.texte.trim()) cu.questions.push({ id: a.id || "", texte: a.texte.trim(), v: (a.v === undefined ? null : a.v), qui, date: row.created_at }); });
      const ql = row.maitrise && typeof row.maitrise._question === "string" ? row.maitrise._question.trim() : "";
      if (ql) cu.questions.push({ id: "", texte: ql, v: null, qui, date: row.created_at });
      Object.entries(row.cotation || {}).forEach(([id, c]) => {
        const cr = R[id]; if (!cr || !c) return;
        if (c.p && c.i) { cr.p.push(c.p); cr.i.push(c.i); cr.c.push(c.p * c.i); }
        if (c.t === "acc") cr.acc++; else if (c.t === "red") cr.red++;
      });
    });
    const risques = Object.values(R).map(x => ({ ...x, n: x.c.length, mp: moy(x.p), mi: moy(x.i), mc: moy(x.c), sd: ecartType(x.c), min: x.c.length ? Math.min(...x.c) : null, max: x.c.length ? Math.max(...x.c) : null, pctRed: (x.acc + x.red) ? x.red / (x.acc + x.red) : null }));
    const univers = Object.values(U).map(x => ({ ...x, maturite: moy(x.mat), expo: moy(risques.filter(r => r.u.code === x.u.code && r.n).map(r => r.mc)) }));
    return {
      participants: participants.size, societes: societes.size, reponses: univers.reduce((s, u) => s + u.n, 0), univers, risques,
      maturite: moy(univers.filter(u => u.maturite !== null).map(u => u.maturite)),
      expo: moy(risques.filter(r => r.n).map(r => r.mc)),
      couverts: univers.filter(u => u.n > 0).length
    };
  }

  function barres(items, opts) {
    // items : [{lab, v (0..max), txt, tip}] ; une seule teinte, valeurs en texte
    const max = opts.max || Math.max(1, ...items.map(x => x.v || 0));
    return `<div class="bars">${items.map(x => `<div class="bar${x.sub ? " sub" : ""}" data-tip="${esc(x.tip || "")}"><span class="lab" title="${esc(x.lab)}">${t(x.lab)}</span><span class="track"><span class="fill${opts.gris ? " gris" : ""}" style="width:${x.v === null || x.v === undefined ? 0 : Math.max(0, Math.min(100, x.v / max * 100))}%"></span></span><span class="val">${x.txt}</span></div>`).join("")}</div>`;
  }

  function matriceSVG(risques, seuil, top, tipR) {
    const W = 620, H = 520, L = 86, B = 46, T = 12, R = 14;
    const pw = W - L - R, ph = H - T - B;
    const sx = v => L + (v - 0.5) / 4 * pw, sy = v => T + ph - (v - 0.5) / 4 * ph;
    let s = `<svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Matrice des risques : probabilité moyenne en ordonnée, impact moyen en abscisse">`;
    for (let p = 1; p <= 4; p++) for (let i = 1; i <= 4; i++) s += `<rect x="${sx(i - 0.5) + 1}" y="${sy(p + 0.5) + 1}" width="${pw / 4 - 2}" height="${ph / 4 - 2}" rx="6" class="c-${niveau(p * i).k}"/>`;
    for (let v = 1; v <= 4; v++) {
      s += `<text x="${sx(v)}" y="${H - 26}" text-anchor="middle" class="axl">${v} · ${nomImpact[v]}</text>`;
      s += `<text x="${L - 8}" y="${sy(v) + 4}" text-anchor="end" class="axl">${v} · ${nomProba[v]}</text>`;
    }
    s += `<text x="${L + pw / 2}" y="${H - 8}" text-anchor="middle" class="axt">Impact moyen</text>`;
    s += `<text transform="translate(14 ${T + ph / 2}) rotate(-90)" text-anchor="middle" class="axt">Probabilité moyenne</text>`;
    const nommes = new Set(top.map(r => r.r.id));
    risques.filter(r => r.n).sort((a, b) => a.mc - b.mc).forEach(r => {
      const h = [...r.r.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const cx = sx(r.mi) + ((h % 11) - 5) * 1.3, cy = sy(r.mp) + (((h >> 4) % 11) - 5) * 1.3, hors = r.mc > seuil;
      s += `<g class="pt${hors ? " hors" : ""}" data-tip="${esc(tipR(r))}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${hors ? 7 : 6}"/>${(nommes.has(r.r.id) || hors) ? `<text x="${(cx + 9).toFixed(1)}" y="${(cy + 4).toFixed(1)}" class="ptl">${r.r.id}</text>` : ""}</g>`;
    });
    return s + "</svg>";
  }

  const libMaj = () => (S.res.maj ? "Mis à jour à " + S.res.maj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "") + (S.store.isRemote ? "" : " · mode local");

  const libMaitrise = v => (v === null || v === undefined) ? "" : ((S.ref.echelles.maitrise.find(a => String(a.v) === String(v)) || {}).l || "");
  const chipMaitrise = v => (v === null || v === undefined) ? '<span class="chip">Non cotée</span>' : `<span class="chip ok">${t(libMaitrise(v))}</span>`;

  function dessinerResultats() {
    const y = window.scrollY;
    const f = S.res.filtres, seuil = S.res.seuil;
    const all = S.res.rows, rows = filtrer(all), A = agreger(rows);
    const opts = (vals, cur) => vals.map(v => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(v)}</option>`).join("");
    const uniq = k => [...new Set(all.map(r => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr"));
    const hors = A.risques.filter(r => r.n && r.mc > seuil).sort((a, b) => b.mc - a.mc);
    const top = A.risques.filter(r => r.n).sort((a, b) => b.mc - a.mc || b.n - a.n).slice(0, 10);
    const diverg = A.risques.filter(r => r.n >= 2).sort((a, b) => b.sd - a.sd).slice(0, 6);
    const remarques = A.univers.flatMap(u => u.remarques.map(x => ({ ...x, u: u.u })));
    const questionsLibres = A.univers.flatMap(u => u.questions.map(x => ({ ...x, u: u.u })));
    const tipR = r => `${r.r.id} · ${fr(r.r.libelle)}\nProbabilité ${fmt1(r.mp)} · Impact ${fmt1(r.mi)} · Criticité ${fmt1(r.mc)}\n${r.n} cotation${r.n > 1 ? "s" : ""} · Réduire : ${pct(r.pctRed)}`;

    let h = `
      <div class="rhead"><div class="nav"><a class="btn lien" href="#/">← Accueil</a><span class="small muted" id="res-maj">${libMaj()}</span></div>
        <h1>Résultats de la cartographie</h1><p class="muted">${t(CFG.sessionLabel || "")}</p></div>
      ${S.store.isRemote ? "" : '<div class="bandeau">Mode local : seules les réponses saisies sur cet appareil sont affichées. Branchez Supabase dans config.js pour la collecte partagée.</div>'}
      ${S.store.isRemote && S.store.protege === false ? '<div class="bandeau">Lecture non protégée : la fonction d\'accès n\'est pas encore installée dans Supabase (exécuter supabase/securite.sql). En attendant, toute personne ayant le lien peut lire les réponses.</div>' : ""}
      ${S.res.erreur ? `<div class="bandeau erreur">Lecture impossible : ${esc(S.res.erreur)}</div>` : ""}
      <div class="panel"><div class="filtres">
        <div><label for="fl-societe">Société</label><select id="fl-societe" data-filtre="societe"><option value="">Toutes</option>${opts(uniq("societe"), f.societe)}</select></div>
        <div><label for="fl-fonction">Fonction</label><select id="fl-fonction" data-filtre="fonction"><option value="">Toutes</option>${opts(uniq("fonction"), f.fonction)}</select></div>
        <div><label for="fl-perimetre">Périmètre</label><select id="fl-perimetre" data-filtre="perimetre"><option value="">Tous</option><option value="reseau"${f.perimetre === "reseau" ? " selected" : ""}>Réseau</option><option value="sacicap"${f.perimetre === "sacicap" ? " selected" : ""}>Ma société</option></select></div>
        <div><label for="fl-bloc">Bloc</label><select id="fl-bloc" data-filtre="bloc"><option value="">Tous</option>${S.ref.blocs.map(b => `<option value="${b.id}"${f.bloc === b.id ? " selected" : ""}>${t(b.nom)}</option>`).join("")}</select></div>
        <div><label for="fl-seuil">Seuil d'appétence</label><select id="fl-seuil" data-seuil>${S.ref.echelles.seuils.map(s => `<option value="${s.v}"${s.v === seuil ? " selected" : ""}>${t(s.l)}</option>`).join("")}</select></div>
        <button class="btn" data-act="rafraichir">Actualiser</button>
        <button class="btn" data-act="export-brut">Exporter les réponses (CSV)</button>
        <button class="btn" data-act="export-risques">Synthèse risques (CSV)</button>
        <button class="btn" data-act="export-maitrise">Synthèse maîtrise (CSV)</button>
      </div></div>`;

    if (!rows.length) { h += '<div class="vide">Aucune réponse pour le moment. La page se met à jour automatiquement.</div>'; app.innerHTML = h; window.scrollTo(0, y); return; }

    h += `
      <div class="kpis">
        <div class="kpi"><div class="v">${A.participants}</div><div class="l">participant${A.participants > 1 ? "s" : ""}</div></div>
        <div class="kpi"><div class="v">${A.reponses}</div><div class="l">univers renseignés</div></div>
        <div class="kpi"><div class="v">${A.societes}</div><div class="l">société${A.societes > 1 ? "s" : ""} représentée${A.societes > 1 ? "s" : ""}</div></div>
        <div class="kpi"><div class="v">${A.couverts} / ${S.ref.univers.length}</div><div class="l">univers couverts</div></div>
        <div class="kpi"><div class="v">${pct(A.maturite)}</div><div class="l">maîtrise moyenne des risques</div></div>
        <div class="kpi"><div class="v">${fmt1(A.expo)}</div><div class="l">criticité moyenne (sur 16)</div></div>
        <div class="kpi"><div class="v">${hors.length}</div><div class="l">risque${hors.length > 1 ? "s" : ""} au-delà du seuil ${seuil}</div></div>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div class="panel"><h2>Participation par univers</h2><p class="small muted">Nombre de participants ayant renseigné chaque univers.</p>
          ${barres(A.univers.map(u => ({ lab: u.u.court, v: u.n, txt: String(u.n), tip: fr(u.u.nom) })), { max: Math.max(1, A.participants), gris: true })}</div>
        <div class="panel"><h2>Maîtrise des risques par univers</h2><p class="small muted">Moyenne des réponses de maîtrise, de 0 (non) à 100 (formalisé et contrôlé).</p>
          ${barres(A.univers.filter(u => u.maturite !== null).sort((a, b) => a.maturite - b.maturite).map(u => ({ lab: u.u.court, v: u.maturite, txt: pct(u.maturite), tip: fr(u.u.nom) + " · " + u.n + " réponse" + (u.n > 1 ? "s" : "") })), { max: 1 })}</div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>Matrice des risques</h2><p class="small muted">Chaque point est un risque placé à sa probabilité et son impact moyens. Les dix plus critiques et ceux qui dépassent le seuil sont nommés ; survolez les autres.</p>
          ${matriceSVG(A.risques, seuil, top, tipR)}
          <div class="legende"><span><i class="sw" style="background:var(--niv-faible-bg)"></i>Faible 1 à 3</span><span><i class="sw" style="background:var(--niv-modere-bg)"></i>Modéré 4 à 6</span><span><i class="sw" style="background:var(--niv-eleve-bg)"></i>Élevé 8 à 9</span><span><i class="sw" style="background:var(--niv-critique-bg)"></i>Critique 12 à 16</span><span><i class="sw" style="background:var(--gris);border-radius:50%"></i>Risque coté</span><span><i class="sw" style="background:var(--encre);border-radius:50%"></i>Au-delà du seuil</span></div>
        </div>
        <div class="panel"><h2>Exposition moyenne par univers</h2><p class="small muted">Criticité moyenne des risques cotés, sur 16.</p>
          ${barres(A.univers.filter(u => u.expo !== null).sort((a, b) => b.expo - a.expo).map(u => ({ lab: u.u.court, v: u.expo, txt: fmt1(u.expo), tip: fr(u.u.nom) })), { max: 16, gris: true })}</div>
      </div>
      <div class="panel"><h2>Les dix risques les plus critiques</h2>
        <table class="res"><thead><tr><th>Risque</th><th>Univers</th><th class="num">P</th><th class="num">I</th><th class="num">Criticité</th><th class="num">Réduire</th><th class="num">Cotations</th></tr></thead><tbody>
        ${top.map(r => `<tr class="${r.mc > seuil ? "hors" : ""}"><td><strong>${r.r.id}</strong> ${t(r.r.libelle)}</td><td class="small">${t(r.u.court)}</td><td class="num">${fmt1(r.mp)}</td><td class="num">${fmt1(r.mi)}</td><td class="num"><span class="badge ${niveau(Math.round(r.mc)).k}">${fmt1(r.mc)}</span></td><td class="num">${pct(r.pctRed)}</td><td class="num">${r.n}</td></tr>`).join("")}
        </tbody></table></div>
      <div class="grid2">
        <div class="panel"><h2>Risques au-delà du seuil d'appétence (seuil ${seuil})</h2>
          ${hors.length ? `<table class="res"><thead><tr><th>Risque</th><th class="num">Criticité</th><th class="num">Réduire</th></tr></thead><tbody>${hors.map(r => `<tr><td><strong>${r.r.id}</strong> ${t(r.r.libelle)}<br><span class="small muted">${t(r.u.court)}</span></td><td class="num">${fmt1(r.mc)}</td><td class="num">${pct(r.pctRed)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Aucun risque ne dépasse ce seuil en moyenne.</p>'}
        </div>
        <div class="panel"><h2>Où les avis divergent le plus</h2><p class="small muted">Étendue des criticités données (de la plus basse à la plus haute) et moyenne. Matière à débat.</p>
          ${diverg.length ? `<table class="res"><thead><tr><th>Risque</th><th>Étendue 1 à 16</th><th class="num">Écart-type</th></tr></thead><tbody>${diverg.map(r => `<tr><td><strong>${r.r.id}</strong> ${t(r.r.libelle)}<br><span class="small muted">${r.n} cotations</span></td><td><div class="range" title="de ${r.min} à ${r.max}, moyenne ${fmt1(r.mc)}"><span style="left:${(r.min - 1) / 15 * 100}%;width:${(r.max - r.min) / 15 * 100}%"></span><i style="left:${(r.mc - 1) / 15 * 100}%"></i></div></td><td class="num">${fmt1(r.sd)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Il faut au moins deux cotations par risque.</p>'}
        </div>
      </div>
      <div class="panel"><h2>Questions ajoutées par les participants (${questionsLibres.length})</h2>
        <p class="small muted">Mesures de maîtrise proposées dans un chapitre, avec la réponse donnée. Elles n'entrent pas dans la moyenne de maîtrise.</p>
        ${questionsLibres.length ? questionsLibres.map(x => `<div class="remarque"><div class="qui"><strong>${t(x.u.court)}</strong> · ${esc(x.qui)} · ${fmtDate(x.date)}</div><div>${esc(x.texte)} ${chipMaitrise(x.v)}</div></div>`).join("") : '<p class="muted">Aucune question ajoutée pour le moment.</p>'}
      </div>
      ${remarques.length ? `<div class="panel"><h2>Remarques des participants (${remarques.length})</h2>
        ${remarques.map(x => `<div class="remarque"><div class="qui"><strong>${t(x.u.court)}</strong> · ${esc(x.qui)} · ${fmtDate(x.date)}</div><div>${esc(x.texte).replace(/\n/g, "<br>")}</div></div>`).join("")}
      </div>` : ""}`;
    app.innerHTML = h; window.scrollTo(0, y);
  }

  /* ---------- Exports CSV ---------- */
  function telechargerCSV(nom, lignes) {
    const q = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    const data = "﻿" + lignes.map(l => l.map(q).join(";")).join("\r\n");
    const blob = new Blob([data], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const horodatage = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  function exportBrut() {
    const rows = filtrer(S.res.rows), out = [["Participant", "Prénom", "Société", "Fonction", "Périmètre", "Métiers", "Univers", "Date", "Type", "Identifiant", "Libellé", "Valeur", "Valeur en clair"]];
    const E = S.ref.echelles;
    rows.forEach(r => {
      const u = parCode(r.univers); if (!u) return;
      const base = [r.participant_id, r.prenom || "", r.societe || "", r.fonction || "", r.perimetre || "", (r.metiers || []).join(", "), u.code, r.created_at || ""];
      u.questions.forEach(qq => { const v = (r.maitrise || {})[qq.id]; if (v === undefined) return; const lab = (E.maitrise.find(a => String(a.v) === String(v)) || {}).l || ""; out.push([...base, "maitrise", qq.id, fr(qq.texte), v, lab]); });
      u.risques.forEach(rr => { const c = (r.cotation || {})[rr.id]; if (!c) return;
        if (c.p) out.push([...base, "probabilite", rr.id, fr(rr.libelle), c.p, nomProba[c.p] || ""]);
        if (c.i) out.push([...base, "impact", rr.id, fr(rr.libelle), c.i, nomImpact[c.i] || ""]);
        if (c.p && c.i) out.push([...base, "criticite", rr.id, fr(rr.libelle), c.p * c.i, niveau(c.p * c.i).l]);
        if (c.t) out.push([...base, "traitement", rr.id, fr(rr.libelle), c.t, c.t === "red" ? "Réduire" : "Accepter"]);
      });
      if (r.remarques) out.push([...base, "remarques", u.code, "", "", r.remarques]);
      const ql = (r.maitrise || {})._question; if (ql) out.push([...base, "question_ajoutee", u.code, ql, "", ""]);
      ((r.maitrise || {})._ajouts || []).forEach(a => { if (!a || !a.texte) return; out.push([...base, "question_ajoutee", a.id || "", fr(a.texte), a.v ?? "", libMaitrise(a.v)]); });
    });
    telechargerCSV("carto-reponses-" + horodatage() + ".csv", out);
  }
  function exportRisques() {
    const A = agreger(filtrer(S.res.rows)), seuil = S.res.seuil;
    const out = [["Risque", "Univers", "Libellé", "Mesures liées", "Risque subi", "Cotations", "Probabilité moyenne", "Impact moyen", "Criticité moyenne", "Niveau", "Écart-type", "Criticité min", "Criticité max", "Part Réduire", "Au-delà du seuil " + seuil]];
    A.risques.forEach(r => out.push([r.r.id, r.u.code, fr(r.r.libelle), (r.r.mesures || []).join(", "), r.r.subi ? "oui" : "", r.n, fmt1(r.mp), fmt1(r.mi), fmt1(r.mc), r.n ? niveau(Math.round(r.mc)).l : "", fmt1(r.sd), r.min ?? "", r.max ?? "", r.pctRed === null ? "" : Math.round(r.pctRed * 100) + " %", r.n && r.mc > seuil ? "oui" : "non"]));
    telechargerCSV("carto-synthese-risques-" + horodatage() + ".csv", out);
  }
  function exportMaitrise() {
    const A = agreger(filtrer(S.res.rows));
    const out = [["Univers", "Mesure", "Texte", "Risques couverts", "Réponses notées", "Moyenne (0 à 3)", "Maîtrise", "Non", "En partie", "Formalisé", "Formalisé et contrôlé", "Je ne sais pas", "Non concerné"]];
    const autres = {}; filtrer(S.res.rows).forEach(r => Object.entries(r.maitrise || {}).forEach(([k, v]) => { if (k.startsWith("_")) return; if (typeof v !== "number") { autres[k] = autres[k] || { nsp: 0, na: 0 }; if (v in autres[k]) autres[k][v]++; } }));
    A.univers.forEach(u => {
      u.u.questions.forEach(q => { const vals = u.parQ[q.id] || []; const cnt = v => vals.filter(x => x === v).length; const o = autres[q.id] || { nsp: 0, na: 0 }; out.push([u.u.code, q.id, fr(q.texte), (S.parMesure[q.id] || []).join(", "), vals.length, fmt1(moy(vals)), vals.length ? pct(moy(vals) / 3) : "", cnt(0), cnt(1), cnt(2), cnt(3), o.nsp, o.na]); });
      u.questions.forEach(x => out.push([u.u.code, "Question ajoutée" + (x.id ? " " + x.id : ""), fr(x.texte) + " (" + x.qui + ")", "", "", typeof x.v === "number" ? x.v : "", libMaitrise(x.v), "", "", "", "", "", ""]));
    });
    telechargerCSV("carto-synthese-maitrise-" + horodatage() + ".csv", out);
  }

  /* ---------- Événements ---------- */
  app.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "ouvrir") { go("/u/" + b.dataset.code); return; }
    if (a === "editer-profil") { e.preventDefault(); go("/"); return; }
    if (a === "annuler-profil") { S.editionProfil = false; render(); return; }
    if (a === "retour") { if (history.length > 1) history.back(); else go("/"); return; }
    if (a === "enregistrer") { enregistrer(b.dataset.code, b.dataset.suite); return; }
    if (a === "rafraichir") { chargerResultats(); return; }
    if (a === "export-brut") { exportBrut(); return; }
    if (a === "export-risques") { exportRisques(); return; }
    if (a === "export-maitrise") { exportMaitrise(); return; }
    // Saisie : pastilles
    const r = route(); if (r.name !== "saisie") return;
    const u = parCode(r.code), m = mesU(r.code);
    if (a === "maitrise") {
      const v = isNaN(Number(b.dataset.v)) ? b.dataset.v : Number(b.dataset.v);
      if (m.maitrise[b.dataset.q] === v) delete m.maitrise[b.dataset.q]; else m.maitrise[b.dataset.q] = v;
      b.parentElement.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b && m.maitrise[b.dataset.q] !== undefined));
    } else if (a === "ajout-v") {
      const aj = m.ajouts.find(x => x.id === b.dataset.q); if (!aj) return;
      const v = isNaN(Number(b.dataset.v)) ? b.dataset.v : Number(b.dataset.v);
      if (aj.v === v) delete aj.v; else aj.v = v;
      b.parentElement.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b && aj.v !== undefined));
    } else if (a === "ajout-retirer") {
      m.ajouts = m.ajouts.filter(x => x.id !== b.dataset.id);
      m.modifie = Date.now(); persist(); redessinerSaisie(u); toast("Question retirée."); return;
    } else if (a === "p" || a === "i" || a === "t") {
      const c = m.cotation[b.dataset.r] = m.cotation[b.dataset.r] || {};
      const v = a === "t" ? b.dataset.v : Number(b.dataset.v);
      if (c[a] === v) delete c[a]; else c[a] = v;
      if (!Object.keys(c).length) delete m.cotation[b.dataset.r];
      b.parentElement.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b && c[a] !== undefined));
      const badge = b.closest(".risque").querySelector(".crit-badge"); if (badge) badge.innerHTML = badgeCrit(c);
    } else return;
    m.modifie = Date.now(); persist(); majBarre(u);
  });
  bottom.addEventListener("click", e => { const b = e.target.closest("[data-act=enregistrer]"); if (b) enregistrer(b.dataset.code, b.dataset.suite); });
  app.addEventListener("change", e => {
    const el = e.target;
    if (el.name === "perim") { const z = document.getElementById("f-metiers"); if (z) z.classList.toggle("inactif", el.value !== "sacicap"); }
    if (el.dataset.filtre !== undefined) { S.res.filtres[el.dataset.filtre] = el.value; dessinerResultats(); }
    if (el.dataset.seuil !== undefined) { S.res.seuil = Number(el.value); dessinerResultats(); }
  });
  app.addEventListener("submit", e => {
    if (e.target.id === "f-profil") { e.preventDefault(); soumettreProfil(e.target); }
    if (e.target.id === "f-ajout") {
      e.preventDefault(); const r = route(); if (r.name !== "saisie") return;
      const u = parCode(r.code), m = mesU(r.code);
      const texte = (e.target.querySelector("#ajout-texte").value || "").trim().slice(0, 300);
      if (!texte) { toast("Écrivez d'abord votre question."); return; }
      if (m.ajouts.length >= MAX_AJOUTS) { toast("Nombre maximal de questions ajoutées atteint."); return; }
      const id = idAjout(r.code, m.ajouts);
      m.ajouts.push({ id, texte }); m.modifie = Date.now(); persist();
      redessinerSaisie(u); toast("Question ajoutée : répondez-y comme aux autres.");
      const el = app.querySelector(`.q[data-q="${id}"]`); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (e.target.id === "f-cle") { e.preventDefault(); const v = e.target.querySelector("#cle").value.trim(); if (!v) { toast("Saisissez la clé d'accès."); return; } stockerCle(v); render(); }
  });
  // Infobulles
  app.addEventListener("mouseover", e => { const el = e.target.closest("[data-tip]"); if (!el || !el.dataset.tip) return; tip.textContent = el.dataset.tip; tip.classList.add("on"); });
  app.addEventListener("mousemove", e => { if (!tip.classList.contains("on")) return; const x = Math.min(e.clientX + 14, window.innerWidth - 310), y = e.clientY + 16; tip.style.left = x + "px"; tip.style.top = y + "px"; });
  app.addEventListener("mouseout", e => { if (e.target.closest("[data-tip]")) tip.classList.remove("on"); });
  window.addEventListener("hashchange", render);

  /* ---------- Démarrage ---------- */
  async function init() {
    try {
      const [ref, soc] = await Promise.all([fetch("referentiel.json").then(r => r.json()), fetch("societes.json").then(r => r.json())]);
      S.ref = ref; S.soc = soc; indexer(ref);
    } catch (e) {
      app.innerHTML = '<div class="bandeau erreur">Le référentiel n\'a pas pu être chargé. Rechargez la page.</div>'; return;
    }
    S.store = creerStore(CFG);
    setStatut(S.store.isRemote ? "ok" : "off", S.store.isRemote ? "Connecté" : "Mode local");
    render();
    viderFile(); setInterval(viderFile, 30000);
    window.addEventListener("online", viderFile);
  }
  init();
})();
