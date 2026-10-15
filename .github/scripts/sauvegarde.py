#!/usr/bin/env python3
"""Sauvegarde des réponses de la cartographie des risques sur le Drive Leviia (WebDAV).

Lit toutes les réponses dans Supabase (fonction lire_toutes_reponses, clé d'accès des résultats),
puis dépose pour chaque session, archives comprises, dans « Cartographie des risques / <date> <session> / » :
  - reponses.csv          dernière réponse par participant et univers, au format long (comme l'export de la page)
  - reponses-brutes.json  toutes les lignes de la session, telles qu'enregistrées
et à la racine du dossier un fichier derniere-sauvegarde.txt.

Bibliothèque standard seulement. Variables d'environnement : SUPABASE_URL, SUPABASE_ANON_KEY, RESULTATS_CLE,
LEVIIA_URL, LEVIIA_USER, LEVIIA_TOKEN. Sans SUPABASE_URL ou LEVIIA_URL, le script ne fait rien.
Tant que lire_toutes_reponses n'est pas installée (supabase/reinitialisation.sql), seule la session de config.js
est sauvegardée, par lire_reponses."""
import base64, csv, io, json, os, re, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOSSIER = "Cartographie des risques"
PARIS = timezone(timedelta(hours=2))  # heure d'été ; la date du dossier n'a pas besoin de plus de précision

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
CLE = os.environ.get("RESULTATS_CLE", "")
LEVIIA_URL = os.environ.get("LEVIIA_URL", "").rstrip("/") + "/"
LEVIIA_AUTH = "Basic " + base64.b64encode((os.environ.get("LEVIIA_USER", "") + ":" + os.environ.get("LEVIIA_TOKEN", "")).encode()).decode()

NOM_PROBA = {1: "Improbable", 2: "Rare", 3: "Occasionnel", 4: "Fréquent"}
NOM_IMPACT = {1: "Limité", 2: "Significatif", 3: "Critique", 4: "Catastrophique"}
NOM_MAITRISE = {"0": "Non", "1": "En partie", "2": "Oui, formalisé", "3": "Oui, formalisé et contrôlé", "nsp": "Je ne sais pas", "na": "Non concerné"}


def niveau(c):
    return "Faible" if c <= 3 else "Modéré" if c <= 6 else "Élevé" if c <= 9 else "Critique"


def supabase_rpc(fonction, corps):
    """Appelle une fonction Supabase en paginant par 1000 lignes. Renvoie (lignes, code HTTP d'erreur ou None)."""
    out, page, depuis = [], 1000, 0
    while True:
        req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/rpc/{fonction}", data=json.dumps(corps).encode(), method="POST",
                                     headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json",
                                              "Range-Unit": "items", "Range": f"{depuis}-{depuis + page - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                rows = json.loads(r.read().decode() or "[]")
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors="replace")[:300]
            if "cle_invalide" in txt:
                sys.exit("Clé d'accès des résultats refusée par Supabase (secret RESULTATS_CLE).")
            return out, (e.code, txt)
        out.extend(rows)
        if len(rows) < page:
            return out, None
        depuis += page


def session_config():
    try:
        with open(os.path.join(RACINE, "config.js"), encoding="utf-8") as f:
            m = re.search(r'session:\s*"([^"]+)"', f.read())
            return m.group(1) if m else ""
    except OSError:
        return ""


def lire_toutes_reponses():
    rows, err = supabase_rpc("lire_toutes_reponses", {"p_cle": CLE})
    if err is None:
        return rows, "lire_toutes_reponses"
    if err[0] == 404:
        s = session_config()
        print(f"lire_toutes_reponses absente (exécuter supabase/reinitialisation.sql) : repli sur la session « {s} »")
        rows, err2 = supabase_rpc("lire_reponses", {"p_session": s, "p_cle": CLE})
        if err2 is not None:
            sys.exit(f"Lecture impossible : HTTP {err2[0]} {err2[1]}")
        return rows, "lire_reponses"
    sys.exit(f"Lecture impossible : HTTP {err[0]} {err[1]}")


def charger_referentiel():
    libelles = {}
    try:
        with open(os.path.join(RACINE, "referentiel.json"), encoding="utf-8") as f:
            ref = json.load(f)
        for u in ref.get("univers", []):
            for q in u.get("questions", []):
                libelles[q["id"]] = q.get("texte", "")
            for r in u.get("risques", []):
                libelles[r["id"]] = r.get("libelle", "")
    except (OSError, ValueError):
        pass
    return libelles


def dernieres(rows):
    """Dernière ligne par participant et univers (chaque envoi est une ligne complète)."""
    d = {}
    for r in rows:
        k = (r.get("participant_id"), r.get("univers"))
        if k not in d or (r.get("created_at") or "") > (d[k].get("created_at") or ""):
            d[k] = r
    return sorted(d.values(), key=lambda r: (r.get("created_at") or ""))


