/* Configuration de la cartographie des risques Procivis.
   Ce fichier est le seul à modifier pour brancher Supabase ou changer de session.
   Laisser supabaseUrl vide => mode local (les réponses restent sur l'appareil). */
window.CARTO_CONFIG = {
  // Identifiant technique de la session de collecte (sert à regrouper les réponses).
  // Changé le 13 octobre 2026 avec le référentiel v5, puis le 14 octobre avec la v6 (dernière renumérotation,
  // chapitre MOA) : les réponses de test des sessions précédentes ne sont plus lues (remise à zéro),
  // elles restent purgeables avec supabase/nettoyage.sql.
  session: "seminaire-administrateurs-2026-10-20-v6",
  // Libellé affiché sur la page d'accueil
  sessionLabel: "Séminaire des administrateurs - 20 octobre 2026",
  // Supabase : URL du projet et clé publique (« publishable », conçue pour être exposée dans le navigateur).
  // Cette clé permet d'ajouter une réponse, pas de lire les réponses : la lecture passe par la fonction
  // lire_reponses, qui vérifie la clé d'accès des résultats côté base (supabase/securite.sql).
  supabaseUrl: "https://ucfnfvpojvcjucspkrct.supabase.co",
  supabaseAnonKey: "sb_publishable_iuwGATVzwLIrf0WgihMZmA_z1jzmkXj",
  // La clé d'accès à la page de résultats n'est pas dans ce fichier : elle est enregistrée dans Supabase
  // (table parametres) et saisie à l'écran par l'animateur, ou passée une fois dans l'adresse (?cle=...).
  // Seuil d'appétence par défaut sur la page de résultats (4, 6 ou 9)
  seuilDefaut: 6,
  // Délai de rafraîchissement automatique des résultats, en secondes
  rafraichissement: 20
};
