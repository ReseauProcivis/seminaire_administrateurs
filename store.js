/* Couche de stockage des réponses.
   - LocalStore : tout reste dans le navigateur (tests, démonstration).
   - SupabaseStore : table « reponses » exposée par l'API REST de Supabase.
   Les deux exposent la même interface : saveReponse(row, opts) et listReponses(session, cle).
   opts.keepalive : l'envoi survit à la fermeture de la page (utilisé quand le téléphone passe en veille).
   La lecture passe par la fonction lire_reponses (supabase/securite.sql), qui vérifie la clé
   d'accès côté base : la clé publique du navigateur ne peut plus lire la table directement. */

class LocalStore {
  constructor() { this.isRemote = false; this.nom = "local"; this.cle = "carto.reponses.locales"; }
  _lire() { try { return JSON.parse(localStorage.getItem(this.cle) || "[]"); } catch (e) { return []; } }
  async saveReponse(row) {
    const all = this._lire();
    all.push({ ...row, id: "loc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString() });
    localStorage.setItem(this.cle, JSON.stringify(all));
    return true;
  }
  async listReponses(session) { return this._lire().filter(r => !session || r.session === session); }
}

class SupabaseStore {
  constructor(url, key) {
    this.isRemote = true; this.nom = "supabase"; this.protege = null;
    const base = url.replace(/\/$/, "") + "/rest/v1";
    this.base = base + "/reponses";
    this.rpc = base + "/rpc/lire_reponses";
    this.headers = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
  }
  async saveReponse(row, opts) {
    const res = await fetch(this.base, { method: "POST", headers: { ...this.headers, "Prefer": "return=minimal" }, body: JSON.stringify(row), keepalive: !!(opts && opts.keepalive) });
    if (!res.ok) throw new Error("Supabase " + res.status + " : " + (await res.text()).slice(0, 200));
    return true;
  }
  // Lecture protégée : lire_reponses(p_session, p_cle) renvoie les lignes de la session si la clé est bonne,
  // sinon une erreur « cle_invalide ». Tant que la fonction n'est pas installée (404), lecture directe de la table,
  // qui ne fonctionne que si la règle de lecture publique existe encore.
  async listReponses(session, cle) {
    const out = []; const page = 1000; let from = 0;
    for (;;) {
      const res = await fetch(this.rpc, {
        method: "POST",
        headers: { ...this.headers, "Range-Unit": "items", "Range": from + "-" + (from + page - 1) },
        body: JSON.stringify({ p_session: session || "", p_cle: cle || "" })
      });
      if (res.ok) {
        const rows = await res.json(); out.push(...rows);
        if (rows.length < page) break; from += page; continue;
      }
      const txt = await res.text();
      if (res.status === 404 && /PGRST202|lire_reponses/.test(txt)) { this.protege = false; return this._lireDirect(session); }
      if (/cle_invalide/.test(txt)) { const e = new Error("Clé d'accès incorrecte."); e.code = "cle"; throw e; }
      throw new Error("Supabase " + res.status + " : " + txt.slice(0, 200));
    }
    this.protege = true;
    return out;
  }
  async _lireDirect(session) {
    const out = []; const page = 1000; let from = 0;
    for (;;) {
      const url = this.base + "?select=*&order=created_at.asc" + (session ? "&session=eq." + encodeURIComponent(session) : "");
      const res = await fetch(url, { headers: { ...this.headers, "Range-Unit": "items", "Range": from + "-" + (from + page - 1) } });
      if (!res.ok && res.status !== 206) throw new Error("Supabase " + res.status);
      const rows = await res.json(); out.push(...rows);
      if (rows.length < page) break; from += page;
    }
    return out;
  }
}

function creerStore(cfg) {
  if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) return new SupabaseStore(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return new LocalStore();
}
