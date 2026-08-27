# Ledgerly

A personal expense tracker built with Next.js, MongoDB, and Tailwind CSS.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

The app works without environment variables using a local development fallback. For persistent data, replace the values in `.env.local` with a MongoDB Atlas connection string and database name.

Email/password signup requires `MONGODB_URI`, `MONGODB_DB`, and `AUTH_SECRET`. Passwords are stored as salted scrypt hashes, never as plain text.

For Google sign-in, also add `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. In Google Cloud Console, create a Web OAuth client and add `http://localhost:3000/api/auth/callback/google` as a local redirect URI. For Vercel, add `https://YOUR-VERCEL-DOMAIN/api/auth/callback/google` as an authorized redirect URI.

## Admin portal

The primary administrator accounts are `sanjanabh2003@gmail.com` and `indudhara2020@gmail.com`. When either account signs in, the dashboard offers a choice between the normal expense flow and `/admin`. Administrators can grant or revoke admin access for other email addresses from the portal. Primary administrators cannot be removed.

## Deploy to Vercel

1. Push this repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In the Vercel project settings, add `MONGODB_URI` and `MONGODB_DB` under Environment Variables.
3. In MongoDB Atlas, add `0.0.0.0/0` to Network Access or configure a narrower Vercel egress policy.
4. Redeploy the project.

No `vercel.json` is required; Vercel detects the Next.js framework automatically.
