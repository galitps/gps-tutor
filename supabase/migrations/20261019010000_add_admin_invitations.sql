create table public.admin_invitations (
  user_id uuid references auth.users (id) on delete cascade,
  email text not null check (char_length(trim(email)) between 3 and 320),
  requested_role public.user_role not null check (requested_role in ('student', 'tutor')),
  target_course_id uuid references public.courses (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  check (requested_role = 'student' or target_course_id is null),
  check (
    (status = 'pending' and accepted_at is null)
    or (status = 'accepted' and accepted_at is not null)
  )
);

create unique index admin_invitations_pending_email_idx
  on public.admin_invitations (lower(email))
  where status = 'pending';

create unique index admin_invitations_user_id_idx
  on public.admin_invitations (user_id)
  where user_id is not null;

alter table public.admin_invitations enable row level security;
revoke all on table public.admin_invitations from public, anon, authenticated;
grant all on table public.admin_invitations to service_role;
