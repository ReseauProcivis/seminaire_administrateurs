-- Cartographie des risques Procivis : schéma Supabase
-- À exécuter dans l'éditeur SQL du projet (une seule fois).

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
  maitrise jsonb not null default '{}'::jsonb,   -- réponses par question ; la clé _question porte la question libre proposée par le participant
  cotation jsonb not null default '{}'::jsonb,
  remarques text,
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

-- La clé publique « anon » peut ajouter une réponse et lire les réponses, rien d'autre
-- (ni modification ni suppression : l'agrégation retient la dernière réponse par participant et univers).
drop policy if exists "insertion publique" on public.reponses;
create policy "insertion publique" on public.reponses
  for insert to anon with check (true);

drop policy if exists "lecture publique" on public.reponses;
create policy "lecture publique" on public.reponses
  for select to anon using (true);

-- Vue de confort pour l'export : une ligne par participant et univers (dernière version)
create or replace view public.reponses_dernieres as
select distinct on (session, participant_id, univers) *
from public.reponses
order by session, participant_id, univers, created_at desc;

grant select on public.reponses_dernieres to anon;
