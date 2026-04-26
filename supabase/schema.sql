create extension if not exists "pgcrypto";

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  role text not null default 'general',
  girlfriend_persona text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null,
  content text not null,
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists user_memories_user_id_updated_at_idx
  on public.user_memories (user_id, updated_at desc);

create unique index if not exists user_memories_user_id_memory_type_idx
  on public.user_memories (user_id, memory_type);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.user_memories to authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_memories enable row level security;

drop policy if exists "Users can view their own conversations" on public.conversations;
drop policy if exists "Users can insert their own conversations" on public.conversations;
drop policy if exists "Users can update their own conversations" on public.conversations;
drop policy if exists "Users can delete their own conversations" on public.conversations;
drop policy if exists "Users can view their own messages" on public.messages;
drop policy if exists "Users can insert their own messages" on public.messages;
drop policy if exists "Users can update their own messages" on public.messages;
drop policy if exists "Users can delete their own messages" on public.messages;
drop policy if exists "Users can view their own memories" on public.user_memories;
drop policy if exists "Users can insert their own memories" on public.user_memories;
drop policy if exists "Users can update their own memories" on public.user_memories;
drop policy if exists "Users can delete their own memories" on public.user_memories;

create policy "Users can view their own conversations"
on public.conversations
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own conversations"
on public.conversations
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own conversations"
on public.conversations
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own conversations"
on public.conversations
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can view their own messages"
on public.messages
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own messages"
on public.messages
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own messages"
on public.messages
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own messages"
on public.messages
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can view their own memories"
on public.user_memories
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own memories"
on public.user_memories
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own memories"
on public.user_memories
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own memories"
on public.user_memories
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);
