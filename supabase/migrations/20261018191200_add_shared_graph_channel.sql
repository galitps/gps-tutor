create policy "Tutors and students can join the demo graph channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'session:demo-101:graph'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );

create policy "Tutors and students can publish to the demo graph channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'session:demo-101:graph'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('student', 'tutor')
    )
  );
