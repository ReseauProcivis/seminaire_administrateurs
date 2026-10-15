-- Cartographie des risques Procivis : remise à zéro depuis la page et sauvegarde automatique (15 octobre 2026).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase, après securite.sql. Remplace direct.sql.
-- Rien à remplacer dans ce fichier : la clé d'accès reste celle de la table parametres.
--
-- Trois fonctions, toutes protégées par la clé d'accès des résultats :
--   1. lire_reponses(session, clé)        lecture allégée : dernière ligne par participant et univers
--   2. reinitialiser_session(session, clé) le bouton « Réinitialiser la session » de l'onglet Résultats :
--                                          les réponses de la session sont ARCHIVÉES (renommées), jamais effacées
--   3. lire_toutes_reponses(clé)           toutes les lignes, toutes sessions confondues, pour la sauvegarde
--                                          automatique vers Leviia (job GitHub .github/workflows/sauvegarde.yml)

-- 1. Lecture allégée (une ligne par envoi est enregistrée, seule la dernière compte)
create or replace function public.lire_reponses(p_session text, p_cle text)
returns setof public.reponses
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cle is null or p_cle = ''
     or not exists (select 1 from public.parametres where nom = 'cle_resultats' and valeur = p_cle) then
    perform pg_sleep(0.5);
    raise exception 'cle_invalide' using errcode = 'P0001';
  end if;
  return query
    select distinct on (participant_id, univers) *
    from public.reponses
    where session = p_session
    order by participant_id, univers, created_at desc;
end;
$$;
revoke all on function public.lire_reponses(text, text) from public;
grant execute on function public.lire_reponses(text, text) to anon;

-- 2. Réinitialisation : les lignes de la session passent sous « session-archive-AAAA-MM-JJ-HHhMM ».
--    La page repart de zéro ; l'archive reste lisible en ajoutant ?s=nom-de-l-archive à l'adresse des résultats,
--    et la sauvegarde automatique la recopie sur Leviia. Pour supprimer pour de bon : supabase/nettoyage.sql.
create or replace function public.reinitialiser_session(p_session text, p_cle text)
returns table (archive text, lignes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archive text;
  v_n integer;
begin
  if p_cle is null or p_cle = ''
     or not exists (select 1 from public.parametres where nom = 'cle_resultats' and valeur = p_cle) then
    perform pg_sleep(0.5);
    raise exception 'cle_invalide' using errcode = 'P0001';
  end if;
  if p_session is null or p_session = '' or p_session like '%-archive-%' then
    raise exception 'session_invalide' using errcode = 'P0001';
  end if;
  v_archive := p_session || '-archive-' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD-HH24"h"MI');
  update public.reponses set session = v_archive where session = p_session;
  get diagnostics v_n = row_count;
  return query select v_archive, v_n;
end;
$$;
revoke all on function public.reinitialiser_session(text, text) from public;
grant execute on function public.reinitialiser_session(text, text) to anon;

-- 3. Export complet pour la sauvegarde automatique (toutes les sessions, archives comprises)
create or replace function public.lire_toutes_reponses(p_cle text)
returns setof public.reponses
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cle is null or p_cle = ''
     or not exists (select 1 from public.parametres where nom = 'cle_resultats' and valeur = p_cle) then
    perform pg_sleep(0.5);
    raise exception 'cle_invalide' using errcode = 'P0001';
  end if;
  return query
    select * from public.reponses
    order by session, created_at asc;
end;
$$;
revoke all on function public.lire_toutes_reponses(text) from public;
grant execute on function public.lire_toutes_reponses(text) to anon;

-- Contrôles (remplacer LA-CLE par la clé d'accès) :
-- select count(*) from public.lire_reponses('seminaire-administrateurs-2026-10-20-v6', 'LA-CLE');
-- select session, count(*) from public.lire_toutes_reponses('LA-CLE') group by session order by session;
-- Essai de réinitialisation sur une session de test seulement :
-- select * from public.reinitialiser_session('test-connexion', 'LA-CLE');
