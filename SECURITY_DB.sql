-- ============================================================================
-- SECURITY_DB.sql  —  Aperitivo Manager
-- Script di sicurezza/migrazione da eseguire nel SQL Editor di Supabase.
--
-- È IDEMPOTENTE: puoi rieseguirlo senza rompere nulla.
-- Esegui TUTTO il file in una volta sola.
--
-- Cosa fa:
--  1. Funzioni helper (my_role / is_admin) per i controlli ruolo nelle RLS
--  2. profiles: impedisce a un utente di auto-promuoversi admin
--  3. tables: RLS attiva, scrittura SOLO admin (lo staff non modifica il layout)
--  4. table_status: nuova tabella per lo stato OCCUPA/LIBERA PER-GIORNO
--  5. reservations: RLS attiva, dati clienti non più pubblici
--  6. cleanup automatico delle prenotazioni vecchie (lato server, non client)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS (SECURITY DEFINER per evitare ricorsione nelle policy)
-- ----------------------------------------------------------------------------

-- Ritorna il ruolo memorizzato del chiamante leggendo profiles.
-- SECURITY DEFINER => non innesca la RLS di profiles (niente ricorsione).
create or replace function public.my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false);
$$;


-- ----------------------------------------------------------------------------
-- 2. PROFILES — blocco self-promotion (item 1)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- SELECT solo per utenti AUTENTICATI: la versione precedente (using true,
-- senza "to authenticated") esponeva id utente e ruoli a chiunque avesse la
-- anon key. L'app legge profiles solo dopo il login, quindi è sicuro.
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Profiles are viewable by authenticated users." on public.profiles;
create policy "Profiles are viewable by authenticated users."
  on public.profiles for select
  to authenticated
  using ( true );

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

-- L'utente può aggiornare la PROPRIA riga ma NON cambiare il proprio role.
-- (role deve restare uguale a quello attualmente memorizzato.)
-- L'assegnazione/cambio di ruolo si fa da dashboard Supabase o da un admin.
drop policy if exists "Users can update own profile." on public.profiles;
drop policy if exists "Users can update own profile (no role change)." on public.profiles;
create policy "Users can update own profile (no role change)."
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id and role = public.my_role() );

-- Gli admin possono aggiornare qualsiasi profilo (incluso il role di altri).
drop policy if exists "Admins can update any profile." on public.profiles;
create policy "Admins can update any profile."
  on public.profiles for update
  using ( public.is_admin() )
  with check ( public.is_admin() );


-- ----------------------------------------------------------------------------
-- 3. TABLES (geometria layout) — RLS, scrittura solo admin (item 2-3)
--    Lo `status` qui NON è più la fonte di verità: vedi table_status.
-- ----------------------------------------------------------------------------
alter table public.tables enable row level security;

drop policy if exists "tables_select_authenticated" on public.tables;
create policy "tables_select_authenticated"
  on public.tables for select
  to authenticated
  using ( true );

drop policy if exists "tables_write_admin" on public.tables;
create policy "tables_write_admin"
  on public.tables for all
  to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );


-- ----------------------------------------------------------------------------
-- 4. TABLE_STATUS — stato OCCUPA/LIBERA PER-GIORNO (item 5)
--    Una riga per (tavolo, data). Assenza riga => 'free'.
--    Scrivibile da qualsiasi utente autenticato (lo staff segna i tavoli).
-- ----------------------------------------------------------------------------
create table if not exists public.table_status (
  table_id text not null,
  date     text not null,                       -- 'YYYY-MM-DD'
  status   text not null default 'free' check (status in ('free', 'occupied')),
  updated_at timestamptz not null default now(),
  primary key (table_id, date)
);

alter table public.table_status enable row level security;

drop policy if exists "table_status_select_authenticated" on public.table_status;
create policy "table_status_select_authenticated"
  on public.table_status for select
  to authenticated
  using ( true );

drop policy if exists "table_status_write_authenticated" on public.table_status;
create policy "table_status_write_authenticated"
  on public.table_status for all
  to authenticated
  using ( true )
  with check ( true );

-- Abilita gli eventi realtime sulle tabelle usate per il sync multi-tablet
-- (table_status, tables, reservations). Idempotente.
do $$
declare
  t text;
begin
  foreach t in array array['table_status', 'tables', 'reservations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 5. RESERVATIONS — RLS, dati clienti riservati agli autenticati (item 2)
-- ----------------------------------------------------------------------------
alter table public.reservations enable row level security;

drop policy if exists "reservations_select_authenticated" on public.reservations;
create policy "reservations_select_authenticated"
  on public.reservations for select
  to authenticated
  using ( true );

drop policy if exists "reservations_write_authenticated" on public.reservations;
create policy "reservations_write_authenticated"
  on public.reservations for all
  to authenticated
  using ( true )
  with check ( true );


-- ----------------------------------------------------------------------------
-- 6. CLEANUP SERVER-SIDE delle prenotazioni vecchie (item 4)
--    Sostituisce la DELETE distruttiva eseguita dal client a ogni avvio.
--    Retention: 30 giorni.
-- ----------------------------------------------------------------------------
create or replace function public.cleanup_old_reservations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.reservations
  where date < to_char((now() - interval '30 days'), 'YYYY-MM-DD');
$$;

-- Schedulazione giornaliera con pg_cron (se disponibile sul tuo piano Supabase).
-- Se l'estensione non è attivabile, puoi:
--   a) attivarla da Dashboard > Database > Extensions ("pg_cron"), poi rieseguire
--      questo blocco; oppure
--   b) chiamare manualmente, ogni tanto:  select public.cleanup_old_reservations();
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- rimuove un'eventuale schedulazione precedente con lo stesso nome
    perform cron.unschedule('cleanup_old_reservations')
      where exists (select 1 from cron.job where jobname = 'cleanup_old_reservations');
    perform cron.schedule(
      'cleanup_old_reservations',
      '0 4 * * *',                       -- ogni giorno alle 04:00
      $cron$ select public.cleanup_old_reservations(); $cron$
    );
  else
    raise notice 'pg_cron non disponibile: esegui manualmente select public.cleanup_old_reservations();';
  end if;
end $$;

-- ============================================================================
-- FINE. Dopo l'esecuzione, l'app non eseguirà più cancellazioni di massa dal
-- client: la pulizia è ora server-side e controllata.
-- ============================================================================
