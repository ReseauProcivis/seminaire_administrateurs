-- Cartographie des risques Procivis : schéma Supabase complet (état du 13 octobre 2026).
-- À exécuter dans l'éditeur SQL d'un projet neuf. Sur le projet existant, exécuter seulement
-- supabase/securite.sql (qui ajoute la table parametres et la fonction de lecture protégée).

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
  maitrise jsonb not null default '{}'::jsonb,   -- depuis le 14 octobre 2026, seule la clé _ajouts est alimentée : mesures proposées par le participant (liste {id, texte}) ; les mesures de maîtrise ne se cotent plus
  cotation jsonb not null default '{}'::jsonb,   -- cotations par risque (CODE-R1...) : {p, i, t}. Une ligne par envoi (envoi en direct) : l'agrégation retient la dernière par participant et univers
  remarques text,                                -- plus alimenté depuis le référentiel v4 (13 octobre 2026)
  version_ref text,
  -- garde-fous simples contre les charges aberrantes
  constraint reponses_univers_len check (char_length(univers) <= 12),
  constraint reponses_remarques_len check (remarques is null or char_length(remarques) <= 4000),
  constraint reponses_prenom_len check (prenom is null or char_length(prenom) <= 80),
  constraint reponses_societe_len check (societe is null or char_length(societe) <= 120)
);

create index if not exists reponses_session_univers_idx on public.reponses (session, univers);
create index if not exists reponses_session_participant_idx on public.reponses (session, participant_id);

alter table public.reponses enable row level security;

-- La clé publique « anon » peut ajouter une réponse, rien d'autre : ni lecture directe, ni modification,
-- ni suppression (l'agrégation retient la dernière réponse par participant et univers).
drop policy if exists "insertion publique" on public.reponses;
create policy "insertion publique" on public.reponses
  for insert to anon with check (true);
drop policy if exists "lecture publique" on public.reponses;

-- Vue de confort pour l'export depuis le tableau de bord Supabase : une ligne par participant et univers
create or replace view public.reponses_dernieres as
select distinct on (session, participant_id, univers) *
from public.reponses
order by session, participant_id, univers, created_at desc;
revoke select on public.reponses_dernieres from anon;

-- Lecture protégée par clé : table parametres + fonction lire_reponses
create table if not exists public.parametres (
  nom text primary key,
  valeur text not null
);
alter table public.parametres enable row level security;
revoke all on public.parametres from anon, authenticated;
insert into public.parametres (nom, valeur) values ('cle_resultats', 'REMPLACER-PAR-LA-CLE-CHOISIE')
  on conflict (nom) do nothing;

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
    select * from public.reponses
    where session = p_session
    order by created_at asc;
end;
$$;
revoke all on function public.lire_reponses(text, text) from public;
grant execute on function public.lire_reponses(text, text) to anon;
