# EduBridge – setup

## Done in this delivery
`supabase/migrations/0001_core.sql` – all 19 tables, RLS, private storage buckets, signup gate
(only Mam's pre-authorized email or students she added can create accounts), event-driven notification
triggers (materials, tests + scheduled reminder, assignments, announcements, discussions) with
de-duplication, a pg_cron scheduler, and server-side test grading with protected answer keys.

## Setup
1. Create a Supabase project. In SQL editor run `0001_core.sql`, then the seed insert at the bottom with Mam's real email.
2. Auth -> create Mam's user (same email). Students: Mam adds them in the Students page; invitations go out via an Edge Function using the service-role key (server-only, never in the frontend).
3. Web Push: generate VAPID keys (`npx web-push generate-vapid-keys`). Put the public key in the frontend env `VITE_VAPID_PUBLIC_KEY`; private key as an Edge Function secret. Push only works where the browser supports it and the user grants permission; in-app notifications are the reliable record.
4. Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only.

## NOT yet built (next steps)
React + TypeScript + Tailwind UI (pages matching your reference), Recharts analytics, Excel/CSV import/export,
the `invite-student` and `send-push` Edge Functions, and the service worker.

## Mobile app (PWA) – `app/`
`cd app && cp .env.example .env` (fill URL, anon key, `VITE_VAPID_PUBLIC_KEY`) → `npm i && npm run dev` → deploy on Vercel.
On a phone: open the URL → browser menu → **Add to Home Screen** (installs as a full-screen app with its own icon).
