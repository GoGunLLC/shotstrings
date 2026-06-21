# ShotStrings — Vision Doc

**Website:** shotstrings.com
**Status:** Brain-dump / work in progress
**Last updated:** 2026-06-20

---

## The Why
There's a whole community of airgunners on YouTube who test and compare the performance of various air guns. A core part of that community is performance comparison: a YouTuber gets a chronograph, shoots a "shot string" (a magazine or several — sometimes three+ mags), and reports the numbers for each shot: velocity and shot energy. Plotted out, those shots form a little curve called a **shot string**.

The problem is the presentation. These YouTubers generally aren't technical or design-minded, so the data ends up trapped in the video — scribbled on a scratch pad, or flashed on screen for a second. It's not something anyone can actually explore, digest, or compare against other air guns.

ShotStrings turns all of that scattered, video-trapped data into a single explorable, interactive, auditable database of shot strings.

## The Problem
- Shot string data lives inside YouTube videos in raw, unusable form (scratch pads, on-screen flashes).
- No good way to **explore** a single shot string interactively.
- No good way to **compare** shot strings across different air guns / projectiles.
- No central, complete database — it's all fragmented across hundreds of individual videos.
- No easy way to **audit** whether a creator's numbers are accurate.

## How It Works (Core Concept)
- **Creators submit shot strings.** A YouTuber submits their YouTube video as a shot string to shotstrings.com: they link the video, specify the air gun and the pellets/projectile used, and submit the data. (Exact submission/ingestion flow TBD.)
- **We ingest it** and create a shot string entry in the database tied to that specific air gun.
- **Users explore.** Pull up a gun (e.g. FX Impact M3) and you get its shot string(s): all the data, rendered in a beautiful interactive graph.
- **Always auditable.** Every shot string links back to the source YouTube video. If someone doubts the accuracy, they can watch the actual video the data came from.

## Features

### Exploration & Graphing (the core)
- **Explorable shot string database** — browse shot strings by air gun and projectile.
- **Beautiful, interactive graphs** — must be gorgeous, easy to use, and interactive. This is the heart of the product.
- **Compare mode** — pull up multiple shot strings side by side (e.g. Air Force Texan vs. FX Impact vs. AEA HP Max). Add and delete data sets from the comparison freely.
- **Multiple metrics** — compare by energy or by velocity.
- **Unit switching** — toggle units (foot-pounds, Joules, etc.) on the fly.
- **Source video links** — every shot string links to the originating YouTube video for auditing.

### Sharing & Distribution
- **Shareable URLs** — a creator gets a URL for their configured shot string / comparison that they can drop in their YouTube description. Viewers click through from the video to shotstrings.com and discover other guns to compare.
- **Embeddable widgets** — generate an embeddable iframe/widget for any shot string or comparison. Users paste it into forum threads (e.g. Airgun Nation posts). The embedded graph is interactive; clicking it sends traffic back to shotstrings.com.
- **Main-page feed** — a feed of newly submitted YouTube videos / shot strings (possibly with the graph alongside, or at least key info about each). Getting into this feed is a major draw for creators — review + approval → feed placement → traffic.
- **New-submission email blasts** — when new shot strings are approved, blast them to the email list.

### Creator Accounts & Dashboards
- **Creator accounts** — YouTubers make accounts to submit shot strings.
- **Creator dashboard** — a backend where creators see all their videos and the shot strings associated with each. Multiple shot strings can be tied to a single video.
- **Submit on anyone's behalf** — any user can submit a shot string from any creator's video (e.g. to help a YouTuber out). It's credited to the submitter until/unless the creator claims it.
- **Channel claiming** — a real YouTube creator signs in, verifies their channel (YouTube OAuth, with a manual fallback), and claims it. Claiming is **channel-scoped**: in one act they take control of every video from that channel — past *and future* submissions — and those strings move into their dashboard. The original submitter **keeps a visible "contributed by" credit** (we separate *credit* from *control*), so helping out is never penalized.

### User Accounts & Engagement
- **Accelerated sign-in** — quick social sign-in (Google, Facebook, Apple) to reduce friction and capture emails.
- **Favorites / follows** — users flag favorite air guns and shot strings, and the pellets/projectiles they own.
- **Notifications & preferences** — when a new shot string drops for a gun (or pellet) a user follows, notify them. Configurable notification preferences per account.
- **Incentive to register** — favoriting + notifications give real reasons to create an account (and hand us their email).

### Demand Signals & Requests
- **Shot string request form** — users can request/"demand" specific combos they want to see (e.g. this gun + this slug).
- **Demand routing to creators** — surface aggregated demand and email creators: "lots of people are asking for X gun + Y slug — high interest, consider making it." Helps creators pick high-payoff videos.

## Incentives (Why This Flywheel Works)
The whole thing is built on mutually beneficial traffic sharing:
- **Creators are motivated to submit** because shotstrings.com sends traffic (and YouTube views) back to them. Lots of airgun enthusiasts browse the site; getting your video onto shotstrings.com = more eyeballs on your video.
- **We benefit** because every submission fills out the database, which makes the site more complete, which draws more people — the most complete database of this kind on the internet.
- **Shareable URLs** push the creator's video viewers onto our site, where they discover more guns to explore.
- **Embeddable widgets** spread the product across forums and send that traffic back to us.
- **Feed placement** is a carrot for submission — approved shot strings hit the main feed and the email blast, driving traffic to the creator's video.
- **User accounts** create a registered, opted-in audience the creators want to reach — which makes submitting even more attractive.
- It's a flywheel: more creators → more data → more visitors → more incentive for creators.

