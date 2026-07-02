# ShotStrings — Architecture & Technical Design

> Status: **MVP applied to Supabase** (project `kvjobezpudugjjjcokee`, migrations `mvp_01`–`mvp_08`). The §3.3 engagement/growth layer and `targets` remain proposed (later phases). Product rationale (the "why") lives in [`vision.md`](vision.md); this doc is the "how."
>
> **Contents:** 1. Product context · 2. Conventions & key decisions · 3. Data model · 4. Domain logic & calculations · 5. Auth, accounts & ownership · 6. Feature phasing · 7. Resolved / open

---

## 1. Product context

ShotStrings turns airgun shot-string data that's currently trapped inside YouTube videos into an explorable, comparable, auditable database. Creators submit a video + the per-shot velocities + the gun/projectile setup; the site computes the energy/velocity curve and renders it interactively. See [`vision.md`](vision.md) for the full product vision, flywheel, and monetization thinking.

This doc covers the technical design: the data model, the calculation logic, the auth/ownership model, and how it all maps onto Supabase.

---

## 2. Conventions & key decisions

| Decision | Choice |
|---|---|
| **Units** | Store one canonical unit per measurement; convert in the UI for US/metric users. |
| **Moderation** | **Publish-then-review** (mvp_15): submissions and user-created catalog entries insert as `approved` and are public immediately; `reviewed_at IS NULL` puts them in the admin review queue. Admins mark reviewed, edit, merge, or `reject` (unpublish) after the fact. A non-admin edit to a string clears `reviewed_at`, re-queueing it. |
| **Accuracy** | Optional, in its own `targets` table. Room for an accuracy-rating system later. |
| **Catalog** | Self-service with after-the-fact curation. Users create missing brands/models/variants/projectiles/moderators from the submit form; entries are live immediately and land in the admin review queue. Calibers stay admin-only reference data. |
| **Ownership** | Anyone can submit from any video; real creators claim their *channel* to take control. Credit ≠ control (see §5). |

### Canonical storage units (UI converts for display)

| Measurement | Stored as | Common alt shown in UI |
|---|---|---|
| Velocity | feet per second (fps) | m/s |
| Projectile weight | grains (gr) | grams |
| Pressure | PSI | BAR |
| Temperature | °C | °F |
| Altitude | feet | meters |
| Barrel length | inches | mm |
| Head diameter | millimeters | inches |
| Reservoir volume | cubic centimeters (cc) | cubic inches |
| Group size | inches | mm / MOA |
| Group distance | yards | meters |
| Energy (derived) | foot-pounds (ft-lbs) | joules |

