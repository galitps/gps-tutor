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
migrations in `supabase/migrations/` to the Supabase project in timestamp order.
Apply each migration once; when using the Supabase SQL Editor, run only the
migration that has not already been applied.

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

The profile migration creates a `public.profiles` row for each Auth user and
assigns the `student` role by default, including for existing Auth users. The
email migration adds the Auth email to each profile, restores missing profile
rows as students, and keeps the profile email in sync if the Auth email changes.
If the session-messages migration has already been applied, do not run it again
when applying the profile email migration.
Profiles are visible only to their owner in the app. Do not delete profile rows
to change a role: the Auth account remains, but its profile will be missing
until it is restored. To provision a tutor or admin, create the account in
Supabase Auth and update its role from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'tutor'
where email = 'tutor@example.com';
```

Use `admin` instead of `tutor` to provision an administrator. Role selection on
the sign-in screen is checked against the stored profile role; it does not
assign or change roles. To use two accounts at the same time, sign in from
separate browser profiles; tabs in the same browser profile share the same
Supabase session. Alternatively, sign out before switching accounts.

## Session audio and video

Both participants must select **Start call** and allow camera and microphone
access. Audio and video are sent directly between the two browsers with WebRTC.
Camera and microphone access requires HTTPS, except on localhost.

The call uses public STUN servers by default. To use custom STUN or TURN servers,
set `NEXT_PUBLIC_WEBRTC_ICE_SERVERS` to a JSON array in `.env.local`:

```dotenv
NEXT_PUBLIC_WEBRTC_ICE_SERVERS='[{"urls":"stun:stun.example.com:3478"},{"urls":"turns:turn.example.com:5349","username":"temporary-user","credential":"temporary-credential"}]'
```

This configuration is included in the browser bundle. Do not put long-lived
TURN credentials in it; use temporary credentials from your TURN provider.
Public STUN fallback can fail on restrictive networks, where a TURN relay is
needed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

git commit -m "feat: initialize Next.js app with TypeScript, App Router, and Tailwind CSS"

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
