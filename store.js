/* Couche de stockage des réponses.
   - LocalStore : tout reste dans le navigateur (tests, démonstration).
   - SupabaseStore : table « reponses » exposée par l'API REST de Supabase.
   Les deux exposent la même interface : saveReponse(row) et listReponses(session). */

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
    this.isRemote = true; this.nom = "supabase";
    this.base = url.replace(/\/$/, "") + "/rest/v1/reponses";
    this.headers = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
  }
  async saveReponse(row) {
    const res = await fetch(this.base, { method: "POST", headers: { ...this.headers, "Prefer": "return=minimal" }, body: JSON.stringify(row) });
    if (!res.ok) throw new Error("Supabase " + res.status + " : " + (await res.text()).slice(0, 200));
    return true;
  }
  async listReponses(session) {
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
