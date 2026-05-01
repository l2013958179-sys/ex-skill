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

alter table if exists public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table if exists public.messages
  add column if not exists emotion text;

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null,
  content text not null,
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.relationship_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assistant_id text not null,
  story_text text,
  relationship_stage text,
  relationship_trend text,
  how_met text,
  user_personality text,
  partner_personality text,
  partner_role text,
  user_nicknames jsonb not null default '[]'::jsonb,
  partner_nicknames jsonb not null default '[]'::jsonb,
  chat_style text,
  emotional_expression text,
  shared_memories jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  user_boundaries text,
  partner_boundaries text,
  preferences text,
  intimacy_score integer not null default 0,
  relationship_summary text,
  roleplay_suggestions jsonb not null default '{}'::jsonb,
  raw_analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists user_memories_user_id_updated_at_idx
  on public.user_memories (user_id, updated_at desc);

create index if not exists relationship_stories_user_id_updated_at_idx
  on public.relationship_stories (user_id, updated_at desc);

create unique index if not exists user_memories_user_id_memory_type_idx
  on public.user_memories (user_id, memory_type);

create unique index if not exists relationship_stories_user_id_assistant_id_idx
  on public.relationship_stories (user_id, assistant_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.user_memories to authenticated;
grant select, insert, update, delete on public.relationship_stories to authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_memories enable row level security;
alter table public.relationship_stories enable row level security;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_relationship_stories_updated_at on public.relationship_stories;

create trigger set_relationship_stories_updated_at
before update on public.relationship_stories
for each row
execute function public.set_updated_at_timestamp();

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
drop policy if exists "Users can view their own relationship stories" on public.relationship_stories;
drop policy if exists "Users can insert their own relationship stories" on public.relationship_stories;
drop policy if exists "Users can update their own relationship stories" on public.relationship_stories;
drop policy if exists "Users can delete their own relationship stories" on public.relationship_stories;

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

create policy "Users can view their own relationship stories"
on public.relationship_stories
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own relationship stories"
on public.relationship_stories
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own relationship stories"
on public.relationship_stories
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own relationship stories"
on public.relationship_stories
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their own chat images" on storage.objects;
drop policy if exists "Users can upload their own chat images" on storage.objects;
drop policy if exists "Users can update their own chat images" on storage.objects;
drop policy if exists "Users can delete their own chat images" on storage.objects;

create policy "Users can view their own chat images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-images'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload their own chat images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-images'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own chat images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-images'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat-images'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own chat images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-images'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
