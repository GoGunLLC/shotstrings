# Supabase migrations

Migrations applied to the ShotStrings database (project `kvjobezpudugjjjcokee`).

> **Note on history:** `mvp_01`–`mvp_08` (enums, catalog + submission tables,
> `profiles` + signup trigger, the `shot_string_stats` view, RLS, moderation
> trigger, and security hardening) were applied directly to the project and are
> not reproduced here. Migration files are tracked starting at `mvp_09`. To dump
> the full live schema for the record, run `supabase db pull` (or
> `pg_dump --schema-only`) against the project.

| Migration | Summary |
|---|---|
| `mvp_09_catalog_insert_no_self_approve` | Catalog INSERT policies: non-admins can only insert `pending` rows; admins may self-approve. |
| `mvp_10_admin_catalog_merge` | Admin-only atomic merge functions (`admin_merge_brand/model/projectile/moderator`) for the catalog Manage tab: repoint children onto a target record, then delete the source, in one transaction. |
| `mvp_16_submission_notify` | Enables `pg_net`; adds an AFTER INSERT trigger (`notify_submission`) on `shot_strings` + the five catalog tables that POSTs new, unreviewed rows to the `submission-notify` edge function, which emails the admin a deep link to the item. Config (URL + shared secret) is read from Vault; no-op if unset. |
