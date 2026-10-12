-- Nettoyage des réponses de test avant de repartager le lien.
-- À exécuter dans l'éditeur SQL de Supabase (la clé publique de la page ne peut pas supprimer).

-- 1. Voir ce qui serait supprimé
select participant_id, prenom, univers, created_at
from public.reponses
where participant_id in ('equipe-marches-2026-10-12', 'equipe-fonctions-support-2026-10-12')
   or session = 'test-connexion'
order by created_at;

-- 2. Supprimer les deux groupes de l'atelier du 12 octobre et la session de test
delete from public.reponses
where participant_id in ('equipe-marches-2026-10-12', 'equipe-fonctions-support-2026-10-12')
   or session = 'test-connexion';

-- Variante sans rien supprimer : changer la valeur de « session » dans config.js
-- (par exemple seminaire-administrateurs-2026-10-20-v2). La page ne lit que la session courante ;
-- les anciennes réponses restent consultables en ajoutant ?s=ancienne-session à l'adresse.
