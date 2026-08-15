-- Supabase schema for PassSabi (Phase 1 core tables)

create extension if not exists pgcrypto;

-- profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  class_level text,
  school text,
  preferred_subjects text[],
  learning_preferences jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- chats
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text,
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- memory
create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  memory_data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- study_plans
create table if not exists study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text,
  goal text,
  exam_date date,
  items jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
