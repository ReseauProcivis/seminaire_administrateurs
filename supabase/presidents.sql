-- Cartographie des risques : base du séminaire des présidents du 24 novembre 2026.
-- Projet Supabase à part (« carto-presidents »), créé le 23 novembre 2026 parce que la base du réseau était
-- bloquée (quota de données sortantes dépassé). À exécuter une fois dans l'éditeur SQL d'un projet neuf.
-- Ce fichier ne contient aucune clé : la clé d'accès des résultats se pose ensuite, une seule fois, par la
-- fonction definir_cle_initiale (voir la fin du fichier).

-- 1. Les réponses : une ligne par envoi, l'agrégation retient la dernière par participant et univers
create table if not exists public.reponses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session text not null,
  participant_id text not null,
  prenom text,
  societe text,
  fonction text,
  perimetre text,
  metiers jsonb,
  univers text not null,
  maitrise jsonb not null default '{}'::jsonb,
  cotation jsonb not null default '{}'::jsonb,
  remarques text,
  version_ref text,
  constraint reponses_univers_len check (char_length(univers) <= 12),
  constraint reponses_remarques_len check (remarques is null or char_length(remarques) <= 4000),
  constraint reponses_prenom_len check (prenom is null or char_length(prenom) <= 80),
  constraint reponses_societe_len check (societe is null or char_length(societe) <= 120),
  constraint reponses_session_len check (char_length(session) <= 120),
  constraint reponses_participant_len check (char_length(participant_id) <= 80)
);
create index if not exists reponses_session_univers_idx on public.reponses (session, univers);
create index if not exists reponses_session_participant_idx on public.reponses (session, participant_id);

-- La clé publique du navigateur peut ajouter une réponse, rien d'autre : ni lecture, ni modification, ni suppression
alter table public.reponses enable row level security;
revoke all on public.reponses from anon, authenticated;
grant usage on schema public to anon;
grant insert on public.reponses to anon;
drop policy if exists "insertion publique" on public.reponses;
create policy "insertion publique" on public.reponses
  for insert to anon with check (true);

-- 2. Paramètres (clé d'accès des résultats, date de la dernière remise à zéro) : fermés à la clé publique
create table if not exists public.parametres (
  nom text primary key,
  valeur text not null
);
alter table public.parametres enable row level security;
revoke all on public.parametres from anon, authenticated;

-- 3. Vérification de la clé d'accès, réservée aux fonctions ci-dessous
create or replace function public.cle_valide(p_cle text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_cle is not null and p_cle <> ''
     and exists (select 1 from public.parametres where nom = 'cle_resultats' and valeur = p_cle);
$$;
revoke all on function public.cle_valide(text) from public, anon, authenticated;

-- 4. Lecture des résultats : dernière ligne par participant et univers
create or replace function public.lire_reponses(p_session text, p_cle text)
returns setof public.reponses
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.cle_valide(p_cle) then
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

-- 5. Remise à zéro : les lignes de la session sont renommées (archive), rien n'est supprimé ;
--    la date de la remise est notée pour vider à distance les formulaires ouverts
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
  if not public.cle_valide(p_cle) then
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

-- 6. Export complet pour la sauvegarde automatique
create or replace function public.lire_toutes_reponses(p_cle text)
returns setof public.reponses
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.cle_valide(p_cle) then
    perform pg_sleep(0.5);
    raise exception 'cle_invalide' using errcode = 'P0001';
  end if;
  return query select * from public.reponses order by session, created_at asc;
end;
$$;
revoke all on function public.lire_toutes_reponses(text) from public;
grant execute on function public.lire_toutes_reponses(text) to anon;

-- 7. Pose de la clé d'accès des résultats, une seule fois : la fonction ne fait plus rien dès qu'une clé existe.
--    Appel : POST /rest/v1/rpc/definir_cle_initiale {"p_cle": "..."} ; renvoie true si la clé a été posée.
--    Pour changer la clé ensuite : update public.parametres set valeur = '...' where nom = 'cle_resultats';
create or replace function public.definir_cle_initiale(p_cle text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cle is null or char_length(p_cle) < 10 or char_length(p_cle) > 100 then
    return false;
  end if;
  if exists (select 1 from public.parametres where nom = 'cle_resultats') then
    return false;
  end if;
  insert into public.parametres (nom, valeur) values ('cle_resultats', p_cle);
  return true;
end;
$$;
revoke all on function public.definir_cle_initiale(text) from public;
grant execute on function public.definir_cle_initiale(text) to anon;

-- 8. L'API relit la liste des tables et des fonctions
notify pgrst, 'reload schema';

select 'base des présidents prête' as etat;