def csv_long(rows, libelles):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    w.writerow(["Participant", "Prénom", "Société", "Fonction", "Périmètre", "Métiers", "Univers", "Date", "Type", "Identifiant", "Libellé", "Valeur", "Valeur en clair"])
    for r in dernieres(rows):
        base = [r.get("participant_id", ""), r.get("prenom") or "", r.get("societe") or "", r.get("fonction") or "", r.get("perimetre") or "",
                ", ".join(r.get("metiers") or []), r.get("univers", ""), r.get("created_at", "")]
        for rid, c in sorted((r.get("cotation") or {}).items()):
            if not isinstance(c, dict):
                continue
            lib = libelles.get(rid, "")
            p, i, t = c.get("p"), c.get("i"), c.get("t")
            if p: w.writerow(base + ["probabilite", rid, lib, p, NOM_PROBA.get(p, "")])
            if i: w.writerow(base + ["impact", rid, lib, i, NOM_IMPACT.get(i, "")])
            if p and i: w.writerow(base + ["criticite", rid, lib, p * i, niveau(p * i)])
            if t: w.writerow(base + ["traitement", rid, lib, t, "Réduire" if t == "red" else "Accepter"])
        mait = r.get("maitrise") or {}
        for mid, v in sorted(mait.items()):
            if mid.startswith("_"):
                continue
            w.writerow(base + ["maitrise", mid, libelles.get(mid, ""), v, NOM_MAITRISE.get(str(v), "")])
        for a in mait.get("_ajouts") or []:
            if isinstance(a, dict) and a.get("texte"):
                w.writerow(base + ["mesure_proposee", a.get("id", ""), a["texte"], a.get("v", ""), NOM_MAITRISE.get(str(a.get("v", "")), "")])
    return "﻿" + buf.getvalue()


def webdav(methode, chemin, corps=None, content_type=None):
    url = LEVIIA_URL + "/".join(urllib.parse.quote(seg) for seg in chemin.split("/") if seg)
    if chemin.endswith("/"):
        url += "/"
    h = {"Authorization": LEVIIA_AUTH}
    if content_type:
        h["Content-Type"] = content_type
    req = urllib.request.Request(url, data=corps, method=methode, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def dossier(chemin):
    code = webdav("MKCOL", chemin + "/")
    if code not in (201, 405):  # 405 : existe déjà
        sys.exit(f"Impossible de créer le dossier Leviia « {chemin} » : HTTP {code}")


def deposer(chemin, contenu, content_type):
    code = webdav("PUT", chemin, contenu.encode("utf-8"), content_type)
    if code not in (200, 201, 204):
        sys.exit(f"Dépôt impossible sur Leviia « {chemin} » : HTTP {code}")


def nom_dossier_session(session, rows):
    dates = [r.get("created_at") for r in rows if r.get("created_at")]
    try:
        d = datetime.fromisoformat(min(dates).replace("Z", "+00:00")).astimezone(PARIS).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        d = "sans-date"
    return f"{d} {session}".replace("/", "-")


def main():
    if not SUPABASE_URL or not ANON or not CLE or LEVIIA_URL == "/" or not os.environ.get("LEVIIA_TOKEN"):
        print("Secrets absents, rien à faire")
        return
    rows, source = lire_toutes_reponses()
    sessions = {}
    for r in rows:
        sessions.setdefault(r.get("session") or "sans-session", []).append(r)
    print(f"{len(rows)} lignes lues par {source}, {len(sessions)} session(s)")
    libelles = charger_referentiel()
    dossier(DOSSIER)
    maintenant = datetime.now(timezone.utc).astimezone(PARIS).strftime("%d/%m/%Y %H:%M")
    for session, lignes in sorted(sessions.items()):
        d = f"{DOSSIER}/{nom_dossier_session(session, lignes)}"
        dossier(d)
        deposer(f"{d}/reponses.csv", csv_long(lignes, libelles), "text/csv; charset=utf-8")
        deposer(f"{d}/reponses-brutes.json", json.dumps(lignes, ensure_ascii=False, indent=1), "application/json; charset=utf-8")
        print(f"  {d} : {len(lignes)} lignes, {len(dernieres(lignes))} réponses")
    deposer(f"{DOSSIER}/derniere-sauvegarde.txt",
            f"Dernière sauvegarde : {maintenant} (heure de Paris)\n{len(rows)} lignes, {len(sessions)} session(s), source {source}\n", "text/plain; charset=utf-8")
    print("Sauvegarde terminée")


if __name__ == "__main__":
    main()
