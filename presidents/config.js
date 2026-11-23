/* Cartographie des risques : page du séminaire des présidents de SACICAP du 24 novembre 2026.
   Même exercice qu'au séminaire des administrateurs du 20 octobre (trois groupes, cotation des risques,
   résultats compilés en direct), dans une session à part et sur le référentiel v7 revu par Guillaume Macher
   après le séminaire (referentiel.json de ce dossier). Le script, le stockage et la feuille de style sont
   ceux du dossier parent.
   Base : projet Supabase « carto-presidents » (compte personnel de Maxime Taillebois), créé le 23 novembre 2026
   parce que la base du réseau était bloquée (quota de données sortantes dépassé). Schéma : supabase/presidents.sql.
   La clé d'accès des résultats est la même que celle de la page principale. */
window.CARTO_CONFIG = {
  session: "seminaire-presidents-2026-11-24",
  sessionLabel: "Séminaire des présidents - 24 novembre 2026",
  // Public nommé sur la page d'accueil
  seminaire: "séminaire des présidents",
  // Rangement à part dans le navigateur : les rapports de ce séminaire ne se mêlent pas à ceux du 20 octobre
  stockage: "presidents",
  supabaseUrl: "https://gqviwrubyqfmiuswyabu.supabase.co",
  supabaseAnonKey: "sb_publishable_SkaLkWZS6sAWtCGW-web8g_26MDs8zv",
  seuilDefaut: 6,
  rafraichissement: 15
};
