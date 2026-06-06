-- 1. Create a table for public profiles (linked to auth.users)
create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  primary key (id)
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. Create Policy: Public Read (needed for App to check roles)
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

-- 4. Create Policy: Only Admin or Self can update
create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

-- ⚠️ NOTA SICUREZZA: così com'è questa policy permette di cambiare anche `role`,
-- quindi un utente potrebbe auto-promuoversi admin. ESEGUI SUBITO DOPO il file
-- SECURITY_DB.sql, che la sostituisce con la versione sicura (blocco self-promotion)
-- e abilita la RLS su tables/reservations/table_status.
create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 4b. TABLES (geometria dei tavoli, condivisa fra tutti i giorni)
--     Lo stato OCCUPA/LIBERA per-giorno è in table_status (vedi SECURITY_DB.sql).
create table if not exists public.tables (
  id      text primary key,
  label   text not null default 'Tavolo',
  room_id text not null check (room_id in ('internal', 'external')),
  x       numeric not null default 0,
  y       numeric not null default 0,
  width   numeric not null default 100,
  height  numeric not null default 100,
  shape   text not null default 'square' check (shape in ('square', 'rectangle')),
  seats   integer not null default 4,
  status  text not null default 'free' check (status in ('free', 'occupied')) -- legacy, non più fonte di verità
);

-- 4c. RESERVATIONS (prenotazioni)
create table if not exists public.reservations (
  id             text primary key,
  customer_name  text not null,
  customer_phone text,
  pax            integer not null default 2,
  time           text not null,            -- 'HH:mm'
  date           text not null,            -- 'YYYY-MM-DD'
  table_ids      text[] not null default '{}',
  notes          text,
  orders         text,
  created_at     timestamptz not null default now()
);

create index if not exists reservations_date_idx on public.reservations (date);

-- 5. Trigger to automatically create a profile entry when a new user signs up
--    This ensures every user has a role (default 'staff')
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'staff');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Insert your first Admin manually (Instructions)
