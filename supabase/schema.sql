create extension if not exists pgcrypto;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  due_date date,
  closed boolean not null default false,
  submitted_by text not null default '',
  total_members integer not null default 0,
  file_url text,
  file_name text,
  overall_consensus text not null default '',
  stipulations text not null default '',
  next_steps text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  topic_id uuid not null references public.topics(id) on delete cascade,
  voter text not null,
  choice text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (topic_id, voter)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists topics_set_updated_at on public.topics;
create trigger topics_set_updated_at
before update on public.topics
for each row
execute function public.set_updated_at();

drop trigger if exists votes_set_updated_at on public.votes;
create trigger votes_set_updated_at
before update on public.votes
for each row
execute function public.set_updated_at();

alter table public.topics enable row level security;
alter table public.votes enable row level security;

drop policy if exists "Public topics read" on public.topics;
create policy "Public topics read"
on public.topics
for select
to anon, authenticated
using (true);

drop policy if exists "Public topics insert" on public.topics;
create policy "Public topics insert"
on public.topics
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public topics update" on public.topics;
create policy "Public topics update"
on public.topics
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public votes read" on public.votes;
create policy "Public votes read"
on public.votes
for select
to anon, authenticated
using (true);

drop policy if exists "Public votes insert" on public.votes;
create policy "Public votes insert"
on public.votes
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public votes update" on public.votes;
create policy "Public votes update"
on public.votes
for update
to anon, authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('topic-attachments', 'topic-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Public topic attachments read" on storage.objects;
create policy "Public topic attachments read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'topic-attachments');

drop policy if exists "Public topic attachments write" on storage.objects;
create policy "Public topic attachments write"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'topic-attachments');
