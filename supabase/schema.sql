-- Supabase schema for PassSabi AI
-- Run this in the Supabase SQL editor after connecting your project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  avatar_url text,
  plan text not null default 'free',
  coins integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user_updated
  on public.chat_sessions (user_id, updated_at desc);

create index if not exists idx_chat_messages_session_created
  on public.chat_messages (session_id, created_at asc);

alter table public.profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_memory enable row level security;

create policy "Users can read their profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can insert their profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update their profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "Users can read their sessions"
  on public.chat_sessions
  for select
  using (auth.uid() = user_id);

create policy "Users can create their sessions"
  on public.chat_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their sessions"
  on public.chat_sessions
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their sessions"
  on public.chat_sessions
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their messages"
  on public.chat_messages
  for select
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can create messages in their sessions"
  on public.chat_messages
  for insert
  with check (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can update their messages"
  on public.chat_messages
  for update
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can delete their messages"
  on public.chat_messages
  for delete
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can read their memory"
  on public.user_memory
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their memory"
  on public.user_memory
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their memory"
  on public.user_memory
  for update
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_chat_sessions_updated_at on public.chat_sessions;
create trigger trg_chat_sessions_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_memory_updated_at on public.user_memory;
create trigger trg_user_memory_updated_at
before update on public.user_memory
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.chat_sessions to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.user_memory to authenticated;
