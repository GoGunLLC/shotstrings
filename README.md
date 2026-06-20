# ShotStrings

Airgun shot-string database. The homepage is a Next.js app: search an airgun, the
search bar slides up, and a comparison chart (velocity / energy / consistency)
appears. All data here is currently sample/placeholder data.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Where things live

- `app/page.js` — the homepage UI + chart logic (a React client component).
- `app/data.js` — the sample airgun data and shot-string generator.
- `app/globals.css` — all the styling (the dark/volt look).

To change the design, edit those files and the browser will hot-reload.

## The workflow (how updates go live)

1. A file in this repo gets edited (by you, or by Claude / Codex).
2. The change is pushed to GitHub.
3. Vercel sees the push and automatically rebuilds + deploys the live site (~30s).

That's the whole loop. Once it's connected, going live = pushing to GitHub.

## One-time setup

- **GitHub:** this folder is pushed to a repo (e.g. `gogun/shotstrings`).
- **Vercel:** the Vercel project is linked to that GitHub repo with auto-deploy on.
- **Domain:** point shotstrings.com's DNS at Vercel (Vercel gives the exact records).

## Not wired up yet

The "Watch proof" and "Buy" buttons are placeholders, and the data is fake.
Next step is connecting this to a real Supabase database.
