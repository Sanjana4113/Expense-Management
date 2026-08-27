# Ledgerly

A personal expense tracker built with Next.js, MongoDB, and Tailwind CSS.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

The app works without environment variables using a local development fallback. For persistent data, replace the values in `.env.local` with a MongoDB Atlas connection string and database name.

## Deploy to Vercel

1. Push this repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In the Vercel project settings, add `MONGODB_URI` and `MONGODB_DB` under Environment Variables.
3. In MongoDB Atlas, add `0.0.0.0/0` to Network Access or configure a narrower Vercel egress policy.
4. Redeploy the project.

No `vercel.json` is required; Vercel detects the Next.js framework automatically.
