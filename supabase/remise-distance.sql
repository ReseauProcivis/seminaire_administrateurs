-- Cartographie des risques Procivis : remise à zéro des formulaires à distance (19 octobre 2026).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase, après reinitialisation.sql. Rien à remplacer.
--
-- Le bouton « Remise à zéro » de l'onglet Résultats note désormais l'heure de la remise dans la table parametres
-- (ligne « remise:<session> »), même quand la session est déjà vide. Chaque formulaire la consulte toutes les
-- 5 secondes et avant chaque envoi (fonction derniere_remise, sans clé : elle ne renvoie qu'une date) : un rapport
-- commencé avant la dernière remise est effacé de l'ordinateur et le formulaire revient sur « Nouveau rapport ».
-- L'exécution de ce script compte comme une remise : les rapports de test encore ouverts sur les ordinateurs
-- s'effacent dès que la nouvelle version de la page est en ligne. Les réponses déjà dans la base ne bougent pas.

-- 1. Réinitialisation : identique à reinitialisation.sql, plus l'horodatage de la remise
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
  insert into public.parametres (nom, valeur)
    values ('remise:' || p_session, to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    on conflict (nom) do update set valeur = excluded.valeur;
  return query select v_archive, v_n;
end;
$$;
revoke all on function public.reinitialiser_session(text, text) from public;
grant execute on function public.reinitialiser_session(text, text) to anon;

-- 2. Dernière remise d'une session (lecture publique : une date ou null, rien d'autre de la table)
create or replace function public.derniere_remise(p_session text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select valeur from public.parametres where nom = 'remise:' || coalesce(p_session, '');
$$;
revoke all on function public.derniere_remise(text) from public;
grant execute on function public.derniere_remise(text) to anon;

-- 3. Remise immédiate des formulaires ouverts (rapports de test du 19 octobre)
insert into public.parametres (nom, valeur) values
  ('remise:seminaire-administrateurs-2026-10-20-v6', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
  ('remise:test-connexion', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  on conflict (nom) do update set valeur = excluded.valeur;

-- Contrôle : doit renvoyer une date
select public.derniere_remise('seminaire-administrateurs-2026-10-20-v6') as derniere_remise_seminaire;
