-- Cartographie des risques Procivis : protection de la lecture des réponses (13 octobre 2026).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase, AVANT l'ouverture de la collecte.
-- Remplacer d'abord REMPLACER-PAR-LA-CLE-CHOISIE par la clé d'accès de l'animateur (20 caractères
-- ou plus, sans espace). Ne jamais déposer ce fichier rempli dans le dépôt GitHub, qui est public.
--
-- Avant : la clé publique du navigateur pouvait lire toute la table « reponses » (règle « lecture publique »),
-- et la page de résultats n'était protégée que par une clé vide, dans config.js.
-- Après : la clé publique ne peut qu'ajouter des réponses. La page de résultats appelle la fonction
-- lire_reponses(session, clé), qui compare la clé à celle enregistrée ici et renvoie les lignes
-- de la session, ou l'erreur « cle_invalide ».

-- 1. Table des paramètres : la clé des résultats y vit, hors du dépôt. Sans règle d'accès,
--    la clé publique ne peut ni la lire ni l'écrire.
create table if not exists public.parametres (
  nom text primary key,
  valeur text not null
);
alter table public.parametres enable row level security;
revoke all on public.parametres from anon, authenticated;

insert into public.parametres (nom, valeur) values ('cle_resultats', 'REMPLACER-PAR-LA-CLE-CHOISIE')
  on conflict (nom) do update set valeur = excluded.valeur;

-- 2. Fin de la lecture publique de la table et de la vue
drop policy if exists "lecture publique" on public.reponses;
revoke select on public.reponses_dernieres from anon;

-- 3. Fonction de lecture protégée (s'exécute avec les droits de son propriétaire, pas ceux de l'appelant)
create or replace function public.lire_reponses(p_session text, p_cle text)
returns setof public.reponses
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cle is null or p_cle = ''
     or not exists (select 1 from public.parametres where nom = 'cle_resultats' and valeur = p_cle) then
    perform pg_sleep(0.5);  -- ralentit les essais en rafale
    raise exception 'cle_invalide' using errcode = 'P0001';
  end if;
  return query
    select * from public.reponses
    where session = p_session
    order by created_at asc;
end;
$$;

revoke all on function public.lire_reponses(text, text) from public;
grant execute on function public.lire_reponses(text, text) to anon;

-- 4. Contrôle : la première requête doit échouer, la seconde renvoyer les lignes de la session
-- select * from public.lire_reponses('seminaire-administrateurs-2026-10-20-v5', 'mauvaise-cle');
-- select count(*) from public.lire_reponses('seminaire-administrateurs-2026-10-20-v5', 'REMPLACER-PAR-LA-CLE-CHOISIE');

-- Pour changer la clé plus tard :
-- update public.parametres set valeur = 'NOUVELLE-CLE' where nom = 'cle_resultats';