> Rule: store each measurement in the unit submitters will actually enter, so values go in without conversion. The UI converts for the other audience. (Head dia. and reservoir volume stay metric because that's how the industry specs them — pellet heads as 5.52mm, bottles as cc.) Storage units are an *entry/UX* decision and are deliberately decoupled from the physics — see §4.

---

## 3. Data model

```
auth.users ─┐
            └─< shot_strings >──── airgun_variants ──< airgun_models ── brands
                 │ │ │ │                 │
                 │ │ │ │                 └──< airgun_tanks
                 │ │ │ └── projectiles ── brands
                 │ │ │        calibers (lookup) ── referenced by variants & projectiles
                 │ │ └──── moderators ──── brands
                 │ │
                 │ ├──< shots
                 │ ├──< targets
                 │ ├──< shot_string_tank_pressures >── airgun_tanks
                 │ └── video_id ─> videos >── youtube_channels   (ownership; see §5)
                 │
                 └─ (snapshots caliber + weight)
```

Three layers:
- **Catalog** (`brands`, `calibers`, `airgun_models`, `airgun_variants`, `airgun_tanks`, `projectiles`, `moderators`) — reusable, curated, slow-changing.
- **Submissions** (`youtube_channels`, `videos`, `shot_strings`, `shots`, `targets`, `shot_string_tank_pressures`) — user-generated; ownership derives from channel claims (§5).
- **Engagement & growth** (`saved_views`, `follows`, `notifications`, `notification_preferences`, `shot_string_requests`, `request_votes`, `interaction_events`, `vendors`, `vendor_listings`) — the flywheel layer.

### 3.1 Catalog layer

#### `profiles`
Mirror of `auth.users` for public-facing display data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `username` | text unique | display name on submissions |
| `is_admin` | bool | gates catalog approval + moderation |
| `email_opt_in` | bool | consent for new-string email blasts |
| `email_consent_at` | timestamptz | nullable — when consent was given |
| `created_at` | timestamptz | |

#### `brands`
Shared by guns, pellets, moderators (FX makes guns *and* moderators).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `name` | text | "FX Airguns", "JSB" |
| `slug` | text unique | |
| `status` | enum(`pending`,`approved`) | suggest-new flow |
| `created_by` | uuid → profiles | nullable (seeded rows = null) |
| `created_at` | timestamptz | |

#### `calibers` (lookup — **not** free text)
The single most important normalization. Prevents `.22` / `0.22` / `5.5mm` fragmenting leaderboards.

| Column | Type | Notes |
|---|---|---|
| `id` | smallint PK | |
| `name` | text unique | ".22" |
| `nominal_inches` | numeric | 0.218 |
| `nominal_mm` | numeric | 5.5 |

Seed: .177 (4.5), .20 (5.0), .22 (5.5), .25 (6.35), .30 (7.62), .357 (9.0), .45 (11.4), .50 (12.7).

#### `airgun_models`
The gun as a product line.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `brand_id` | → brands | |
| `name` | text | "Impact M3" |
| `power_plant` | enum(`pcp`,`spring`,`gas_ram`,`co2`,`multi_pump`) | |
| `is_regulated` | bool | |
| `status` | enum(`pending`,`approved`) | |
| `created_by` | uuid → profiles | nullable |
| `created_at` | timestamptz | |

#### `airgun_variants`  ← *what a submitter selects*
One model → many variants (caliber + barrel + bottle).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `model_id` | → airgun_models | |
| `caliber_id` | → calibers | |
| `name` | text | nullable — manufacturer's edition label (e.g. "Sniper", "Compact"); a "Sniper" version is usually just a longer barrel |
| `barrel_length_in` | numeric | nullable |
| `reg_pressure_psi` | numeric | nullable |
| `status` | enum(`pending`,`approved`) | |
| `created_by` | uuid → profiles | nullable |

> Reservoir volume moved out to `airgun_tanks` — a gun can have more than one tank at different pressures (e.g. a 7,000 psi main feeding a 4,500 psi working tank). Energy must be summed per tank, so each tank needs its *own* volume + pressures; a single lumped volume can't be evaluated at one pressure.

#### `airgun_tanks`  ← one or more per variant
| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `variant_id` | → airgun_variants | |
| `role` | enum(`main`,`working`,`reservoir`) | label for the form; single-tank guns use `reservoir` |
| `position` | smallint | order in the cascade (1 = highest pressure) |
| `volume_cc` | numeric | **needed for efficiency math** |
| `rated_pressure_psi` | numeric | nullable — fill/working pressure spec |

#### `projectiles`
Pellet/slug catalog.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `brand_id` | → brands | |
| `name` | text | "Hades" |
| `type` | enum(`pellet`,`slug`,`round_ball`) | |
| `caliber_id` | → calibers | |
| `weight_grains` | numeric | |
| `head_diameter_mm` | numeric | nullable |
| `status` | enum(`pending`,`approved`) | |
| `created_by` | uuid → profiles | nullable |

#### `moderators`
Suppressors.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `brand_id` | → brands | |
| `name` | text | |
| `status` | enum(`pending`,`approved`) | |
| `created_by` | uuid → profiles | nullable |

### 3.2 Submission layer

> `youtube_channels` and `videos` are defined here as structures; the *ownership/claiming behavior* that uses them lives in §5.

#### `youtube_channels`  ← the claim registry
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | the immutable YouTube channel id (`UC…`) — **not** the @handle, which can change |
| `title` | text | channel name, from YouTube API |
| `owner_id` | → profiles | nullable — `null` = unclaimed; set on a verified claim |
| `verified_at` | timestamptz | nullable |
| `verification_method` | enum(`youtube_oauth`,`manual`) | OAuth primary; manual = admin verifies a code in the channel's About page |
| `claimed_from` | jsonb | nullable — audit snapshot for manual/reversed claims |

#### `videos`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `submitted_by` | → profiles | who first created the video row. **Immutable** (provenance/credit) |
| `youtube_channel_id` | → youtube_channels | **captured at ingest** from the YouTube API — required to match future claims |
| `youtube_url` | text | canonical link |
| `youtube_video_id` | text unique | parsed from URL — dedupes & enables thumbnails/oEmbed |
| `title` | text | nullable — fetched via YouTube oEmbed |
| `thumbnail_url` | text | nullable |
| `published_at` | timestamptz | nullable |
| `is_unavailable` | bool | one place to flag a video deleted/privated on YouTube — reflects to all its strings |
| `created_at` | timestamptz | |

> Ownership is **derived, not stored on the video**: a video is controlled by whoever owns its channel. One video → many strings, possibly from several submitters. See §5.

#### `shot_strings`  ← the submission
| Column | Type | Req | Notes |
|---|---|---|---|
| `id` | uuid PK | | |
| `submitted_by` | → profiles | ✓ | who entered the data — **immutable credit**; survives a channel claim. Control is derived from the video's channel owner, not this field (§5) |
| `airgun_variant_id` | → airgun_variants | ✓ | |
| `moderator_id` | → moderators | | null = none used |
| `projectile_id` | → projectiles | | null = unlisted/custom pellet |
| `caliber_id` | → calibers | ✓ | **snapshot** |
| `projectile_weight_grains` | numeric | ✓ | **snapshot** |
| `video_id` | → videos | ✓ | source video (one video → many strings) |
| `ran_regulated` | bool | | |
| `reg_setpoint_psi` | numeric | | |
| `temperature_c` | numeric | | |
| `altitude_ft` | numeric | | |
| `chrono_distance_in` | numeric | | distance chrono sat from the muzzle |
| `status` | enum(`pending`,`approved`,`rejected`) | ✓ | default `pending` |
| `approved_at` | timestamptz | | set on approval — drives feed ordering & email blasts |
| `created_at` / `updated_at` | timestamptz | | |

**Why snapshot `caliber_id` + `weight_grains` onto the string** even when `projectile_id` is set: the catalog can be edited/corrected later; the recorded string's energy math must never silently change. Pick-from-catalog *prefills* these; custom pellets fill them directly.

#### `shots`
A shot row always represents a **real shot fired** — it keeps its place in the string even when the chronograph failed to read it (a common occurrence). Submitters are never forced to drop or fake unread shots. `velocity_fps` is therefore **nullable**, and `velocity_status` records why.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `shot_string_id` | → shot_strings | cascade delete |
| `shot_number` | int | 1-based order |
| `velocity_fps` | numeric | **nullable** — null unless a good read |
| `velocity_status` | enum(`measured`,`misread`,`missing`) | default `measured`. `misread` = chrono returned a bad/garbage value; `missing` = no reading at all. Both are treated as "estimate it" |
| | | **unique(`shot_string_id`, `shot_number`)** |
| | | **CHECK**: `velocity_fps IS NOT NULL` *iff* `velocity_status = 'measured'` |

> Estimated velocities for `misread`/`missing` shots are **computed, not stored** — see §4.4. (Endpoint-gap and stat-inclusion rules there.)

#### `targets` (accuracy — optional, separate)
| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `shot_string_id` | → shot_strings | |
| `image_path` | text | Supabase Storage path, **not** a blob |
| `group_size_in` | numeric | |
| `group_distance_yd` | numeric | **required when a target exists** — group size is meaningless without distance |
| `shot_count` | int | pellets in the paper group (accuracy metric — distinct from the velocity string's `shot_count` in §4.2/§4.4) |
| `accuracy_rating` | numeric | nullable — reserved for the future rating system |
| | | **unique(`shot_string_id`)** for v1 (one target/string). Drop this constraint later to allow many — no data migration needed. |

#### `shot_string_tank_pressures`  ← start/end pressure per tank
One row per tank used in the string. Single-tank guns = one row (the form shows a single fill-pressure field).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `shot_string_id` | → shot_strings | cascade delete |
| `tank_id` | → airgun_tanks | which tank |
| `start_pressure_psi` | numeric | |
| `end_pressure_psi` | numeric | nullable — a buffer tank unchanged start→end contributes ~0 to energy |
| | | **unique(`shot_string_id`, `tank_id`)** |

### 3.3 Engagement & growth layer

Backs the flywheel features in [`vision.md`](vision.md). Relationships laid out now so we don't repaint later; build order in §6.

#### `saved_views` (shareable URLs + embeddable widgets)
One table powers both — an embed is just a render mode of the same saved configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | short public id for the URL + iframe `src` |
| `owner_id` | → profiles | nullable — allow anonymous ad-hoc shares |
| `kind` | enum(`single`,`comparison`) | one string vs. multi-string compare |
| `title` | text | nullable |
| `config` | jsonb | the view spec: ordered `shot_string_id`s, metric (energy/velocity), unit, axis options |
| `view_count` | bigint | cheap popularity counter (bump async) |
| `created_at` | timestamptz | |

> Why `jsonb` for `config` and not a join table: a saved view is a *presentation snapshot*, not a normalized relationship — read as a blob to render a graph, never queried field-by-field. Referenced `shot_string_id`s still resolve live, so data stays current.

#### Feed (no table — a view)
The main-page feed is **a query/view over `shot_strings`**: `WHERE status='approved' ORDER BY approved_at DESC`. For editorial control later, either add `is_featured boolean` + `featured_rank int` to `shot_strings`, or a tiny `feed_entries` table. Start with the view.

#### `follows` (favorites / follows / ownership)
One polymorphic table covers "favorite this gun," "follow this creator," and "I own this pellet" — `relation` distinguishes intent, which also drives *which* notifications fire.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | → profiles | |
| `target_type` | enum(`airgun_model`,`airgun_variant`,`projectile`,`shot_string`,`creator`) | |
| `target_id` | text/uuid | id of the target (type tells you which table) |
| `relation` | enum(`favorite`,`follow`,`own`) | `own` = pellets/guns the user has; `follow` = notify on new data |
| `created_at` | timestamptz | |
| | | **unique(`user_id`,`target_type`,`target_id`,`relation`)** |

> Polymorphic `target_id` trades DB-level FK integrity for one clean table instead of five near-identical ones. Integrity enforced in app code / triggers. Alternative is per-type tables (`favorite_airgun_models`, …) — more tables, but referential safety. A real choice.
>
> `target_type = 'creator'` targets a `profiles.id` (a creator is an account capability, not a separate table). Following a creator = notify on their new approved strings.

#### `notifications`
| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | → profiles | recipient |
| `event_type` | enum(`new_string_for_follow`,`request_fulfilled`,`string_approved`,…) | |
| `payload` | jsonb | denormalized render data (gun name, string id, link) |
| `read_at` | timestamptz | null = unread |
| `created_at` | timestamptz | |

#### `notification_preferences`
| Column | Type | Notes |
|---|---|---|
| `user_id` | → profiles | |
| `event_type` | enum(…) | same set as above |
| `email` | bool | deliver via email |
| `in_app` | bool | deliver in-app |
| | | **PK(`user_id`,`event_type`)** |

> **Email list & consent** (the market-research asset is opt-in): consent flag lives on `profiles` (`email_opt_in`, `email_consent_at`). Actual blast delivery/segmentation likely lives in an external ESP (Resend/Mailchimp); we own the consent flag + the interest data (`follows`) that defines segments. New-string blasts = approved strings since last send, joined to opted-in followers.

#### `shot_string_requests` (demand)
Users request combos ("this gun + this slug"); others upvote; aggregated demand routes to creators.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `requested_by` | → profiles | nullable (allow anon with captcha) |
| `airgun_variant_id` | → airgun_variants | nullable |
| `projectile_id` | → projectiles | nullable |
| `caliber_id` | → calibers | nullable |
| `note` | text | free-text for combos not in the catalog |
| `status` | enum(`open`,`fulfilled`,`declined`) | |
| `fulfilled_by_string_id` | → shot_strings | nullable — closes the loop, can notify upvoters |
| `created_at` | timestamptz | |

#### `request_votes`
| Column | Type | Notes |
|---|---|---|
| `request_id` | → shot_string_requests | |
| `user_id` | → profiles | |
| `created_at` | timestamptz | |
| | | **PK(`request_id`,`user_id`)** — one vote each; `COUNT` = demand signal |

#### `interaction_events` (market-research analytics)
Append-only event log feeding "what's hot vs. not." Powers trending guns, search-gap analysis, segmentation.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | → profiles | nullable (anon traffic) |
| `session_id` | text | ties anon events together |
| `event_type` | enum(`search`,`view_string`,`view_gun`,`compare`,`favorite`,`click_buy`,`embed_impression`,`embed_click`) | |
| `target_type` / `target_id` | text | what was acted on |
| `query_text` | text | nullable — for `search` |
| `metadata` | jsonb | extra context |
| `created_at` | timestamptz | |

> High-volume, write-heavy, never updated. Keep it **out** of the transactional path: write async, plan to partition by `created_at` (or offload to an analytics store) once volume grows. No FKs on `target_id` — it's a log, not a relationship.

#### `vendors` / `vendor_listings` (monetization / buy-links)
| `vendors` | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `name` | text | |
| `website` | text | |
| `affiliate_tag` | text | nullable — appended to product links |
| `created_at` | timestamptz | |

| `vendor_listings` | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `vendor_id` | → vendors | |
| `airgun_model_id` | → airgun_models | the gun being sold |
| `product_url` | text | affiliate/product link |
| `price` | numeric | nullable, last-known |
| `is_paid_placement` | bool | paid to be promoted |
| `placement_rank` | int | sort order (paid slots first) |
| `active` | bool | |

---

## 4. Domain logic & calculations

Derived stats (energy, efficiency, spread) are **computed, not stored** — storing them risks drift when a shot is edited. Expose via a **Postgres view** (`shot_string_stats`); add a cached/materialized table later only if leaderboards need it.

### 4.1 Calculation layer normalizes to SI
Storage units are an *entry/UX* decision; they do **not** drive the physics. All calculations route through one module that:
1. converts every input to SI (m/s, kg, Pa, m³),
2. computes in joules,
3. converts out to ft-lbs / J for display.

Rationale: the math is trivial either way (energy is one formula; conversion is one constant), so the only real risk is *silent unit-mismatch bugs* — mitigated by converting in exactly one place, not by choosing a storage unit. Efficiency forces this regardless, since it mixes PSI + cc (an incoherent pair) and must normalize. Storing entry-units also avoids double-rounding drift.

### 4.2 Energy & spread
- **Muzzle energy (ft-lbs)** = `grains × fps² ÷ 450240`
- **Per-shot energy**: derived in the view from `effective_velocity_fps` (only `measured` rows carry a stored velocity; estimates are computed, never stored — see §4.4).
- **Max energy** = from the fastest *measured* shot. **Avg / ES / SD** = across *measured* shots.
- **Counts** — `shot_count` (all rows) vs `measured_count` (good reads).

> How estimated (`misread`/`missing`) shots factor into each stat is defined in §4.4: included in total energy/efficiency, excluded from ES/SD and max.

### 4.3 Air efficiency — free-air-volume model
Headline metric: **ft-lbs per cubic inch of air**.
- **Numerator** — total kinetic energy out: `KE_total = Σ_shots (grains × fps² ÷ 450240)` ft-lbs.
- **Denominator** — free air consumed (air used, expressed as its volume at atmospheric pressure), **summed per tank**:
  `FreeAir_in³ = Σ_tanks [ V_i(in³) × (P_start_i − P_end_i) ÷ P_atm ]`
  - `V_i(in³)` = tank `volume_cc` ÷ 16.387
  - pressures are **absolute**: `P_abs = P_gauge + 14.696 psi` (matters little at fill pressures, included for correctness)
  - `P_atm = 14.696 psi`
- **Efficiency = `KE_total ÷ FreeAir_in³`** → ft-lbs per cubic inch of air. Higher = more efficient.
- Per-tank summation is mandatory — never multiply a lumped total volume by one tank's pressure drop (different tanks hold air at different energy densities). A buffer tank that returns to its start pressure contributes ~0 to `FreeAir`.
- Requires each tank's `volume_cc` (catalog) + `start/end_pressure` (submission). When that data is missing, fall back to **ft-lbs/shot** and **shots per fill** (no tank data needed).
- Regulator setpoint does **not** enter this calc — it governs shot consistency, not the total energy budget.

### 4.4 Missing & misread shots (interpolation)
Chronographs routinely fail to read a shot. The row stays (preserving shot order and count) with `velocity_status` ∈ {`misread`, `missing`} and `velocity_fps = null`. The calc layer derives, per shot, an **`effective_velocity_fps`** + an **`is_estimated`** flag in the `shot_string_stats` view (not stored — same single-source-of-truth reasoning as every other derived value):

- `measured` → the recorded `velocity_fps`; `is_estimated = false`.
- `misread` / `missing` → **linear interpolation** between the nearest `measured` shots on each side (by `shot_number`); `is_estimated = true`. Consecutive gaps interpolate across the bounding measured reads.
- **Endpoint gaps**: if a non-measured shot has no measured neighbor on one side (a gap at the very start or end of the string), leave it **unestimated** rather than extrapolate — shot-string curves bend, so extrapolating off the end fabricates unreliable data.

How estimates feed the stats (matters for fairness and honesty):
- **Energy & efficiency** — *include* estimates. The shot was fired, so its air was consumed; omitting it would understate energy out and inflate efficiency. KE/efficiency use `effective_velocity`.
- **Consistency metrics (ES, SD)** — ***measured shots only***. An interpolated point sits between its neighbors by construction, so including it would artificially smooth spread / shrink SD. These describe *measurement* consistency — only real reads belong.
- **Counts** — surface both `shot_count` (all rows) and `measured_count` (good reads) so data quality is visible.
- **Max energy** — measured-only (don't fabricate a peak).

**Data-quality flag (drives the tooltip).** The `shot_string_stats` view also exposes a per-string rollup — `uses_estimated_shots boolean` + `estimated_count int` (count of shots that fed energy/efficiency via interpolation). When true, the UI shows a small indicator/tooltip on that string's **energy & efficiency** figures: *"Includes N estimated shot(s) — the chrono didn't read every shot, so these numbers rely on interpolated data."* This keeps the headline numbers honest and self-explaining without hiding them.

UI: render estimated *points* distinctly too (dashed/hollow marker, "estimated" in the tooltip) so the curve stays continuous while remaining auditable against the source video.

---

## 5. Auth, accounts & ownership

### 5.1 Accounts
Single `profiles` table mirroring `auth.users`; `is_admin` gates moderation/catalog approval. A "creator" is **not** a separate account type — it's a capability: any profile that has submitted strings or claimed a YouTube channel. Accelerated social sign-in (Google/Apple/Facebook) reduces friction and captures emails.

### 5.2 Channel claiming — credit vs. control
The dashboard = "my videos, and the shot strings on each." The core principle:
- **Credit** = who entered the data (`shot_strings.submitted_by`, `videos.submitted_by`). **Immutable.** Always retained, even after a claim.
- **Control/ownership** = who can manage the video and its strings. **Derived from channel ownership** (`youtube_channels.owner_id`), so it transfers in a single write when a creator claims their channel — no rows rewritten.

Flow: anyone can submit a string from anyone's video (e.g. helping a YouTuber out), credited to the submitter. Later the real channel owner signs in, verifies, and **claims the channel** — every video on it (past *and future*) becomes theirs to control, while original submitters keep visible "contributed by" credit. Claiming is **channel-scoped, not video-scoped**, so one act covers future submissions too; this is why `videos.youtube_channel_id` is captured at ingest. A single claim can transfer strings from *several* submitters at once → notify each affected submitter.

### 5.3 Verification
Primary path is **Google/YouTube OAuth** — the authenticated user's channel id is compared to the video's stored `youtube_channel_id`; a match is self-proving. **Manual fallback**: admin verifies a code dropped in the channel's About page. An admin can **reverse** a disputed claim (sets `owner_id` back to null). Use the immutable channel id (`UC…`), never the @handle.

### 5.4 Row-level security (RLS sketch)
- **Catalog tables**: `SELECT` where `status = 'approved'` for everyone; `INSERT` as `pending` for authenticated users (suggest-new); `UPDATE`/approve only for `is_admin`.
- **shot_strings**: public `SELECT` where `status = 'approved'`. **Write/manage** if you're the `submitted_by` **OR** you own the video's channel (`youtube_channels.owner_id = auth.uid()`) — this is how control transfers on a claim without rewriting rows. Admins read all + change `status`.
- **shots / targets**: follow their parent string's visibility + the same write rule.
- **Storage** (target images): authenticated upload to own folder; public read for images tied to approved strings.
- **videos**: public `SELECT`; write if `submitted_by = auth.uid()` OR you own the channel; admins all.
- **youtube_channels**: public `SELECT`; claim flow (set `owner_id`) gated behind verified OAuth match or admin; only admins reverse a claim.
- **follows / notifications / notification_preferences**: owner-only (`user_id = auth.uid()`) read + write.
- **saved_views**: public `SELECT` by `slug` (needed for share links & embeds); owner writes; anonymous shares allowed (null owner).
- **shot_string_requests / request_votes**: public `SELECT` (aggregated demand is visible); authenticated `INSERT`; one vote per user via PK; admins set `status`/`fulfilled_by`.
- **interaction_events**: `INSERT`-only for everyone (incl. anon); no public `SELECT` — admin/service-role reads only.
- **vendors / vendor_listings**: public `SELECT` where `active`; admin-only writes.

---

## 6. Feature phasing

The schema is laid out whole, but build in phases so MVP isn't blocked:

- **MVP** — catalog, submission core (`videos` → `shot_strings` → `shots` → tank pressures), the calc layer, exploration/compare graphs, source-video links.
- **MVP-adjacent** — `saved_views` (shareable URLs + embeds), the feed view, channel claiming.
- **Phase 2 (engagement)** — `follows`, `notifications`, `notification_preferences`, email consent + blasts.
- **Phase 3 (demand + research)** — `shot_string_requests`, `request_votes`, `interaction_events`.
- **Phase 4 (monetization)** — `vendors`, `vendor_listings`.

Build-order suggestion when implementing: catalog tables → submission core → RLS → seed data (calibers, a few brands/guns) → calc view → engagement layers as phased.

---

## 7. Resolved / open

### Implementation status (MVP)
Applied to Supabase project `kvjobezpudugjjjcokee` as migrations `mvp_01_enums` → `mvp_08_security_hardening`:
- **Built:** all §3.1 catalog + §3.2 submission tables, `profiles` + signup trigger, the `shot_string_stats` view (security_invoker), full RLS, a moderation-integrity trigger (non-admins can't change `status`), and security hardening (no self-claim; trigger fns not RPC-exposed).
- **Seeded:** calibers; a starter FX Impact M3 (.25) + JSB pellets; one approved sample string (16 shots, one `missing` to exercise interpolation). A seed/admin user `00000000-…-05ee` owns it — **remove before production.**
- **Deliberately app-layer (not in the DB view):** the SI calc layer (§4.1), per-shot interpolation/`effective_velocity` (§4.4), total-KE-with-estimates, and the air-efficiency number (§4.3). The view exposes measured-only stats + the `uses_estimated_shots` flag; the app computes the rest.
- **Deferred:** `targets` and the entire §3.3 engagement/growth layer (later phases; non-breaking adds).
- **Known advisor notes:** 4 RLS-helper SECURITY DEFINER functions are RPC-callable (benign, boolean, caller-scoped) — silence later via a `private` schema; enable leaked-password protection in the Auth dashboard before real signups.

### Resolved
- **Units** — store per-submission-entry units (table in §2), convert in UI; physics normalizes to SI in one calc layer (§4.1).
- **Targets** — one per string in v1 via `unique(shot_string_id)`; drop later for multiple, no migration.
- **Chrono distance** — `shot_strings.chrono_distance_in`.
- **Shot entry UX** — editable grid with bulk-paste; backend is a batch insert into `shots`, no schema impact.
- **Fill source** — out of scope for v1.
- **Humidity / barometric pressure** — out for v1; nullable columns addable later via non-breaking `ALTER TABLE`.
- **Multi-tank guns** — `airgun_tanks` + `shot_string_tank_pressures`; energy summed per tank (§4.3).
- **Chrono misreads / unread shots** — shots are nullable with a `velocity_status` flag (`measured`/`misread`/`missing`); unread shots are kept, estimated by interpolation in the calc layer, counted in energy/efficiency but excluded from ES/SD. Endpoint gaps left unestimated; a per-string `uses_estimated_shots` flag drives a data-quality tooltip on the energy/efficiency figures. Raw misread values are not retained (§4.4).
- **Video ownership & channel claiming** — credit ≠ control; channel-scoped claim via OAuth (§5).
- **Efficiency formula** — free-air-volume model, **ft-lbs per cubic inch of air** (§4.3).

### Still open
- **Monetization specifics** — affiliate vs. paid placement vs. discounts (structure modeled; business terms TBD).
- **Notification event catalog** — exact set of `event_type`s and email-blast cadence/dedup logic.
- **ESP choice** — Resend vs. Mailchimp vs. other for email delivery/segmentation.
- *(Nothing blocking schema migrations — the data model is ready to draft.)*
