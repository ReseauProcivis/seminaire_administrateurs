# Cartographie des risques du réseau Procivis

Application web statique (HTML, CSS, JavaScript sans dépendance) destinée à être hébergée sur GitHub Pages. Les administrateurs flashent un QR code, s'identifient en quelques secondes, évaluent la maîtrise des risques et cotent les risques univers par univers. Une page de résultats agrège les réponses en direct pour l'animation.

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
| `supabase/nettoyage.sql` | Remise à zéro des réponses avant la collecte |
| `qr.html` | Génération du QR code pour la slide |
| `.github/workflows/keepalive.yml` | Maintient le projet Supabase gratuit actif |

## Parcours

- `#/` accueil et identification (société, fonction, prénom facultatif, périmètre)
- `#/univers` liste des univers avec progression et état d'envoi
- `#/u/GOV` saisie d'un univers : partie 1 « Maîtrise des risques », partie 2 « Cotation des risques » (probabilité, impact, traitement) suivie du champ « Ajouter une question »
- `#/aide` échelles de cotation, repères de lecture et cadre juridique
- `#/resultats` page animateur, protégée par une clé d'accès : filtres, indicateurs, matrice, top 10, divergences, questions ajoutées par les participants (avec leur réponse), exports

Chaque univers est enregistré séparément : une réponse partielle compte. Les réponses sont aussi conservées sur l'appareil, ce qui permet de reprendre plus tard et de renvoyer automatiquement ce qui n'a pas pu partir.

## Référentiel (version 5, 13 octobre 2026)

- **Nomenclature.** Les mesures de maîtrise s'appellent `CODE-M1`, `CODE-M2`... et les risques `CODE-R1`, `CODE-R2`..., numérotés sans trou dans l'ordre d'affichage de chaque chapitre (`CODE` est le code du chapitre, par exemple `GOV`). Un identifiant supprimé n'est jamais réutilisé. Une fois la collecte ouverte, plus aucune renumérotation : les réponses sont enregistrées avec ces identifiants.
- **Liens.** Chaque risque porte la liste `mesures` des identifiants qui le réduisent, parfois dans un autre chapitre. L'application en déduit, pour chaque mesure, les risques qu'elle couvre, et affiche les deux sous chaque item. Un risque sans mesure et une mesure sans risque sont signalés en rouge à la saisie.
- **Risques subis.** `"subi": true` marque un événement extérieur sans mesure de prévention (évolution législative, aides, énergie, crédit...). Il s'affiche avec une pastille « Risque subi » et reste coté comme les autres.
- **Questions ajoutées.** Au bas de la partie 2 de chaque chapitre, un participant peut ajouter jusqu'à cinq questions de maîtrise, cotées comme les autres. Elles voyagent dans le champ `maitrise` sous la clé `_ajouts` (liste `{id, texte, v}`, identifiants `GOV-X1`, `GOV-X2`...), n'entrent pas dans la moyenne du chapitre et ressortent à part dans les résultats et les exports.
- Le champ `remarques` de la table n'est plus alimenté depuis la version 4.

Pour modifier le référentiel : éditer `referentiel.json`. Chaque univers comporte un `code`, un `nom`, un `court`, un `bloc` (`soc` ou `met`), des `metiers` (vide = toujours proposé), une `reference`, une `intro`, des `questions` (`id`, `texte`, `texte_reseau` facultatif) et des `risques` (`id`, `libelle`, `mesures`, `subi` facultatif). Mettre à jour `version` à chaque évolution ; ne plus renuméroter après l'ouverture de la collecte. La correspondance des identifiants entre la v4 et la v5 est conservée hors du dépôt (dossier `arbitrages-2026-10-13`).

## Brancher Supabase

1. Créer un projet Supabase (région Europe). Dans l'éditeur SQL, exécuter `supabase/schema.sql` après avoir remplacé la clé d'accès des résultats (`REMPLACER-PAR-LA-CLE-CHOISIE`).
2. Dans `config.js`, renseigner `supabaseUrl` (Project URL) et `supabaseAnonKey` (clé « publishable »).
3. Dans le dépôt GitHub, ajouter les secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` pour le keep-alive.

Sur le projet déjà en service (créé avec l'ancien schéma), exécuter seulement `supabase/securite.sql`, clé remplacée.

## Accès aux résultats et sécurité

La clé « publishable » est publique par conception : elle permet d'ajouter une réponse, rien d'autre. Elle ne peut ni lire, ni modifier, ni supprimer les réponses. La page de résultats appelle la fonction `lire_reponses(session, clé)`, qui vérifie la clé d'accès enregistrée dans la table `parametres` (hors du dépôt) et renvoie les lignes de la session ; une clé fausse renvoie une erreur et ralentit les essais. L'animateur saisit la clé à l'écran, ou l'ajoute une fois à l'adresse (`.../#/resultats?cle=...`) ; elle reste mémorisée le temps de la session de navigation.

Tant que `securite.sql` n'a pas été exécuté, la page de résultats se replie sur la lecture directe de la table et affiche un bandeau « Lecture non protégée ».

## Repartir de zéro avant de partager le lien

Les réponses ne sont pas dans le dépôt mais dans Supabase. Deux façons de nettoyer :

1. **Sans rien supprimer** : changer `session` dans `config.js` et pousser. La page ne lit que la session courante (c'est ce qui a été fait le 13 octobre avec la v5). Les anciennes réponses restent consultables en ajoutant `?s=ancienne-session` à l'adresse, avec la clé.
2. **En supprimant** : exécuter `supabase/nettoyage.sql` dans l'éditeur SQL de Supabase (un `select` de contrôle, puis le `delete`). La clé publique de la page ne peut pas supprimer, c'est voulu.

## Test en local

```bash
python3 -m http.server 8765 --directory carto-risques
```

puis ouvrir http://127.0.0.1:8765/ . Ajouter `?s=test-connexion` pour écrire dans une session de test plutôt que dans celle du séminaire. Sans Supabase configuré, l'application fonctionne en mode local : les réponses restent dans le navigateur et la page de résultats n'affiche que celles de l'appareil, sans clé.

## Publier sur GitHub Pages

Déposer le contenu du dossier dans un dépôt, puis Settings > Pages > Deploy from a branch (`main`, dossier `/`). L'URL publique sert à générer le QR code (`qr.html`). Les mises à jour se font en poussant sur `main`.
