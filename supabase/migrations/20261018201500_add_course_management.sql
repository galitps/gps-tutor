create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index courses_name_lower_unique_idx
  on public.courses (lower(trim(name)));

alter table public.profiles
  add column is_tutor boolean not null default false;

update public.profiles
set is_tutor = true
where role = 'admin';

alter table public.profiles
  add constraint profiles_is_tutor_role_check
  check (not is_tutor or role in ('admin', 'tutor'));

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, student_id),
  check (tutor_id is null or tutor_id <> student_id)
);

create index course_sections_student_idx
  on public.course_sections (student_id);

create index course_sections_tutor_idx
  on public.course_sections (tutor_id);

create function public.is_course_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  );
$$;

create function public.can_access_course_section(target_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_sections
    join public.profiles
      on profiles.id = (select auth.uid())
    where course_sections.id = target_section_id
      and (
        profiles.role in ('student', 'tutor')
        or (profiles.role = 'admin' and profiles.is_tutor)
      )
      and (
        (
          course_sections.student_id = (select auth.uid())
          and profiles.role = 'student'
        )
        or (
          course_sections.tutor_id = (select auth.uid())
          and (
            profiles.role = 'tutor'
            or (profiles.role = 'admin' and profiles.is_tutor)
          )
        )
      )
  );
$$;

create function public.can_access_session_topic()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_topic text := realtime.topic();
  section_id uuid;
begin
  if session_topic !~ '^session:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(:[a-z]+)?$' then
    return false;
  end if;

  section_id := split_part(session_topic, ':', 2)::uuid;
  return public.can_access_course_section(section_id);
end;
$$;

create function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or public.is_course_admin()
    or exists (
      select 1
      from public.course_sections
      join public.profiles viewer
        on viewer.id = (select auth.uid())
      where course_sections.student_id = target_profile_id
        and course_sections.tutor_id = (select auth.uid())
        and (
          viewer.role = 'tutor'
          or (viewer.role = 'admin' and viewer.is_tutor)
        )
    );
$$;

create function public.validate_course_section_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = new.student_id
      and profiles.role = 'student'
  ) then
    raise exception 'A course section must be assigned to a student account.';
  end if;

  if new.tutor_id is not null and not exists (
    select 1
    from public.profiles
    where profiles.id = new.tutor_id
      and (
        profiles.role = 'tutor'
        or (profiles.role = 'admin' and profiles.is_tutor)
      )
  ) then
    raise exception 'A course section tutor must be a tutor account.';
  end if;

  return new;
end;
$$;

create trigger validate_course_section_members_trigger
  before insert or update of student_id, tutor_id
  on public.course_sections
  for each row execute function public.validate_course_section_members();

revoke all on function public.is_course_admin() from public, anon;
revoke all on function public.can_access_course_section(uuid) from public, anon;
revoke all on function public.can_access_session_topic() from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.is_course_admin() to authenticated;
grant execute on function public.can_access_course_section(uuid) to authenticated;
grant execute on function public.can_access_session_topic() to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
create policy "Admins can view profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_course_admin());

create policy "Tutors can view their assigned students"
  on public.profiles
  for select
  to authenticated
  using (public.can_view_profile(id));

alter table public.courses enable row level security;
grant select, insert, update on table public.courses to authenticated;
revoke all on table public.courses from anon;

create policy "Admins can manage courses"
  on public.courses
  for all
  to authenticated
  using (public.is_course_admin())
  with check (
    public.is_course_admin()
    and created_by = (select auth.uid())
  );

create policy "Participants can view their courses"
  on public.courses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.course_sections
      where course_sections.course_id = courses.id
        and public.can_access_course_section(course_sections.id)
    )
  );

alter table public.course_sections enable row level security;
grant select, insert, update on table public.course_sections to authenticated;
revoke all on table public.course_sections from anon;

create policy "Admins can manage course sections"
  on public.course_sections
  for all
  to authenticated
  using (public.is_course_admin())
  with check (public.is_course_admin());

create policy "Participants can view their course sections"
  on public.course_sections
  for select
  to authenticated
  using (public.can_access_course_section(id));

drop policy if exists "Tutors and students can read session messages"
  on public.session_messages;
drop policy if exists "Users can send messages as themselves"
  on public.session_messages;
alter table public.session_messages
  drop constraint if exists session_messages_session_id_check;

create policy "Participants can read their session messages"
  on public.session_messages
  for select
  to authenticated
  using (
    case
      when session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.can_access_course_section(session_id::uuid)
      else false
    end
  );

create policy "Participants can send their own session messages"
  on public.session_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and case
      when session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.can_access_course_section(session_id::uuid)
      else false
    end
  );

drop policy if exists "Tutors and students can join the demo session channel"
  on realtime.messages;
drop policy if exists "Tutors and students can publish to the demo session channel"
  on realtime.messages;
drop policy if exists "Tutors and students can join the demo call channel"
  on realtime.messages;
drop policy if exists "Tutors and students can publish to the demo call channel"
  on realtime.messages;
drop policy if exists "Tutors and students can join the demo graph channel"
  on realtime.messages;
drop policy if exists "Tutors and students can publish to the demo graph channel"
  on realtime.messages;
drop policy if exists "Tutors and students can join the demo whiteboard channel"
  on realtime.messages;
drop policy if exists "Tutors and students can publish to the demo whiteboard channel"
  on realtime.messages;

create policy "Participants can join their assigned session channels"
  on realtime.messages
  for select
  to authenticated
  using (public.can_access_session_topic());

create policy "Participants can publish to their assigned session channels"
  on realtime.messages
  for insert
  to authenticated
  with check (public.can_access_session_topic());
