# Cartographie des risques du réseau Procivis

Application web statique (HTML, CSS, JavaScript sans dépendance) destinée à être hébergée sur GitHub Pages. Les administrateurs flashent un QR code, s'identifient en quelques secondes, prennent connaissance des mesures de maîtrise et cotent les risques univers par univers. Chaque cotation part en direct ; une page de résultats compile les réponses au fil de l'eau pour l'animation, dès les premières cotations.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique (accueil, liste des univers, saisie, aide, résultats) |
| `app.js` | Logique de l'application, agrégation, exports CSV |
| `store.js` | Stockage des réponses : local (tests) ou Supabase (collecte partagée) |
| `styles.css` | Mise en page mobile d'abord, charte Procivis 2025 |
| `config.js` | **Seul fichier à modifier pour brancher Supabase ou changer de session** |
| `referentiel.json` | Univers, mesures de maîtrise, risques, liens entre les deux, échelles. Modifiable sans toucher au code |
| `societes.json` | Listes déroulantes : sociétés du réseau et fonctions |
| `supabase/schema.sql` | Schéma complet pour un projet Supabase neuf |
| `supabase/securite.sql` | Protection de la lecture des réponses sur le projet existant (clé d'accès vérifiée côté base) |
| `supabase/reinitialisation.sql` | Lecture allégée, bouton « Réinitialiser la session » et export complet pour la sauvegarde (à exécuter une fois) |
| `.github/workflows/sauvegarde.yml`, `.github/scripts/sauvegarde.py` | Sauvegarde automatique de toutes les réponses sur le Drive Leviia |
| `supabase/nettoyage.sql` | Remise à zéro des réponses avant la collecte |
| `qr.html` | Génération du QR code pour la slide |
| `.github/workflows/keepalive.yml` | Maintient le projet Supabase gratuit actif |

## Parcours

- `#/` accueil et identification (société, fonction, prénom facultatif, périmètre)
- `#/univers` liste des univers avec progression et état d'envoi
- `#/u/GOV` saisie d'un univers : partie 1 « Maîtrise des risques », descriptive (les mesures se lisent, elles ne se cotent plus depuis le 14 octobre 2026), partie 2 « Cotation des risques » (probabilité, impact, traitement) suivie du champ « Proposer une mesure de maîtrise »
- `#/aide` échelles de cotation, repères de lecture et cadre juridique
- `#/resultats` page animateur, protégée par une clé d'accès : filtres, indicateurs, exposition par univers, matrice, top 10, divergences, mesures proposées par les participants, exports, bouton « Réinitialiser la session ». Deux onglets dans l'en-tête, « Formulaire » et « Résultats », permettent de basculer à tout moment ; la clé n'est demandée qu'une fois par onglet de navigation.

Sur l'accueil, « Effacer ce rapport de cet appareil » repart avec un rapport neuf (les réponses déjà envoyées restent dans la base).

## Envoi en direct

Chaque cotation est envoyée trois secondes après la dernière modification, sans attendre le bouton « Enregistrer » (qui reste là pour rassurer et forcer l'envoi). Un changement de page ou la mise en veille du téléphone déclenche l'envoi immédiat. Chaque envoi est une ligne complète de l'univers ; la page de résultats retient la dernière ligne par participant et univers. Un envoi qui échoue est gardé sur l'appareil (une ligne par univers) et repart dès que la connexion revient. La page de résultats se recompile toutes les quinze secondes (`rafraichissement` dans config.js) : elle affiche la synthèse dès la première cotation, même si deux risques seulement sont cotés.

Comme un participant produit plusieurs lignes par univers, `supabase/reinitialisation.sql` redéfinit `lire_reponses` pour ne renvoyer que la dernière ligne de chacun : la lecture reste légère quel que soit le nombre d'envois.

## Réinitialiser la session et sauvegarder

Dans l'onglet Résultats (clé saisie), le bouton **Réinitialiser la session** demande une confirmation, télécharge une sauvegarde CSV de toutes les réponses, puis appelle la fonction `reinitialiser_session` : les lignes de la session sont renommées `session-archive-AAAA-MM-JJ-HHhMM`. La page repart vide, rien n'est supprimé, l'archive reste consultable avec `?s=nom-de-l-archive` dans l'adresse des résultats. Il faut avoir exécuté une fois `supabase/reinitialisation.sql` ; sinon le bouton l'indique.

La **sauvegarde automatique** (`.github/workflows/sauvegarde.yml`) lit toutes les réponses, archives comprises, et les dépose sur le Drive Leviia dans `Cartographie des risques/<date> <session>/` : `reponses.csv` (dernière réponse par participant et univers, format long) et `reponses-brutes.json` (toutes les lignes), plus `derniere-sauvegarde.txt`. Elle tourne toutes les six heures, toutes les dix minutes le 20 octobre 2026 entre 7 h et 19 h, et à la demande depuis l'onglet Actions du dépôt. Secrets du dépôt : `RESULTATS_CLE`, `LEVIIA_URL`, `LEVIIA_USER`, `LEVIIA_TOKEN` (mot de passe d'application Leviia, révocable depuis cloud.leviia.com). Tant que `lire_toutes_reponses` n'est pas installée, seule la session courante est sauvegardée.

## Référentiel (version 6, 14 octobre 2026)

- **Nomenclature.** Les mesures de maîtrise s'appellent `CODE-M1`, `CODE-M2`... et les risques `CODE-R1`, `CODE-R2`..., numérotés sans trou dans l'ordre d'affichage de chaque chapitre (`CODE` est le code du chapitre, par exemple `GOV`). Un identifiant supprimé n'est jamais réutilisé. Une fois la collecte ouverte, plus aucune renumérotation : les réponses sont enregistrées avec ces identifiants.
- **Liens.** Chaque risque porte la liste `mesures` des identifiants qui le réduisent, parfois dans un autre chapitre. L'application en déduit, pour chaque mesure, les risques qu'elle couvre, et affiche les deux sous chaque item. Un risque sans mesure et une mesure sans risque sont signalés en rouge à la saisie.
- **Risques subis.** `"subi": true` marque un événement extérieur sans mesure de prévention (évolution législative, aides, énergie, crédit...). Il s'affiche avec une pastille « Risque subi » et reste coté comme les autres.
- **Mesures de maîtrise.** Depuis le 14 octobre 2026, les mesures (`CODE-M`) sont affichées en tête de chapitre à titre descriptif, avec les risques qu'elles couvrent, et ne se cotent plus. Le champ `maitrise` de la table n'est plus alimenté, hors la clé `_ajouts`.
- **Mesures proposées.** Au bas de la partie 2 de chaque chapitre, un participant peut proposer jusqu'à cinq mesures de maîtrise manquantes (texte seul, sans cotation). Elles voyagent dans le champ `maitrise` sous la clé `_ajouts` (liste `{id, texte}`, identifiants `GOV-X1`, `GOV-X2`...) et ressortent telles quelles dans les résultats et l'export des réponses.
- Le champ `remarques` de la table n'est plus alimenté depuis la version 4.

Pour modifier le référentiel : éditer `referentiel.json`. Chaque univers comporte un `code`, un `nom`, un `court`, un `bloc` (`soc` ou `met`), des `metiers` (vide = toujours proposé), une `reference`, une `intro`, des `questions` (`id`, `texte`, `texte_reseau` facultatif) et des `risques` (`id`, `libelle`, `mesures`, `subi` facultatif). Mettre à jour `version` à chaque évolution ; ne plus renuméroter après l'ouverture de la collecte. La correspondance des identifiants entre la v4 et la v5 est conservée hors du dépôt (dossier `arbitrages-2026-10-13`), celle de la v5 vers la v6 dans `arbitrages-2026-10-14` (seul le chapitre MOA bouge : MOA-R6 fusionné dans MOA-R2, MOA-R7 devenu MOA-R6). La v6 est la dernière renumérotation avant la collecte.

## Brancher Supabase

1. Créer un projet Supabase (région Europe). Dans l'éditeur SQL, exécuter `supabase/schema.sql` après avoir remplacé la clé d'accès des résultats (`REMPLACER-PAR-LA-CLE-CHOISIE`).
2. Dans `config.js`, renseigner `supabaseUrl` (Project URL) et `supabaseAnonKey` (clé « publishable »).
3. Dans le dépôt GitHub, ajouter les secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` pour le keep-alive.

Sur le projet déjà en service (créé avec l'ancien schéma), exécuter seulement `supabase/securite.sql`, clé remplacée, puis `supabase/reinitialisation.sql`.

## Accès aux résultats et sécurité

La clé « publishable » est publique par conception : elle permet d'ajouter une réponse, rien d'autre. Elle ne peut ni lire, ni modifier, ni supprimer les réponses. La page de résultats appelle la fonction `lire_reponses(session, clé)`, qui vérifie la clé d'accès enregistrée dans la table `parametres` (hors du dépôt) et renvoie les lignes de la session ; une clé fausse renvoie une erreur et ralentit les essais. L'animateur saisit la clé à l'écran, ou l'ajoute une fois à l'adresse (`.../#/resultats?cle=...`) ; elle reste mémorisée le temps de la session de navigation.

Tant que `securite.sql` n'a pas été exécuté, la page de résultats se replie sur la lecture directe de la table et affiche un bandeau « Lecture non protégée ».

## Repartir de zéro avant de partager le lien

Les réponses ne sont pas dans le dépôt mais dans Supabase. Le plus simple est le bouton « Réinitialiser la session » de l'onglet Résultats (voir plus haut). Deux autres façons :

1. **Sans rien supprimer** : changer `session` dans `config.js` et pousser. La page ne lit que la session courante (c'est ce qui a été fait le 13 octobre avec la v5 et le 14 octobre avec la v6). Les anciennes réponses restent consultables en ajoutant `?s=ancienne-session` à l'adresse, avec la clé.
2. **En supprimant** : exécuter `supabase/nettoyage.sql` dans l'éditeur SQL de Supabase (un `select` de contrôle, puis le `delete`). La clé publique de la page ne peut pas supprimer, c'est voulu.

## Test en local

```bash
python3 -m http.server 8765 --directory carto-risques
```

puis ouvrir http://127.0.0.1:8765/ . Ajouter `?s=test-connexion` pour écrire dans une session de test plutôt que dans celle du séminaire. Sans Supabase configuré, l'application fonctionne en mode local : les réponses restent dans le navigateur et la page de résultats n'affiche que celles de l'appareil, sans clé.

## Publier sur GitHub Pages

Déposer le contenu du dossier dans un dépôt, puis Settings > Pages > Deploy from a branch (`main`, dossier `/`). L'URL publique sert à générer le QR code (`qr.html`). Les mises à jour se font en poussant sur `main`.
