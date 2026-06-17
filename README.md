# Canary Leasing

Express + Supabase leasing platform prototype.

## Local development

```bash
npm install
cp .env.example .env.local   # add Supabase + Pingram keys
npm run dev
```

Open http://localhost:4173

## Deploy to Vercel

1. Push this repo to GitHub (or link the existing repo in the [Vercel dashboard](https://vercel.com/new)).
2. Import the project in Vercel — it auto-detects the Express app via root `index.js`.
3. Add environment variables (Project → Settings → Environment Variables):

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon/publishable key |
| `PINGRAM_API_KEY` | For email | Pingram API key |
| `PINGRAM_BASE_URL` | Optional | Default `https://api.ca.pingram.io` |
| `PINGRAM_EMAIL_TYPE` | Optional | Default `viewing_request_received` |
| `EMAIL_SENDER_NAME` | Optional | Default `Canary` |
| `EMAIL_SENDER_EMAIL` | Optional | Default `notifications@canarypm.ca` |
| `AUTH_URL` | Production | Your Vercel URL, e.g. `https://your-app.vercel.app` (auto-detected from `VERCEL_URL` if unset) |

4. In **Supabase → Authentication → URL Configuration**, add:
   - **Site URL**: `https://leasing-weld.vercel.app`
   - **Redirect URLs**: `https://leasing-weld.vercel.app/auth/callback`

5. Deploy. Vercel runs `postinstall` (copies static assets to `public/`) and serves the Express API via `api/index.js`.

### CLI deploy

```bash
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # production
```

Use `vercel env pull .env.local` to sync dashboard env vars locally.
