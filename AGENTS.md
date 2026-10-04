# Mdis Agent Rules

1. V1 is the only active software generation: Unity in legacy/v1/client/ and Flask/SQLite in legacy/v1/server/.
2. legacy/v1/ is active maintenance code despite its historical directory name. legacy/v0/ is read-only unless explicitly requested.
3. V2 was retired on 2026-10-04. Do not recreate apps/, Flutter/FastAPI scaffolding, or V2 infrastructure unless explicitly requested.
4. hardware/ is active engineering code. Read docs/ and applicable component instructions before architectural changes.
5. Machine control happens locally on the client.
6. Never blindly retry physical dispensing commands; ambiguous outcomes require manual verification.
7. Derive server-side access from authenticated identity and authorization. Never trust a client-provided nursing-home ID as authorization.
8. Do not assume that V1 implements the retired V2 membership, tenancy, outbox, or session designs.
9. Business state and sync state are separate concerns; describe current behavior from current V1 code.
10. Do not infer current behavior from legacy/v0 or frozen baseline tags.
11. Preserve existing V1 changes and keep maintenance, feature, and deployment work in separate commits. Use the pill-dispenser virtual environment for V1 server Python commands.
12. Do not commit patient data, databases, secrets, SDKs, build output, or local backups. Do not rewrite published history when retiring a generation.
