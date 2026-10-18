create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (session_id = 'demo-101'),
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index session_messages_session_created_at_idx
  on public.session_messages (session_id, created_at);

alter table public.session_messages enable row level security;

grant select, insert on table public.session_messages to authenticated;
revoke all on table public.session_messages from anon;

create policy "Tutors and students can read session messages"
  on public.session_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );

create policy "Users can send messages as themselves"
  on public.session_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );

create policy "Tutors and students can join the demo session channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'session:demo-101'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );

create policy "Tutors and students can publish to the demo session channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'session:demo-101'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );

alter publication supabase_realtime add table public.session_messages;
