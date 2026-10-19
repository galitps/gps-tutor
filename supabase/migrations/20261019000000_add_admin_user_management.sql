create table public.onboarding_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(trim(email)) > 0),
  requested_role public.user_role not null check (requested_role in ('student', 'tutor')),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.onboarding_requests enable row level security;
grant select, insert on table public.onboarding_requests to authenticated;
revoke all on table public.onboarding_requests from anon;

create policy "Users can create their own onboarding request"
  on public.onboarding_requests
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and email = coalesce((select auth.jwt() ->> 'email'), '')
    and not exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
    )
  );

create policy "Users can view their own onboarding request"
  on public.onboarding_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins can view onboarding requests"
  on public.onboarding_requests
  for select
  to authenticated
  using (public.is_course_admin());

create function public.delete_course_section_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_messages
  where session_id = old.id::text;
  return old;
end;
$$;

create trigger delete_course_section_messages_trigger
  after delete on public.course_sections
  for each row execute function public.delete_course_section_messages();

revoke all on function public.delete_course_section_messages()
  from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;

  return new;
end;
$$;

create function public.admin_create_profile(
  target_email text,
  target_role public.user_role,
  target_course_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if not public.is_course_admin() then
    raise exception 'Only administrators can create user profiles.';
  end if;

  if target_role not in ('student', 'tutor') then
    raise exception 'A new profile must be a student or tutor.';
  end if;

  if target_role = 'tutor' and target_course_id is not null then
    raise exception 'A course can only be assigned while creating a student.';
  end if;

  select users.id
  into target_user_id
  from auth.users as users
  where lower(users.email) = lower(trim(target_email))
  order by users.created_at
  limit 1;

  if target_user_id is null then
    raise exception 'No signed-in account was found for that email. Ask the user to sign in first.';
  end if;

  if exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'This account already has a student, tutor, or administrator profile.';
  end if;

  insert into public.profiles (id, email, role)
  select target_user_id, users.email, target_role
  from auth.users as users
  where users.id = target_user_id;

  if target_role = 'student' and target_course_id is not null then
    insert into public.course_sections (course_id, student_id)
    values (target_course_id, target_user_id);
  end if;

  delete from public.onboarding_requests
  where user_id = target_user_id;

  return target_user_id;
end;
$$;

create function public.admin_delete_profile(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_course_admin() then
    raise exception 'Only administrators can delete user profiles.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_profile_id
      and role in ('student', 'tutor')
  ) then
    raise exception 'Only student and tutor accounts can be deleted here.';
  end if;

  delete from public.course_sections
  where student_id = target_profile_id
     or tutor_id = target_profile_id;

  delete from auth.users
  where id = target_profile_id;
end;
$$;

grant delete on table public.courses, public.course_sections to authenticated;
revoke all on function public.admin_create_profile(text, public.user_role, uuid)
  from public, anon;
revoke all on function public.admin_delete_profile(uuid)
  from public, anon;
grant execute on function public.admin_create_profile(text, public.user_role, uuid)
  to authenticated;
grant execute on function public.admin_delete_profile(uuid)
  to authenticated;
