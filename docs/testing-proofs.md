# Layered local proofs

Use the smallest proof that can answer the question. Every command writes a redacted log and
`summary.json` under `test-report/proofs/` so a failure is attributable to one layer.

| Command | Proves | Does not require |
| --- | --- | --- |
| `pnpm prove:api` | Migrations, API contracts, persistence, and job enqueueing | Browser, Electron, real model credentials |
| `pnpm prove:worker` | Scripted model execution, tools, retries, and run state transitions | Browser, Electron, real model credentials |
| `pnpm prove:web` | Browser bot CRUD against an isolated API and database | Electron, real model credentials |
| `pnpm prove:desktop` | Electron launch, renderer isolation, and preload bridge | API, database, model credentials |
| `pnpm prove:local` | All deterministic proofs in dependency order | Existing local data or credentials |

The harness creates isolated Postgres containers and uses the scripted runtime or test doubles.
It never reads developer credentials from the local database. Provider and computer canaries remain
explicit opt-in commands (`pnpm test:canary`, `pnpm test:computer`) because they can consume quota
or access external systems.

When `summary.json` reports a failure, start with its `phases` entry and `proof.log`. The affected
layer, command, timestamps, exit code, and the precise test output are retained together.
