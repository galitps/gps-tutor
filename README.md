This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication

Sign-in uses Supabase Auth. Configure `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then apply the SQL
migration in `supabase/migrations/20261010233800_create_profiles.sql` to the
Supabase project.

To enable Google sign-in:

1. In the Supabase Dashboard, enable Google under **Authentication → Providers**.
   Create an OAuth client ID and secret in Google Cloud. Add the Supabase
   provider callback URL shown in Supabase (usually
   `https://<project-ref>.supabase.co/auth/v1/callback`) to Google's authorized
   redirect URIs.
2. In Supabase **Authentication → URL Configuration**, set the production Site
   URL and add `https://gps-tutor.vercel.app/auth/callback` to the allowed
   redirect URLs. Add `http://localhost:3000/auth/callback` for local testing.
3. Save the Google client ID and secret in the Supabase Google provider
   settings. The app itself uses the existing Supabase URL and publishable key;
   Google secrets must not be added to client-side environment variables.

The migration creates a `public.profiles` row for each Auth user and assigns
the `student` role by default (including existing Auth users the first time it
runs). Profiles are visible only to their owner. To provision a tutor or
admin, create the account in Supabase Auth and update its role from the
Supabase SQL Editor:

```sql
update public.profiles
set role = 'tutor'
where id = (select id from auth.users where email = 'tutor@example.com');
```

Use `admin` instead of `tutor` to provision an administrator. Role selection on
the sign-in screen is checked against the stored profile role; it does not
assign or change roles.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

git commit -m "feat: initialize Next.js app with TypeScript, App Router, and Tailwind CSS"

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
