# Cartographie des risques du réseau Procivis

Application web statique (HTML, CSS, JavaScript sans dépendance) destinée à être hébergée sur GitHub Pages. Les administrateurs flashent un QR code, s'identifient en quelques secondes, évaluent la maîtrise du dispositif et cotent les risques univers par univers. Une page de résultats agrège les réponses en direct pour l'animation.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique (accueil, liste des univers, saisie, aide, résultats) |
| `app.js` | Logique de l'application, agrégation, exports CSV |
| `store.js` | Stockage des réponses : local (tests) ou Supabase (collecte partagée) |
| `styles.css` | Mise en page mobile d'abord, charte Procivis 2025 |
| `config.js` | **Seul fichier à modifier pour brancher Supabase ou changer de session** |
| `referentiel.json` | Univers, questions de maîtrise, risques, échelles. Modifiable sans toucher au code |
| `societes.json` | Listes déroulantes : sociétés du réseau et fonctions |
| `supabase/schema.sql` | Table, index et règles d'accès à exécuter une fois dans Supabase |
| `.github/workflows/keepalive.yml` | Maintient le projet Supabase gratuit actif |

## Parcours

- `#/` accueil et identification (société, fonction, prénom facultatif, périmètre)
- `#/univers` liste des univers avec progression et état d'envoi
- `#/u/GOV` saisie d'un univers : maîtrise, cotation (probabilité, impact, traitement), remarques
- `#/aide` échelles de cotation et cadre juridique
- `#/resultats` page animateur : filtres, indicateurs, matrice, top 10, divergences, remarques, exports

Chaque univers est enregistré séparément : une réponse partielle compte. Les réponses sont aussi conservées sur l'appareil, ce qui permet de reprendre plus tard et de renvoyer automatiquement ce qui n'a pas pu partir.

## Brancher Supabase

1. Créer un projet Supabase (région Europe). Dans l'éditeur SQL, exécuter `supabase/schema.sql`.
2. Dans `config.js`, renseigner `supabaseUrl` (Project URL) et `supabaseAnonKey` (clé « anon public »).
3. Facultatif : définir `resultatsCle` pour réserver la page de résultats à l'animation. L'URL devient alors `.../#/resultats?cle=...` ou la clé est saisie à l'écran.
4. Dans le dépôt GitHub, ajouter les secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` pour le keep-alive.

La clé « anon » est publique par conception. Les règles d'accès (RLS) n'autorisent que l'ajout et la lecture de réponses, jamais la modification ou la suppression. L'agrégation retient la dernière réponse de chaque participant pour chaque univers.

## Repartir de zéro avant de partager le lien

Les réponses ne sont pas dans le dépôt mais dans Supabase. Deux façons de nettoyer :

1. **Sans rien supprimer** : changer `session` dans `config.js` (par exemple `seminaire-administrateurs-2026-10-20-v2`) et pousser. La page ne lit que la session courante. Les anciennes réponses restent consultables en ajoutant `?s=ancienne-session` à l'adresse.
2. **En supprimant** : exécuter `supabase/nettoyage.sql` dans l'éditeur SQL de Supabase (le fichier contient d'abord un `select` de contrôle, puis le `delete`). La clé publique de la page ne peut pas supprimer, c'est voulu.

## Modifier le référentiel

Éditer `referentiel.json`. Chaque univers comporte un `code` (ex. `GOV`), un `nom`, un `court`, un `bloc` (`soc` ou `met`), des `metiers` (vide = toujours proposé), une `reference`, une `intro`, des `questions` (`id`, `texte`, `texte_reseau` facultatif) et des `risques` (`id`, `libelle`). Conserver les identifiants existants pour garder la continuité des réponses déjà collectées ; mettre à jour `version` pour tracer l'évolution.

## Test en local

```bash
python3 -m http.server 8765 --directory carto-risques
```

puis ouvrir http://127.0.0.1:8765/ . Sans Supabase configuré, l'application fonctionne en mode local : les réponses restent dans le navigateur et la page de résultats n'affiche que celles de l'appareil.

## Publier sur GitHub Pages

Déposer le contenu du dossier dans un dépôt, puis Settings > Pages > Deploy from a branch (`main`, dossier `/`). L'URL publique sert à générer le QR code. Les mises à jour se font en poussant sur `main`.
