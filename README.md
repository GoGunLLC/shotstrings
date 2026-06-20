# ShotStrings

Airgun shot-string database. This repo currently holds a Hello World page used to
set up the deploy workflow.

## The workflow (how updates go live)

1. A file in this folder gets edited (by you, or by Claude / Codex).
2. The change is pushed to GitHub.
3. Vercel sees the push and automatically rebuilds + deploys the live site (~30s).

That's the whole loop. Once it's connected, going live = pushing to GitHub.

## One-time setup

- **GitHub:** this folder is pushed to a repo (e.g. `gogun/shotstrings`).
- **Vercel:** the Vercel project is linked to that GitHub repo with auto-deploy on.
- **Domain:** point shotstrings.com's DNS at Vercel (Vercel gives the exact records).

## Next step

Convert this static page into a Next.js app + Supabase database once the deploy
loop is confirmed working.
