-- Remise à zéro des réponses avant le séminaire du 20 octobre 2026.
-- À exécuter dans l'éditeur SQL de Supabase (la clé publique de la page ne peut pas supprimer).
--
-- Depuis le référentiel v6 (14 octobre), la page lit la session « seminaire-administrateurs-2026-10-20-v6 » :
-- les réponses des sessions précédentes (atelier du 12 octobre, tests de connexion, v4) ne sont déjà plus
-- affichées. Ce script les supprime pour de bon, et vide aussi les éventuels essais faits sur la session v6.

-- 1. Voir ce qui serait supprimé
select session, participant_id, prenom, societe, univers, version_ref, created_at
from public.reponses
order by created_at;

-- 2. Supprimer toutes les réponses antérieures à l'ouverture de la collecte
delete from public.reponses
where session <> 'seminaire-administrateurs-2026-10-20-v6'
   or version_ref is distinct from '2026-10-14-v6-reponses-guillaume'
   or created_at < '2026-10-20 06:00:00+02';

-- 3. Contrôle : la table doit être vide
select count(*) from public.reponses;

-- Variante sans rien supprimer : changer la valeur de « session » dans config.js
-- (par exemple seminaire-administrateurs-2026-10-20-v6) et pousser. La page ne lit que la session courante ;
-- les anciennes réponses restent consultables en ajoutant ?s=ancienne-session à l'adresse, avec la clé.
