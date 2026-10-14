-- Cartographie des risques Procivis : lecture allégée pour l'envoi en direct (14 octobre 2026).
-- Facultatif mais recommandé. À exécuter une fois dans l'éditeur SQL du projet Supabase, après securite.sql.
--
-- Depuis le 14 octobre, chaque cotation part en direct : un participant produit plusieurs lignes par univers
-- (une par envoi), et seule la dernière compte. La page de résultats fait déjà ce tri dans le navigateur,
-- mais elle relit toute la table toutes les 15 secondes. Cette version de lire_reponses ne renvoie que la
-- dernière ligne de chaque participant pour chaque univers : la lecture reste légère quel que soit le nombre
-- d'envois (au plus participants × univers lignes), ce qui ménage le quota de sortie du projet gratuit.
--
-- Même signature, même contrôle de clé : rien à changer dans la page.

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
    select distinct on (participant_id, univers) *
    from public.reponses
    where session = p_session
    order by participant_id, univers, created_at desc;
end;
$$;

revoke all on function public.lire_reponses(text, text) from public;
grant execute on function public.lire_reponses(text, text) to anon;

-- Contrôle : le second nombre doit être inférieur ou égal au premier
-- select count(*) from public.reponses where session = 'seminaire-administrateurs-2026-10-20-v6';
-- select count(*) from public.lire_reponses('seminaire-administrateurs-2026-10-20-v6', 'LA-CLE-CHOISIE');
