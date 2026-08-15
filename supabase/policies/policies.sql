-- Enable RLS and policies

alter table profiles enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
alter table memory enable row level security;
alter table study_plans enable row level security;

-- profiles: user can select/insert/update their own profile
create policy profiles_select_own on profiles for select using (auth.uid() = id);
create policy profiles_upsert_own on profiles for insert, update using (auth.uid() = id) with check (auth.uid() = id);

-- chats: only owner can access
create policy chats_rls on chats for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages: only owner of chat can access
create policy messages_rls on messages for all using (
  auth.uid() = user_id or auth.uid() = (select user_id from chats where chats.id = messages.chat_id)
) with check (
  auth.uid() = user_id or auth.uid() = (select user_id from chats where chats.id = messages.chat_id)
);

-- memory
create policy memory_rls on memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- study_plans
create policy study_plans_rls on study_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
