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
