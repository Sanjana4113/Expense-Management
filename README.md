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

## Bank transaction syncing

Ledgerly imports booked debit transactions through Enable Banking's Account Information API. Users authorize read-only access through Enable Banking and their bank; Ledgerly never receives their bank password, PIN, or card number. Imported transactions use the bank's stable entry reference and account ID to prevent duplicates.

Create an Enable Banking application, register the callback URL, export its private RSA key, Base64-encode the complete PEM file, then configure:

```env
ENABLE_BANKING_APPLICATION_ID=your-application-uuid
ENABLE_BANKING_REDIRECT_URI=https://your-domain.example/api/banking/enablebanking/callback
ENABLE_BANKING_PRIVATE_KEY_BASE64=base64-encoded-pem-private-key
CRON_SECRET=generate-a-random-value-with-at-least-16-characters
```

MongoDB is required for connected accounts. Users can connect multiple banks by country and account type. Booked debit transactions synchronize once daily through a secured Vercel Cron Job and whenever the user selects **Sync all**. A manual sync within six hours of the scheduled run causes that connection to be skipped, reducing the chance of exceeding bank access limits without suppressing the next day's sync. Production applications restricted to linked accounts can access only the owner's accounts until Enable Banking grants unrestricted activation.

## Admin portal

The primary administrator accounts are `sanjanabh2003@gmail.com` and `indudhara2020@gmail.com`. When either account signs in, the dashboard offers a choice between the normal expense flow and `/admin`. Administrators can grant or revoke admin access for other email addresses from the portal. Primary administrators cannot be removed.

## Deploy to Vercel

1. Push this repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In the Vercel project settings, add the variables from `.env.example` under Environment Variables. Generate a random `CRON_SECRET` containing at least 16 characters; Vercel sends it as the scheduled request's bearer token.
3. In MongoDB Atlas, add `0.0.0.0/0` to Network Access or configure a narrower Vercel egress policy.
4. Redeploy the project.

The cron configuration in `vercel.json` runs `/api/cron/bank-sync` daily at 05:00 UTC. Vercel Cron runs only on production deployments.
