-- Folium social schema
-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  friend_id text not null,
  requested_by text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_pair_order check (user_id < friend_id),
  constraint friendships_pair_unique unique (user_id, friend_id)
);

create index if not exists friendships_status_idx on public.friendships(status);
create index if not exists friendships_user_idx on public.friendships(user_id);
create index if not exists friendships_friend_idx on public.friendships(friend_id);

create table if not exists public.plant_notes (
  id uuid primary key default gen_random_uuid(),
  plant_id text not null,
  author_id text not null,
  recipient_id text not null,
  note_text text not null check (char_length(trim(note_text)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists plant_notes_plant_idx on public.plant_notes(plant_id, created_at desc);
create index if not exists plant_notes_recipient_idx on public.plant_notes(recipient_id, created_at desc);

-- Optional RLS baseline if you later call Supabase directly from clients.
alter table public.friendships enable row level security;
alter table public.plant_notes enable row level security;

-- Service-role backend bypasses RLS; these are safe defaults for future client-side use.
do $$ begin
  create policy friendships_read_all on public.friendships for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy plant_notes_read_all on public.plant_notes for select using (true);
exception when duplicate_object then null; end $$;
