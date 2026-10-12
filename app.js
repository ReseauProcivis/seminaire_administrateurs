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
  const mesU = code => (S.mes[code] = S.mes[code] || { maitrise: {}, cotation: {}, remarques: "", modifie: null, envoye: null });

  function progression(u) {
    const m = S.mes[u.code] || { maitrise: {}, cotation: {} };
    const q = u.questions.filter(x => m.maitrise[x.id] !== undefined).length;
    const r = u.risques.filter(x => m.cotation[x.id] && m.cotation[x.id].p && m.cotation[x.id].i).length;
    const tot = u.questions.length + u.risques.length, fait = q + r;
    return { fait, tot, q, r, etat: fait === 0 ? "afaire" : fait < tot ? "encours" : "termine" };
  }

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
    app.className = "page" + (r.name === "resultats" ? " large" : "");
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

  /* ---------- Accueil ---------- */
  function vueAccueil() {
    const p = S.participant;
    const soc = S.soc.societes, fon = S.soc.fonctions;
    const metiers = S.ref.metiers;
    const sel = (v, cur) => v === cur ? " selected" : "";
    const hero = `
      <div class="hero">
        <img src="assets/logo-procivis.png" alt="Procivis">
        <h1>Cartographie des risques du réseau Procivis</h1>
        <p class="sous">${t(CFG.sessionLabel || "")}</p>
      </div>`;
    const etapes = `
      <div class="panel">
        <div class="etapes">
          <div class="etape"><b>1</b><p><strong>Identifiez-vous</strong> en quelques secondes : votre société et votre fonction suffisent.</p></div>
          <div class="etape"><b>2</b><p><strong>Évaluez et cotez</strong>, univers par univers : la maîtrise du dispositif, puis la probabilité et l'impact de chaque risque, de 1 à 4. Chaque univers s'enregistre séparément : vous pouvez en remplir un seul ou plusieurs.</p></div>
          <div class="etape"><b>3</b><p><strong>Partagez vos remarques</strong> : une question mal posée, un risque manquant, tout est utile pour améliorer cette cartographie.</p></div>
        </div>
        <p class="small muted" style="margin:10px 0 0">Durée indicative : 4 à 6 minutes par univers. <a href="#/aide">Comprendre les échelles de cotation</a></p>
      </div>`;
    if (p && !S.editionProfil) {
      const act = universActifs(p), fin = act.filter(u => progression(u).etat === "termine").length;
      return hero + `
        <div class="panel accent">
          <h2>Bon retour${p.prenom ? ", " + esc(p.prenom) : ""}</h2>
          <p>${esc(p.societe)} · ${esc(p.fonction)} · ${p.perimetre === "sacicap" ? "périmètre de ma société" : "périmètre réseau"}</p>
          <p class="muted small">${fin} univers terminé${fin > 1 ? "s" : ""} sur ${act.length}.</p>
          <div class="actions">
            <a class="btn primaire" href="#/univers">Reprendre</a>
            <button class="btn" data-act="editer-profil">Modifier mes informations</button>
          </div>
        </div>` + etapes;
    }
    const cur = p || {};
    return hero + etapes + `
      <form class="panel" id="f-profil" autocomplete="off">
        <h2>Qui répond ?</h2>
        <label class="champ" for="f-societe">Votre société</label>
        <select id="f-societe" required>
          <option value="">Choisir dans la liste</option>
          ${soc.map(s => `<option value="${esc(s)}"${sel(s, cur.societe)}>${esc(s)}</option>`).join("")}
        </select>
        <label class="champ" for="f-fonction">Votre fonction</label>
        <select id="f-fonction" required>
          <option value="">Choisir dans la liste</option>
          ${fon.map(s => `<option value="${esc(s)}"${sel(s, cur.fonction)}>${esc(s)}</option>`).join("")}
        </select>
        <label class="champ" for="f-prenom">Votre prénom <small>Facultatif. Il n'apparaît que dans l'export destiné à la direction générale.</small></label>
        <input type="text" id="f-prenom" maxlength="60" value="${esc(cur.prenom || "")}" placeholder="Prénom">
        <label class="champ">Périmètre de votre évaluation</label>
        <div class="radios">
          <label class="radio${cur.perimetre !== "sacicap" ? " on" : ""}"><input type="radio" name="perim" value="reseau"${cur.perimetre !== "sacicap" ? " checked" : ""}><span><strong>Le réseau Procivis dans son ensemble</strong><br><span class="small muted">Vision d'ensemble pour le séminaire : les 17 univers sont proposés.</span></span></label>
          <label class="radio${cur.perimetre === "sacicap" ? " on" : ""}"><input type="radio" name="perim" value="sacicap"${cur.perimetre === "sacicap" ? " checked" : ""}><span><strong>Ma société uniquement</strong><br><span class="small muted">Seuls les univers correspondant aux métiers exercés sont proposés.</span></span></label>
        </div>
        <div id="f-metiers" style="display:${cur.perimetre === "sacicap" ? "block" : "none"}">
          <label class="champ">Métiers exercés par votre société</label>
          <div class="radios">
            ${metiers.map(m => `<label class="check${(cur.metiers || []).includes(m.id) ? " on" : ""}"><input type="checkbox" name="met" value="${m.id}"${(cur.metiers || []).includes(m.id) ? " checked" : ""}><span><strong>${t(m.nom)}</strong><br><span class="small muted">${t(m.description)}</span></span></label>`).join("")}
          </div>
        </div>
        <div class="actions">
          <button class="btn primaire" type="submit">${p ? "Enregistrer et reprendre" : "Commencer"}</button>
          ${p ? '<button class="btn" type="button" data-act="annuler-profil">Annuler</button>' : ""}
        </div>
      </form>`;
  }

  function soumettreProfil(form) {
    const societe = form.querySelector("#f-societe").value;
    const fonction = form.querySelector("#f-fonction").value;
    const prenom = form.querySelector("#f-prenom").value.trim();
    const perimetre = form.querySelector("input[name=perim]:checked").value;
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
    h += `<p class="small muted" style="margin-top:18px"><a href="#/aide">Comprendre les échelles de cotation</a></p>`;
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
          <p class="small" style="margin-top:8px"><strong>Maîtrise</strong> : répondez pour chaque mesure selon ce qui existe réellement aujourd'hui. <strong>Probabilité</strong> et <strong>impact</strong> se cotent de 1 à 4 en tenant compte des mesures déjà en place. La criticité est le produit des deux. Pour chaque risque, indiquez si le réseau peut l'<strong>accepter</strong> tel quel ou doit le <strong>réduire</strong>. <a href="#/aide">Voir les échelles détaillées</a>.</p>
        </details>
      </div>
      <div class="panel">
        <div class="section-titre"><span class="num">1</span><h2>Maîtrise du dispositif</h2></div>
        <p class="small muted">${u.questions.length} mesures à qualifier.</p>
        ${u.questions.map(q => `
          <div class="q" data-q="${q.id}">
            <p>${t(txtQ(q))}</p>
            <div class="pills" role="group" aria-label="${esc(q.id)}">
              ${E.maitrise.map(a => `<button type="button" class="pill${String(a.v) === "na" ? " na" : ""}${m.maitrise[q.id] !== undefined && String(m.maitrise[q.id]) === String(a.v) ? " on" : ""}" data-act="maitrise" data-q="${q.id}" data-v="${a.v}">${t(a.l)}</button>`).join("")}
            </div>
          </div>`).join("")}
      </div>
      <div class="panel">
        <div class="section-titre"><span class="num">2</span><h2>Cotation des risques</h2></div>
        <p class="small muted">${u.risques.length} risques. Probabilité et impact de 1 à 4, puis décision : accepter ou réduire.</p>
        ${u.risques.map(r => {
          const c = m.cotation[r.id] || {};
          return `
          <div class="risque" data-r="${r.id}">
            <div class="lib"><span class="code">${r.id}</span><b>${t(r.libelle)}</b></div>
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
      </div>
      <div class="panel">
        <div class="section-titre"><span class="num">3</span><h2>Vos remarques sur cet univers</h2></div>
        <p class="small muted">Question à reformuler, risque manquant, mesure de maîtrise oubliée, exemple vécu : tout est utile.</p>
        <textarea id="remarques" maxlength="4000" placeholder="Vos remarques (facultatif)">${esc(m.remarques || "")}</textarea>
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

  async function enregistrer(code, suite) {
    const u = parCode(code), m = mesU(code), p = S.participant;
    const pr = progression(u);
    if (pr.fait === 0 && !(m.remarques || "").trim()) { toast("Rien à enregistrer pour cet univers."); return; }
    const row = {
      session: SESSION, participant_id: p.id, prenom: p.prenom || null, societe: p.societe, fonction: p.fonction,
      perimetre: p.perimetre, metiers: p.perimetre === "sacicap" ? p.metiers : null, univers: code,
      maitrise: m.maitrise, cotation: m.cotation, remarques: (m.remarques || "").trim() || null, version_ref: S.ref.version
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
      <div class="rhead"><div class="nav"><button class="btn lien" data-act="retour">← Retour</button></div><h1>Comprendre les échelles</h1></div>
      <div class="panel">
        <h2>Maîtrise du dispositif</h2>
        <table class="echelle"><tr><th>Réponse</th><th>Sens</th></tr>
          <tr><td><strong>Non</strong></td><td>La mesure n'existe pas.</td></tr>
          <tr><td><strong>En partie</strong></td><td>Elle existe de façon informelle ou incomplète.</td></tr>
          <tr><td><strong>Oui, formalisé</strong></td><td>Elle est écrite et appliquée.</td></tr>
          <tr><td><strong>Oui, formalisé et contrôlé</strong></td><td>Elle est écrite, appliquée et son application est vérifiée.</td></tr>
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
      </div>
      <div class="panel">
        <h2>Criticité et appétence</h2>
        <p>La criticité est le produit probabilité × impact, de 1 à 16 : <span class="badge faible">1 à 3 Faible</span> <span class="badge modere">4 à 6 Modéré</span> <span class="badge eleve">8 à 9 Élevé</span> <span class="badge critique">12 à 16 Critique</span></p>
        <p>Le seuil d'appétence fixe la criticité au-delà de laquelle un risque n'est plus acceptable sans plan d'action : ${E.seuils.map(s => "<strong>" + t(s.l) + "</strong>").join(", ")}. Il est choisi par le conseil et appliqué à la lecture des résultats.</p>
      </div>
      <div class="panel">
        <h2>Cadre de référence du réseau</h2>
        ${S.ref.cadre_juridique.map(c => `<p><strong>${t(c.titre)}.</strong> ${t(c.texte)}</p>`).join("")}
        <p class="small muted">Sources : ${S.ref.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${t(s.titre)}</a>`).join(" · ")}</p>
      </div>`;
  }

  /* ---------- Résultats (animateur) ---------- */
  function accesResultats() {
    if (!CFG.resultatsCle) return true;
    const c = PARAMS.get("cle"); if (c === CFG.resultatsCle) { try { sessionStorage.setItem("carto.cle", c); } catch (e) {} return true; }
    try { return sessionStorage.getItem("carto.cle") === CFG.resultatsCle; } catch (e) { return false; }
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
      const rows = dedupe(await S.store.listReponses(SESSION));
      const emp = rows.length + "|" + rows.reduce((m, r) => (r.created_at || "") > m ? r.created_at : m, "");
      change = emp !== S.res.empreinte || !!S.res.erreur; S.res.empreinte = emp;
      S.res.rows = rows; S.res.maj = new Date();
    } catch (e) { S.res.erreur = e.message || String(e); }
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
    const U = {}; S.ref.univers.forEach(u => U[u.code] = { u, n: 0, mat: [], parQ: {}, remarques: [] });
    const R = {}; S.ref.univers.forEach(u => u.risques.forEach(r => R[r.id] = { r, u, p: [], i: [], c: [], acc: 0, red: 0 }));
    const participants = new Set(), societes = new Set();
    rows.forEach(row => {
      const cu = U[row.univers]; if (!cu) return;
      participants.add(row.participant_id); if (row.societe) societes.add(row.societe);
      cu.n++;
      const vals = [];
      Object.entries(row.maitrise || {}).forEach(([q, v]) => { if (typeof v === "number") { vals.push(v); (cu.parQ[q] = cu.parQ[q] || []).push(v); } });
      if (vals.length) cu.mat.push(moy(vals) / 3);
      if (row.remarques && String(row.remarques).trim()) cu.remarques.push({ texte: String(row.remarques).trim(), qui: [row.prenom, row.societe, row.fonction].filter(Boolean).join(" · "), date: row.created_at });
      Object.entries(row.cotation || {}).forEach(([id, c]) => {
        const cr = R[id]; if (!cr || !c) return;
        if (c.p && c.i) { cr.p.push(c.p); cr.i.push(c.i); cr.c.push(c.p * c.i); }
        if (c.t === "acc") cr.acc++; else if (c.t === "red") cr.red++;
      });
    });
    const risques = Object.values(R).map(x => ({ ...x, n: x.c.length, mp: moy(x.p), mi: moy(x.i), mc: moy(x.c), sd: ecartType(x.c), min: x.c.length ? Math.min(...x.c) : null, max: x.c.length ? Math.max(...x.c) : null, pctRed: (x.acc + x.red) ? x.red / (x.acc + x.red) : null }));
    const univers = Object.values(U).map(x => ({ ...x, maturite: moy(x.mat), expo: moy(risques.filter(r => r.u.code === x.u.code && r.n).map(r => r.mc)) }));
    return {
      participants: participants.size, societes: societes.size, reponses: rows.length, univers, risques,
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
    const tipR = r => `${r.r.id} · ${fr(r.r.libelle)}\nProbabilité ${fmt1(r.mp)} · Impact ${fmt1(r.mi)} · Criticité ${fmt1(r.mc)}\n${r.n} cotation${r.n > 1 ? "s" : ""} · Réduire : ${pct(r.pctRed)}`;

    let h = `
      <div class="rhead"><div class="nav"><a class="btn lien" href="#/">← Accueil</a><span class="small muted" id="res-maj">${libMaj()}</span></div>
        <h1>Résultats de la cartographie</h1><p class="muted">${t(CFG.sessionLabel || "")}</p></div>
      ${S.store.isRemote ? "" : '<div class="bandeau">Mode local : seules les réponses saisies sur cet appareil sont affichées. Branchez Supabase dans config.js pour la collecte partagée.</div>'}
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
        <div class="kpi"><div class="v">${pct(A.maturite)}</div><div class="l">maturité moyenne du dispositif</div></div>
        <div class="kpi"><div class="v">${fmt1(A.expo)}</div><div class="l">criticité moyenne (sur 16)</div></div>
        <div class="kpi"><div class="v">${hors.length}</div><div class="l">risque${hors.length > 1 ? "s" : ""} au-delà du seuil ${seuil}</div></div>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div class="panel"><h2>Participation par univers</h2><p class="small muted">Nombre de participants ayant renseigné chaque univers.</p>
          ${barres(A.univers.map(u => ({ lab: u.u.court, v: u.n, txt: String(u.n), tip: fr(u.u.nom) })), { max: Math.max(1, A.participants), gris: true })}</div>
        <div class="panel"><h2>Maturité du dispositif par univers</h2><p class="small muted">Moyenne des réponses de maîtrise, de 0 (non) à 100 (formalisé et contrôlé).</p>
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
        <div class="panel"><h2>Risques au-delà du seuil d'appétence (${seuil})</h2>
          ${hors.length ? `<table class="res"><thead><tr><th>Risque</th><th class="num">Criticité</th><th class="num">Réduire</th></tr></thead><tbody>${hors.map(r => `<tr><td><strong>${r.r.id}</strong> ${t(r.r.libelle)}<br><span class="small muted">${t(r.u.court)}</span></td><td class="num">${fmt1(r.mc)}</td><td class="num">${pct(r.pctRed)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Aucun risque ne dépasse ce seuil en moyenne.</p>'}
        </div>
        <div class="panel"><h2>Où les avis divergent le plus</h2><p class="small muted">Étendue des criticités données (de la plus basse à la plus haute) et moyenne. Matière à débat.</p>
          ${diverg.length ? `<table class="res"><thead><tr><th>Risque</th><th>Étendue 1 à 16</th><th class="num">Écart-type</th></tr></thead><tbody>${diverg.map(r => `<tr><td><strong>${r.r.id}</strong> ${t(r.r.libelle)}<br><span class="small muted">${r.n} cotations</span></td><td><div class="range" title="de ${r.min} à ${r.max}, moyenne ${fmt1(r.mc)}"><span style="left:${(r.min - 1) / 15 * 100}%;width:${(r.max - r.min) / 15 * 100}%"></span><i style="left:${(r.mc - 1) / 15 * 100}%"></i></div></td><td class="num">${fmt1(r.sd)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Il faut au moins deux cotations par risque.</p>'}
        </div>
      </div>
      <div class="panel"><h2>Remarques des participants (${remarques.length})</h2>
        ${remarques.length ? remarques.map(x => `<div class="remarque"><div class="qui"><strong>${t(x.u.court)}</strong> · ${esc(x.qui)} · ${fmtDate(x.date)}</div><div>${esc(x.texte).replace(/\n/g, "<br>")}</div></div>`).join("") : '<p class="muted">Aucune remarque pour le moment.</p>'}
      </div>`;
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
    });
    telechargerCSV("carto-reponses-" + horodatage() + ".csv", out);
  }
  function exportRisques() {
    const A = agreger(filtrer(S.res.rows)), seuil = S.res.seuil;
    const out = [["Risque", "Univers", "Libellé", "Cotations", "Probabilité moyenne", "Impact moyen", "Criticité moyenne", "Niveau", "Écart-type", "Criticité min", "Criticité max", "Part Réduire", "Au-delà du seuil " + seuil]];
    A.risques.forEach(r => out.push([r.r.id, r.u.code, fr(r.r.libelle), r.n, fmt1(r.mp), fmt1(r.mi), fmt1(r.mc), r.n ? niveau(Math.round(r.mc)).l : "", fmt1(r.sd), r.min ?? "", r.max ?? "", r.pctRed === null ? "" : Math.round(r.pctRed * 100) + " %", r.n && r.mc > seuil ? "oui" : "non"]));
    telechargerCSV("carto-synthese-risques-" + horodatage() + ".csv", out);
  }
  function exportMaitrise() {
    const A = agreger(filtrer(S.res.rows));
    const out = [["Univers", "Question", "Texte", "Réponses", "Moyenne (0 à 3)", "Maturité", "Non", "En partie", "Formalisé", "Formalisé et contrôlé"]];
    A.univers.forEach(u => u.u.questions.forEach(q => { const vals = u.parQ[q.id] || []; const cnt = v => vals.filter(x => x === v).length; out.push([u.u.code, q.id, fr(q.texte), vals.length, fmt1(moy(vals)), vals.length ? pct(moy(vals) / 3) : "", cnt(0), cnt(1), cnt(2), cnt(3)]); }));
    telechargerCSV("carto-synthese-maitrise-" + horodatage() + ".csv", out);
  }

  /* ---------- Événements ---------- */
  app.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "ouvrir") { go("/u/" + b.dataset.code); return; }
    if (a === "editer-profil") { e.preventDefault(); S.editionProfil = true; if (route().name === "accueil") render(); else go("/"); return; }
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
      const v = b.dataset.v === "na" ? "na" : Number(b.dataset.v);
      if (m.maitrise[b.dataset.q] === v) delete m.maitrise[b.dataset.q]; else m.maitrise[b.dataset.q] = v;
      b.parentElement.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b && m.maitrise[b.dataset.q] !== undefined));
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
  app.addEventListener("input", e => {
    if (e.target.id === "remarques") { const r = route(); if (r.name !== "saisie") return; const m = mesU(r.code); m.remarques = e.target.value; m.modifie = Date.now(); persist(); majBarre(parCode(r.code)); }
  });
  app.addEventListener("change", e => {
    const el = e.target;
    if (el.name === "perim") { const z = document.getElementById("f-metiers"); if (z) z.style.display = el.value === "sacicap" ? "block" : "none"; app.querySelectorAll(".radio").forEach(l => l.classList.toggle("on", l.querySelector("input").checked)); }
    if (el.name === "met") el.closest(".check").classList.toggle("on", el.checked);
    if (el.dataset.filtre !== undefined) { S.res.filtres[el.dataset.filtre] = el.value; dessinerResultats(); }
    if (el.dataset.seuil !== undefined) { S.res.seuil = Number(el.value); dessinerResultats(); }
  });
  app.addEventListener("submit", e => {
    if (e.target.id === "f-profil") { e.preventDefault(); soumettreProfil(e.target); }
    if (e.target.id === "f-cle") { e.preventDefault(); const v = e.target.querySelector("#cle").value.trim(); if (v === CFG.resultatsCle) { try { sessionStorage.setItem("carto.cle", v); } catch (x) {} render(); } else toast("Clé incorrecte."); }
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
      S.ref = ref; S.soc = soc;
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