## Data & Market Research (a hidden asset)
Because users register, favorite guns/pellets, search, and interact, the site accumulates uniquely valuable demand data:
- **What's hot vs. not** — from search queries, which shot strings get interacted with, and what people favorite, we'll know which air guns are trending and which nobody cares about.
- **Email marketing** — an opted-in email list segmented by the guns/pellets people care about, so we can market directly and relevantly.
- **Request data** — the demand/request form tells us exactly what combos people want, which we can route back to creators (and potentially to vendors/manufacturers).
- This is amazing real-time market research on the airgun space — potentially valuable to dealers and manufacturers, not just to us.

## Monetization (Early Thinking)
- When viewing a shot string for a particular gun, link out to **where to buy that gun** — a list of vendors that sell it.
- Potential models (to work out later):
  - **Paid placement** — dealers pay to be positioned, e.g. the #1 slot.
  - **Affiliate links.**
  - Possibly viewer **discounts** on the guns.
- Core idea: while someone's looking at a gun, direct them to where they can buy it, and capture value from that intent. Details TBD.

## Launch Scope (MVP — keep it simple)
At launch, keep submission dead simple. A creator submits:
- **YouTube video URL.**
- **Velocity data** — paste in the velocity for each shot/slug (bulk-paste a column of velocities supported).
- **Air gun** — select from the catalog (brand → model → variant: caliber/barrel/tank).
- **Projectile** — either **pick from the projectile library** (JSB 25 Diabolo Match, etc.) and we prefill the grain weight, **or** choose **custom pellet/slug** and type the weight in manually (for hand-made or unlisted projectiles).
- **Suppressor** — yes/no (selectable from a moderator catalog).
- **Air tank size** + **starting (fill) pressure**, and similar setup details.

From that, the site **calculates the shot string** (the energy/velocity curve) and puts it into the database. That's the whole core loop for v1 — exploration, comparison, and source-video links built on top of this.

> See `docs/architecture.md` for the full technical design (Supabase/Postgres schema, calc layer, auth/ownership, RLS). It covers the catalog/submission split, snapshotted projectile weight, moderation workflow, units, and derived energy/efficiency stats.

## Future / Post-Launch Features (keep in mind, don't build yet)
- **Per-gun discussion threads / forum element** — let people comment on and discuss a specific air gun. This makes shotstrings.com the one place where the data, the submitted YouTube videos, AND the conversation about a gun all live together — pulling traffic away from Airgun Nation and other forums. Not needed at launch; add later.
- **Accuracy data** — a shot string captures the *energy* half of a gun's performance; **accuracy** is the other half, and we don't yet have a clean way to quantify/represent it. Possible approach: let submitters upload a **photo of the target** from that same shot string for quick reference. Optional, future.

## The Vision (End State)
The end state is the definitive, all-in-one hub for air gun performance: for any given gun you can see its shot string data, the source YouTube videos behind that data, and (eventually) the community discussion and accuracy info — all in one place. It becomes the obvious destination for airgun enthusiasts, drawing traffic away from scattered forums and videos, with a self-reinforcing flywheel of creators and viewers.
_(still evolving — more features to come)_

## Open Questions

### Resolved by `docs/architecture.md`
- **Submission/data model** — structured form, manual data entry; full schema drafted (catalog vs. submission layers).
- **Energy needs projectile mass** — handled: projectile weight is snapshotted onto each string (`projectile_weight_grains`), prefilled from the catalog or typed in for custom pellets.
- **Units** — store one canonical unit per measurement, convert in the UI (US/metric).
- **Review/approval workflow** — submissions are `pending` → `approved`/`rejected`; only approved show publicly.
- **Account types** — single `profiles` table mirroring auth users; `is_admin` gates moderation/catalog approval. (Creator vs. viewer is capability, not a separate account.)
- **Accuracy** — optional `targets` table (target photo + group size/distance), with room for a rating system later.
- **Engagement & growth features** — schema drafted for creator videos/dashboards, shareable + embeddable views (`saved_views`), favorites/follows, notifications, the feed, demand requests + upvotes, market-research analytics, and vendor buy-links. Phased Phase 1–4. See `architecture.md` → §3.3 *Engagement & growth layer* and §6 *Feature phasing*.
- **Video ownership & channel claiming** — anyone can submit from any video (credited to the submitter, immutably); the real creator verifies their channel via YouTube OAuth and claims it channel-wide, transferring *control* of all current + future videos while the submitter retains credit. `youtube_channels` registry + `youtube_channel_id` captured at ingest. See `architecture.md` → §5 *Auth, accounts & ownership*.
- **Demand/request feature** — `shot_string_requests` + `request_votes` (aggregated upvotes = demand signal; `fulfilled_by_string_id` closes the loop).

### Still open
- **Monetization specifics** — affiliate vs. paid placement vs. discounts. (`vendors`/`vendor_listings` model the *structure*; the business terms are still TBD.)
- **Notifications** — delivery mechanics (email vs. in-app per event) are modeled in `notification_preferences`; the open part is *which* events exist and the email-blast cadence/dedup logic.
- **Email list privacy/consent** — `email_opt_in`/`email_consent_at` capture the flag; still open: ESP choice and how we communicate the market-research use of data.
- **Efficiency formula** — resolved: free-air-volume model, headline metric **ft-lbs per cubic inch of air** (see `architecture.md` → §4.3).
