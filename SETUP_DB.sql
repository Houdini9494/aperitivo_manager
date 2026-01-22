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

-- 4. Create Policy: Only Admin or Self can update (optional for now)
create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

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
