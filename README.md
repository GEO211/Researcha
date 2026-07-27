# CareLink

CareLink is a Node.js + Vite.js smart health referral system based on the roadmap in `road.txt`.

## Stack

- Frontend: Vite.js, React, Tailwind CSS
- Backend: Node.js, Express.js
- Database: [Supabase](https://supabase.com) (PostgreSQL)
- SMS: [UniSMS API](https://unismsapi.com) (Philippines)

## Setup

1. Install dependencies:

   ```bash
   npm run install:all
   ```

2. Configure Supabase:

   - Project URL: `https://oejvlgmoxefwwawqdpwo.supabase.co`
   - Copy `server/.env.example` to `server/.env`
   - Set `DATABASE_URL` or `SUPABASE_DB_PASSWORD` (see `.env.example`)

   Apply schema and seed:

   ```bash
   npm run db:migrate --prefix server
   npm run db:seed --prefix server
   ```

3. Configure the client:

   ```bash
   copy client\.env.example client\.env.development
   ```

   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

4. Configure SMS (UniSMS):

   In `server/.env`, set:

   ```env
   UNISMS_SECRET_KEY=your-secret-key-from-unisms-dashboard
   UNISMS_SENDER_ID=your-registered-sender-id
   ```

   Phone numbers are normalized to E.164 (`+639...`) before sending. New UniSMS accounts get a test sender ID; register a custom one for production.

5. Start development servers:

   ```bash
   npm run dev
   ```

6. Open the app:

   - Frontend: `http://localhost:5173`
   - API health check: `http://localhost:4000/api/health`

## Default logins (after seed)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@carelink.local` | `password123` |
| Barangay Staff | `barangay@carelink.local` | `password123` |
| City Staff | `city@carelink.local` | `password123` |

## Patient Tracking Links

Approval SMS messages include a direct tracking link like:

```text
https://carelink-bay.vercel.app/track/CL-YYYYMMDD-ABC123
```

Opening that link loads the patient tracking screen and automatically looks up the referral code.

## Supabase CLI (optional)

```bash
supabase login
supabase init
supabase link --project-ref oejvlgmoxefwwawqdpwo
```

Schema lives in `database/supabase/schema.sql`.
