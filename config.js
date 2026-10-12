/* Configuration de la cartographie des risques Procivis.
   Ce fichier est le seul à modifier pour brancher Supabase ou changer de session.
   Laisser supabaseUrl vide => mode local (les réponses restent sur l'appareil). */
window.CARTO_CONFIG = {
  // Identifiant technique de la session de collecte (sert à regrouper les réponses)
  session: "seminaire-administrateurs-2026-10-20",
  // Libellé affiché sur la page d'accueil
  sessionLabel: "Séminaire des administrateurs - 20 octobre 2026",
  // Supabase : URL du projet et clé publique (« publishable », conçue pour être exposée dans le navigateur)
  supabaseUrl: "https://ucfnfvpojvcjucspkrct.supabase.co",
  supabaseAnonKey: "sb_publishable_iuwGATVzwLIrf0WgihMZmA_z1jzmkXj",
  // Clé d'accès à la page de résultats (animateur). Vide = accès libre.
  resultatsCle: "",
  // Seuil d'appétence par défaut sur la page de résultats (4, 6 ou 9)
  seuilDefaut: 6,
  // Délai de rafraîchissement automatique des résultats, en secondes
  rafraichissement: 20
};
