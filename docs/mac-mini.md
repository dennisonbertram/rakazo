# Moving Praci to a Mac mini

This runbook moves a Praci that runs from a source checkout (`pnpm dev`) on a laptop to a Mac mini that runs the production Compose stack, stays on, and is updated on purpose. Phones, laptops and MCP clients reach it over Tailscale. Development continues on the laptop against its own database.

Every command comes from [self-host.md](self-host.md), `infra/compose/docker-compose.prod.yml`, `infra/compose/Caddyfile.prod`, `.env.example` or `scripts/s3-objects.mjs`. Each step names the section it relies on. A step marked **Unverified** was not run on a Mac mini. The data-move steps (sections 3.1 to 3.4) and the Compose configuration were rehearsed on a laptop against throwaway containers; each step says what that covered.

Placeholders: `<deploy-dir>` (absolute path of the checkout on the mini), `<fork-url>`, `<commit>` (full commit hash), `<mini-hostname>`, `<tailnet>`, `<mini-user>`, `<db-name>`, `<laptop-postgres-container>`.

## 0. Decide before starting

- **Which commit.** The mini must run a commit that contains every database migration the laptop database already has. Use the laptop checkout's `HEAD` (push it to the fork first). Check both counts match or the mini is ahead:

  ```bash
  ls packages/db/prisma/migrations | grep -c .          # in the checkout you will deploy
  # on the laptop database (step 3.1 shows how to run psql there):
  select count(*) from _prisma_migrations;
  ```

  Migrations only move forward. A database that is ahead of the code is not supported (see [Upgrade](self-host.md#upgrade)).
- **Bot computers.** The laptop uses Docker computers (`SANDBOX_PROVIDER=docker`). The base production file uses a remote provider (E2B by default) and no supervisor. Running Docker computers on the mini needs the overlay in [Docker computers on the production stack](self-host.md#docker-computers-on-the-production-stack) and a build of the `computer` image (large, slow, needs free disk). This runbook installs the base stack first. Add the overlay later as its own change, after step 2 works. **Unverified** on a Mac mini.
- **One hostname.** Pick `<mini-hostname>.<tailnet>.ts.net` now. The web origin, cookies, passkeys, Google redirect URIs and the phone's server setting all hang off it (section 4).

## 1. Mac mini prerequisites

1. **Docker.** Install OrbStack (same as the laptop) or Docker Desktop. The override file in step 2.3 uses the Compose `!override` tag, which needs a recent Compose; it was checked with v5.5.0 (`docker compose version`). Turn on "start at login" in the app so containers return after a reboot. The stack's services use `restart: unless-stopped` (`docker-compose.prod.yml`), so they start again once the Docker engine is up.
2. **git** (Xcode command line tools: `xcode-select --install`). The commands below run Node scripts inside containers, so Node is not needed on the mini.
3. **Tailscale.** Install it, sign in, and in the Tailscale admin console enable MagicDNS and HTTPS certificates. Confirm the mini's name: `tailscale status`. The name you will use is `<mini-hostname>.<tailnet>.ts.net`.
4. **Stay awake and come back after power loss.** One-time, with an administrator account:

   ```bash
   sudo pmset -a sleep 0 disksleep 0 womp 1 autorestart 1
   pmset -g | grep -E "sleep|autorestart|womp"
   ```

   `autorestart 1` starts the Mac after a power failure and `womp 1` allows wake for network access (both documented in `man pmset`). Also set System Settings, Energy, "Start up automatically after a power failure". Display sleep is fine.
5. **Auto-login.** After a restart, OrbStack and the Tailscale client start only when a user session exists. Use one dedicated user with automatic login. Automatic login is not available while FileVault is on, so with FileVault the mini will wait at the login screen after a power cut and Praci stays down until someone types the password. Decide which risk you accept. **Unverified:** whether the Tailscale variant you install starts before login.
6. **Disk.** The images, the Postgres volume, the object store and backups all live here. Leave at least 30 GB free after the first build (the laptop test used this as a safe margin; the exact build size was not measured). Check with `df -h ~` before building and before each update.
7. **No Docker socket exposure beyond need.** Do not start the `updater` profile on the mini. Updates are manual (section 5).

## 2. First install on the mini

Relies on: [Public single-VM deployment](self-host.md#public-single-vm-deployment), [Database roles](self-host.md#database-roles), [The deploy directory must be one path](self-host.md#the-deploy-directory-must-be-one-path).

### 2.1 Clone and pin

```bash
git clone <fork-url> <deploy-dir>
cd <deploy-dir>
git checkout --detach <commit>
```

Pick a `<deploy-dir>` under the mini user's home (for example `~/praci`) so Docker can share it. Use that exact absolute path every time and never move or rename the checkout: Compose resolves the relative bind mounts (`.env`, `Caddyfile.prod`) against it. `docker-compose.prod.yml` defaults the path to `/srv/rakazo`, which does not exist on macOS, so set `RAKAZO_DEPLOY_DIR=<deploy-dir>` in `.env`. Only the updater sidecar uses it, but the backup script in section 6 reads it too.

### 2.2 Write `.env`

Start from `.env.example`. Do not copy the laptop `.env` wholesale: it holds laptop addresses and a host-run `DATABASE_URL`. The production file builds its own `DATABASE_URL` from the values below.

Values that **must be copied unchanged from the laptop** (section 3.3 explains why):

- `ENCRYPTION_KEY`
- `BETTER_AUTH_SECRET`
- provider and integration keys the product reads from the environment (for example `OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`, `E2B_API_KEY`, the Google, Mercury or Brex settings if they are in `.env`). Credentials entered in the app are in the database and arrive with the dump.

Values that must be **new** on the mini (`openssl rand -hex 16` for passwords, longer for tokens):

```env
POSTGRES_PASSWORD=<new, URI-safe>
POSTGRES_APP_PASSWORD=<new, URI-safe, different from the owner password>
SCREEN_PROXY_SECRET=<new, 32+ chars, different from the two secrets above>
```

`SCREEN_PROXY_SECRET` only signs short-lived screen capabilities, so a new value is safe. `POSTGRES_APP_PASSWORD` is required: Compose stops at config validation without it. (The self-host guide's step list for the public VM omits it.)

Production settings:

```env
NODE_ENV=production
RAKAZO_DEPLOY_DIR=<deploy-dir>
RAKAZO_IMAGE_TAG=local
RAKAZO_HOST=<mini-hostname>.<tailnet>.ts.net
BETTER_AUTH_URL=https://<mini-hostname>.<tailnet>.ts.net
WEB_ORIGIN=https://<mini-hostname>.<tailnet>.ts.net
API_URL=https://<mini-hostname>.<tailnet>.ts.net
SIGNUPS_ENABLED=false
```

Use the bundled object store (see 3.2): add

```env
COMPOSE_PROFILES=bundled-s3
RAKAZO_S3_ENDPOINT=http://seaweedfs:8333
RAKAZO_S3_BUCKET=rakazo
RAKAZO_S3_FORCE_PATH_STYLE=true
RAKAZO_S3_ACCESS_KEY_ID=<new, letters and digits, 8+ chars>
RAKAZO_S3_SECRET_ACCESS_KEY=<new, letters and digits, 8+ chars>
```

(from [Object storage](self-host.md#object-storage-for-artifacts-and-agent-homes), "docker-compose.prod.yml ... do not edit .env"). Do not change these two credentials after the store has first started.

Protect the file: `chmod 600 .env`. It is excluded from Git and from the Docker build context. **Back up `.env` to a password manager now.** Without `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`, a database backup cannot be read.

### 2.3 Serve over Tailscale (HTTPS)

`Caddyfile.prod` serves `{$RAKAZO_HOST}` and asks Let's Encrypt for a certificate. A tailnet-only machine cannot complete that challenge, and the phone needs HTTPS ([Connect mobile clients](self-host.md#connect-mobile-clients)). So terminate TLS with `tailscale serve` and run Caddy as a plain-HTTP router on a loopback port.

`Caddyfile.prod` already routes `/mcp` and `/.well-known/oauth-*` to the API, so the copy needs only the first-line change.

1. Copy the Caddyfile outside the checkout so a `git checkout` never overwrites it:

   ```bash
   mkdir -p ~/praci-config
   cp infra/compose/Caddyfile.prod ~/praci-config/Caddyfile.mini
   ```

2. Edit the copy. Change the first site line to `http://:80 {` (plain HTTP inside the container, no certificate request). A copy with only this change passed `caddy validate`. `/mcp` through Caddy and Serve is **Unverified**.
3. Point Compose at it and publish Caddy only on loopback. Create `~/praci-config/mini.override.yml`:

   ```yaml
   services:
     caddy:
       ports: !override
         - "127.0.0.1:8080:80"
   ```

   `docker compose ... -f ~/praci-config/mini.override.yml config` showed one published port (`8080`) instead of the three in the base file.
4. Add to `.env`:

   ```env
   CADDYFILE_PATH=<absolute path of ~/praci-config/Caddyfile.mini>
   ```

5. After the stack is up (2.5), publish it on the tailnet:

   ```bash
   tailscale serve --bg http://127.0.0.1:8080
   tailscale serve status
   ```

   `tailscale serve --bg <target>` is in `tailscale serve --help`. Serving a loopback port over HTTPS on 443 and the certificate for the `ts.net` name were **Unverified**: no tailnet was touched in the laptop test.

From now on every Compose command on the mini includes both files. Define a shell alias or a small script and use it everywhere:

```bash
cd <deploy-dir>
dc() { docker compose --env-file <deploy-dir>/.env \
  -f <deploy-dir>/infra/compose/docker-compose.prod.yml \
  -f ~/praci-config/mini.override.yml "$@"; }
```

(`dc` is used below. In a script, write the full command.) Check before building: `dc config --quiet && echo ok`. This passed with a placeholder `.env` that had the keys above.

### 2.4 Build, start Postgres only, restore, then start everything

The data goes in before the first full start so `migrate` sees an existing history.

```bash
df -h ~                                     # at least 30 GB free
cd <deploy-dir>
dc build --build-arg GIT_SHA=$(git rev-parse HEAD)
dc up -d --wait --pull never postgres seaweedfs
```

(`build --build-arg GIT_SHA=...` is the documented form in [Public single-VM deployment](self-host.md#public-single-vm-deployment); `GIT_SHA` makes `/internal/health` report the revision.) Do not build the `computer` image for this step; the base file has none.

Now restore the database (3.1 and 3.2), then start everything:

```bash
dc up -d --wait --pull never
curl --fail http://127.0.0.1:8080/health
curl --fail https://<mini-hostname>.<tailnet>.ts.net/health      # from another tailnet device
```

`migrate` (a one-shot service) applies any migrations the restored database lacks, creates the `rakazo_app` login and exits. The API starts only after it succeeds. Then copy the objects (3.3) and run the checks in 3.4 and 2.5.

### 2.5 Confirm row-level security is enforced

This is what the laptop setup lacked (one `DATABASE_URL`, so it warned "row-level security is not enforced").

```bash
dc logs migrate | grep -iE "Runtime login is ready|WARNING"
```

Expected: `Runtime login is ready (member of rakazo_app).` and no `WARNING` line. Then prove the app login cannot see rows without a Space (this ran against a restored copy on the laptop and returned 0 for the app login and the real count for the owner):

```bash
dc exec -e PGPASSWORD="$(sed -n 's/^POSTGRES_APP_PASSWORD=//p' .env)" postgres \
  psql -h 127.0.0.1 -U rakazo_app -d rakazo -Atc 'select count(*) from "threads"'
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"threads\""'
```

The first number should be `0`, the second the real row count. If a feature misbehaves under RLS, [Upgrading to the separate app database login](self-host.md#upgrading-to-the-separate-app-database-login) describes `ALTER ROLE ... BYPASSRLS` as a last resort; do not use it unless you have to.

## 3. Move the data

Relies on: [Backup](self-host.md#backup), [Restore](self-host.md#restore), [Object storage](self-host.md#object-storage-for-artifacts-and-agent-homes), `scripts/s3-objects.mjs`, `infra/compose/backup-prod.sh`.

`scripts/restore.sh` is for the development Compose stack and does not read a production snapshot ([Restore](self-host.md#restore)), so these steps use `pg_restore` directly.

**Freeze the laptop first.** For the real cutover, stop `pnpm dev` (web, API and worker) before dumping, so nothing writes after the snapshot. For a rehearsal you can dump while it runs; `pg_dump` takes a consistent snapshot.

### 3.1 Dump the laptop database (read-only)

The Postgres cluster can hold several databases. Use the one named at the end of the laptop `.env` `DATABASE_URL` (`<db-name>`). Check you picked the right one: a stale database from an earlier branch has far fewer rows in `_prisma_migrations`.

```bash
docker exec <laptop-postgres-container> psql -U <owner> -d <db-name> -Atc \
  'select count(*), count(*) filter (where finished_at is null) from _prisma_migrations'
docker exec <laptop-postgres-container> \
  pg_dump --format=custom --no-owner --no-privileges -U <owner> <db-name> > rakazo.dump
```

`<owner>` is the owner login, not `rakazo_app`; the app login would dump only the rows it can see ([Database roles](self-host.md#database-roles)). The second number must be `0`: a migration that failed earlier blocks every later migration (Prisma error P3009). If it is not `0`, fix that first (see 5.5). Running `pg_dump` inside the container uses the server's own Postgres version.

Copy it to the mini over Tailscale (`scp rakazo.dump <mini-user>@<mini-hostname>:`). The dump holds your data, so delete it on both machines when step 3.4 passes.

### 3.2 Restore into the mini's Postgres

With `postgres` running and the target database still empty (2.4):

```bash
dc exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < rakazo.dump
```

Wait until Postgres accepts connections twice: the first start of the official image runs a temporary server and then restarts. A `pg_isready` that succeeds immediately can be the temporary server. `dc up --wait postgres` waits for the healthcheck, which avoids this.

Rehearsed on the laptop: a real database restored into a fresh `pgvector/pgvector:pg16-trixie` container with exit code 0. The extension, the job-queue schema and all tables came across. A following `pnpm db:migrate` against it reported "No pending migrations to apply" and created the runtime login.

### 3.3 Copy object storage (MinIO to the mini's store)

`scripts/s3-objects.mjs` exports every object under `RAKAZO_S3_*` and restores them with a manifest check. It never deletes.

On the laptop, in the checkout, with the laptop `.env` (MinIO on `http://127.0.0.1:9000`):

```bash
node scripts/s3-objects.mjs backup <objects-dir> --dotenv .env
```

Rehearsed: a full bucket export took under a minute. Copy `<objects-dir>` to the mini (`rsync -a <objects-dir>/ <mini-user>@<mini-hostname>:objects/`).

On the mini, restore into the running stack. The bundled store is not published on the host, so run the script in a throwaway container that shares the API container's network, like `backup-prod.sh` does for backups:

```bash
api=$(dc ps -q api)       # the API container must be running (after the full start in 2.4)
img=$(docker inspect "$api" --format '{{.Image}}')
docker run --rm --network "container:$api" --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --entrypoint node \
  -v <deploy-dir>/scripts/s3-objects.mjs:/s3-objects.mjs:ro \
  -v <objects-dir>:/in:ro \
  --env-file <(docker inspect "$api" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^RAKAZO_S3_') \
  "$img" /s3-objects.mjs restore /in
```

The restore and its verification ran against a throwaway MinIO container on the laptop and reported every object restored. Restoring into the mini's SeaweedFS through the container network is **Unverified**; the container pattern is copied from `backup-prod.sh`. If `--env-file <(...)` is rejected on your Docker, write the `RAKAZO_S3_*` lines to a mode-600 temporary file, pass that, and delete it.

Do not point the mini at the laptop's MinIO instead. It is a container on a laptop that sleeps.

**Agent homes and `DATA_DIR` files.** The laptop `DATA_DIR` (`./data`) can hold agent homes, home revisions and push tokens. With object storage on, homes are read from the bucket, but a Docker computer mounts its working copy under `DATA_DIR/homes` ([Other deployment layouts](self-host.md#other-deployment-layouts)). If `data/` is non-empty and you need it, copy it into the mini's `appdata` volume. The volume is named `<project>_appdata`; the project name for this file is `rakazo-prod` (`name:` in `docker-compose.prod.yml`):

```bash
docker run --rm --user root -v rakazo-prod_appdata:/data -v <data-dir-copy>:/src:ro \
  --entrypoint sh <any-local-image-with-sh> -c 'cp -a /src/. /data/ && chown -R 1000:1000 /data'
```

`1000` is the `node` user the application image runs as (`USER node` in `infra/compose/Dockerfile`). **Unverified** for this exact copy. Skip it if the folder only holds caches.

### 3.4 Check the move

Compare counts between the laptop database and the mini for a few tables that matter to you. Counts only; do not print rows.

```bash
Q='select (select count(*) from "user"), (select count(*) from "space_members"), (select count(*) from "_prisma_migrations"), (select count(*) from "threads"), (select count(*) from "messages")'
docker exec <laptop-postgres-container> psql -U <owner> -d <db-name> -Atc "$Q"
dc exec postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc '$Q'"
```

Rehearsal result: all six counts I compared (users, space members, migrations, model credentials, threads, messages) were identical between the laptop database and the restored copy. Then sign in on the mini and open one connected integration to confirm stored credentials decrypt (3.5).

### 3.5 Keys that must match, and what breaks if they do not

| Setting | Where it is used | If it differs on the mini |
| --- | --- | --- |
| `ENCRYPTION_KEY` | Seals credentials in the secret store (model keys and sign-ins, integration tokens, Google client settings, Mercury/Brex tokens entered in the app), and the Pipedream identity secret (`packages/adapters/src/secrets.ts`, `apps/api/src/app.ts`). | Every stored credential fails to decrypt. Integrations show as disconnected or error until each is entered again. The data is not recoverable with the wrong key. |
| `BETTER_AUTH_SECRET` | Signs sessions and cookies, and seals Better Auth's stored OAuth tokens (`encryptOAuthTokens: true`, `packages/auth/src/index.ts`, `packages/auth/src/token-storage.ts`). | Everyone is signed out; stored account tokens cannot be opened and the accounts must reconnect. |
| `SECRET_STORE` | Chooses encrypted store or Infisical (`.env.example`). Copy it. If it is `infisical`, copy all `INFISICAL_*` values too. | Credentials are looked up in the wrong place. |
| `SCREEN_PROXY_SECRET`, `SANDBOX_SUPERVISOR_TOKEN`, `RAKAZO_UPDATER_TOKEN` | Sign short-lived capabilities or authenticate internal services. | Safe to change. Must differ from each other and from the two secrets above (`packages/core/src/secrets-guard.ts`). |
| `POSTGRES_*`, `RAKAZO_S3_*` credentials | Connect to the stores on the mini. | Safe to change before the first start. |

These are the two keys the code uses to seal stored data. A search for other encryption or signing code found only uses of these keys, the signing secrets in the last two rows, and per-integration secrets entered in the app. The stored-credential decryption itself was not exercised on the laptop; confirm it in step 3.4.

Rotating-token risk, **Unverified**: if the laptop and the mini both hold the same sign-in for a service whose refresh token rotates (some model-subscription sign-ins do), whichever refreshes second may be signed out. Section 4.4 avoids running both.

## 4. Things that change with the new address

Replace `https://<mini-hostname>.<tailnet>.ts.net` with your origin (call it `<origin>`).

| What | Change | Source |
| --- | --- | --- |
| Web origin, auth URL, API URL | `.env`: `WEB_ORIGIN`, `BETTER_AUTH_URL`, `API_URL` all `<origin>`; `RAKAZO_HOST` the bare hostname. Restart with `dc up -d --wait --pull never`. | [Docker Compose (single machine)](self-host.md#docker-compose-single-machine) |
| Extra origins | `RAKAZO_TRUSTED_ORIGINS` only if the same app is also opened at another URL. With the prod stack only `RAKAZO_HOST` is passed to the web container, so a second hostname is rejected by the web preview server; use one hostname. | `.env.example`, `docker-compose.prod.yml`, `apps/web/vite.config.ts` |
| Google (Gmail, Calendar, Drive) | In the Google Cloud OAuth client, add the redirect URI `<origin>/integrations/google/callback` (the API builds it from `WEB_ORIGIN`, `apps/api/src/app.ts`). Existing refresh tokens keep working; the URI is needed when you connect or reconnect an account. Keep the old localhost URI while you still develop on the laptop. | `packages/adapters/src/google-connector.ts` |
| Other OAuth redirects built from the web origin | MCP servers that sign in through Praci: `<origin>/mcp/oauth/callback` (`apps/api/src/router.ts`). OpenRouter sign-in: `<origin>/models/openrouter/callback` (`apps/api/src/openrouter-oauth.ts`). Register these where the provider asks for redirect URIs. | as listed |
| Webhooks | Billing: `<origin>/api/v1/billing/webhook`; messaging platforms: `<origin>/api/v1/messaging/webhook/<platform>`. A tailnet-only host cannot receive webhooks from the internet; leave these disabled or expose them separately. Gmail push (Pub/Sub) also needs a public endpoint and stays off. | `.env.example`, [Optional: Gmail push](self-host.md#optional-gmail-push) |
| Passkeys | Bound to the host of `WEB_ORIGIN` (`passkeyRpId` in `packages/auth/src/index.ts`). A passkey made on `localhost` does not work on the `ts.net` name. Sign in with the password (`AUTH_PASSWORD_ENABLED` defaults to true), then add a new passkey on the mini's origin. Do this before you ever change the hostname again. | `packages/auth/src/index.ts` |
| Sessions | Cookies belong to the origin, so everyone signs in again once. | |
| `PUBLIC_MCP_URL` | Only for OAuth clients such as claude.ai. Leave it unset for tailnet-only use. A client on the tailnet can use a personal access token against `<origin>/mcp` (Settings, Connections; `claude mcp add --transport http praci <origin>/mcp --header "Authorization: Bearer <token>"`). For OAuth clients set `PUBLIC_MCP_URL=https://<mini-hostname>.<tailnet>.ts.net` and use Funnel as in [From the internet with Tailscale Funnel](self-host.md#from-the-internet-with-tailscale-funnel). On the mini, point Funnel at the Caddy port, not the API: `tailscale funnel --bg --set-path /mcp http://127.0.0.1:8080/mcp` (and `/.well-known`, `/api/auth/oauth2`). That section is itself marked **Unverified**, and so is Funnel next to a private Serve on the same name. | [Connect outside AI clients (MCP)](self-host.md#connect-outside-ai-clients-mcp) |
| Phone (iOS and Android) | Sign-in screen, "Use a custom server", enter `<origin>`. Changing the server signs the device out. HTTPS with a trusted certificate is required for a Tailscale name, which `tailscale serve` provides. | [Connect mobile clients](self-host.md#connect-mobile-clients) |
| Desktop app | Not covered by self-host.md: **Unverified**. The Electron app hosts the web UI; if it supports a remote server, point it at `<origin>`, otherwise open `<origin>` in a browser. | |
| Laptop `.env` | Leave `WEB_ORIGIN`, `BETTER_AUTH_URL` and `API_URL` at the laptop values, with its own database (4.4). | |

### 4.4 Do not leave two live copies

After cutover, the laptop database is a clone of the mini's data with the same Gmail, Calendar, Mercury and Brex credentials. If the laptop stack runs against it, both copies run routines, syncs and agent actions with the same accounts, and mail or approvals can be duplicated. Pick one:

- Give the laptop a fresh database and (for demo data) use `pnpm demo:up`, which starts an isolated stack with emulated services.
- Or keep the laptop database but disconnect integrations first and set `MAIL_WRITES_DISABLED=true` (listed in `docker-compose.prod.yml`'s pass-through list; **Unverified** that it covers every write path).

Keep the old laptop database untouched until the mini has run cleanly for a week; it is your fallback.

## 5. Day-to-day

Relies on: [Upgrade](self-host.md#upgrade), [Published images and tags](self-host.md#published-images-and-tags), [Updater sidecar](self-host.md#updater-sidecar).

### 5.1 Pin each build to a commit tag

The default tag `local` is rebuilt in place, so the previous image is lost the moment a new build finishes. The tag `local-<full-commit>` is produced only by the updater sidecar's fork path ([Published images and tags](self-host.md#published-images-and-tags)); a manual `up --build` does not make one. To keep a rollback target without the sidecar, set the tag yourself when you build. `RAKAZO_IMAGE_TAG` is read from `.env`, and `api`, `worker`, `web` and `migrate` all use that one image. `RAKAZO_IMAGE_TAG=local-abc123 dc config` resolved the image to `...app:local-abc123` (config check only; no build was run on the laptop).

### 5.2 Update to a new commit

Deliberately, at a quiet time:

```bash
cd <deploy-dir>
df -h ~                                          # at least 30 GB free
<run the backup script from section 6>           # first, every time
git fetch origin
git log --oneline HEAD..<new-commit>             # read what you are about to run
git status --short                               # must be clean
OLD_TAG=$(sed -n 's/^RAKAZO_IMAGE_TAG=//p' .env)
git checkout --detach <new-commit>
sed -i '' "s/^RAKAZO_IMAGE_TAG=.*/RAKAZO_IMAGE_TAG=local-$(git rev-parse HEAD)/" .env
GIT_SHA=$(git rev-parse HEAD) dc up -d --wait --pull never --build api worker web
curl --fail https://<mini-hostname>.<tailnet>.ts.net/health
dc exec api node -e "fetch('http://127.0.0.1:3100/internal/health').then(r=>r.text()).then(console.log)"
echo "previous tag: $OLD_TAG"
```

This is the documented rebuild (`GIT_SHA=... up -d --wait --pull never --build api worker web`, [Upgrade](self-host.md#upgrade)) plus the tag edit. `--wait` returns success only when the new API is healthy; the API starts after `migrate` finishes, so a failed migration keeps it unhealthy. `/internal/health` should show the new `revision`. Keep `OLD_TAG`'s image until you have used the new version for a day; do not run `docker image prune -a` meanwhile. Postgres and Caddy are not recreated by this command. If a release note says the Postgres image changes (as for pgvector), follow the matching step in [Upgrade](self-host.md#upgrade) first.

### 5.3 Roll back the code

```bash
cd <deploy-dir>
git checkout --detach <previous-commit>
sed -i '' "s/^RAKAZO_IMAGE_TAG=.*/RAKAZO_IMAGE_TAG=<old-tag>/" .env
dc up -d --wait --pull never api worker web      # no --build: reuse the existing image
```

The old image must still exist (`docker images | grep rakazo/app`). If it does not, rebuild the previous commit with 5.2's build command. Rolling back changes code only: migrations are not reversed. If the previous code runs on the newer schema, you are done. If it fails against the new schema, restore the backup (5.5) together with the old code.

### 5.4 If an update fails and you have no backup

Stop and do not run `down -v`. If Postgres is still up, run the script in section 6 now. Section 5.5 starts from a backup.

### 5.5 A migration fails

Migrations are forward-only. A failed migration leaves `migrate` exited with an error, the API unhealthy, and Prisma refusing every later migration (P3009 "found failed migrations").

1. Read the cause: `dc logs migrate`.
2. If nothing was applied and the cause is fixable (the pgvector case in [Upgrade](self-host.md#upgrade)), follow that section's `prisma migrate resolve --rolled-back <name>` recipe.
3. Otherwise go back to the pre-update backup:

   ```bash
   dc stop web worker api caddy
   dc exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   dc exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < <backup-dir>/rakazo.dump
   # roll code and tag back as in 5.3, then:
   dc up -d --wait --pull never
   ```

   Restoring into a fresh database with `pg_restore` was rehearsed (section 3.2). The `dropdb`/`createdb` steps over an existing database were **not** run. The documented restore for production snapshots is only "`pg_restore` the custom-format `rakazo.dump`" ([Restore](self-host.md#restore) covers only the development script), so this sequence is assembled from the pieces above.
4. Restore objects only if the update touched them; objects are not changed by migrations.
5. Report the failing migration name upstream before you try the commit again.

## 6. Scheduled backups and a restore test

`infra/compose/backup-prod.sh` is written for Linux: it writes to `/var/backups/rakazo`, reads the Docker volume's path from the host (inside OrbStack's VM on macOS), and calls `sha256sum`. Use this Mac version instead. It makes the same three outputs (`rakazo.dump`, `appdata.tgz`, object export) with a checksum file. The pieces (database dump through `compose exec`, a verified restore listing, and archiving a volume from a throwaway root container) were run on the laptop; the whole script, the object export step and `launchd` were **Unverified**.

Save as `~/praci-config/backup.sh`, `chmod 700`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DEPLOY_DIR="${RAKAZO_DEPLOY_DIR:?set RAKAZO_DEPLOY_DIR}"
BACKUP_ROOT="${PRACI_BACKUP_DIR:?set PRACI_BACKUP_DIR}"
KEEP_DAYS="${PRACI_BACKUP_KEEP_DAYS:-14}"
out="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$out"
compose=(docker compose --env-file "$DEPLOY_DIR/.env" -f "$DEPLOY_DIR/infra/compose/docker-compose.prod.yml")

"${compose[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$out/rakazo.dump"
"${compose[@]}" exec -T postgres pg_restore --list < "$out/rakazo.dump" > /dev/null

api="$("${compose[@]}" ps -q api)"
[[ -n "$api" ]] || { echo "api is not running" >&2; exit 1; }
vol="$(docker inspect "$api" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
pgimg="$(docker inspect "$("${compose[@]}" ps -q postgres)" --format '{{.Image}}')"
rc=0
docker run --rm --user root -v "$vol":/data:ro -v "$out":/out --entrypoint tar "$pgimg" \
  -czf /out/appdata.tgz --numeric-owner -C /data . || rc=$?
[[ "$rc" -le 1 ]] || { echo "appdata archive failed ($rc)" >&2; exit "$rc"; }   # 1 = files changed while reading

s3_env="$(docker inspect "$api" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^RAKAZO_S3_' || true)"
if [[ -n "$s3_env" ]]; then
  img="$(docker inspect "$api" --format '{{.Image}}')"
  docker run --rm --network "container:$api" --user "$(id -u):$(id -g)" \
    --cap-drop ALL --security-opt no-new-privileges --entrypoint node \
    -v "$DEPLOY_DIR/scripts/s3-objects.mjs:/s3-objects.mjs:ro" -v "$out:/out" \
    --env-file <(printf '%s\n' "$s3_env") "$img" /s3-objects.mjs backup /out
  [[ -s "$out/objects.manifest.json" ]] || { echo "no object manifest" >&2; exit 1; }
fi

( cd "$out" && shasum -a 256 rakazo.dump appdata.tgz $([[ -f objects.manifest.json ]] && echo objects.manifest.json) > SHA256SUMS )
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf -- {} +
echo "Backup written to $out"
```

`.env` is not in the snapshot. Keep it in the password manager (2.2). Copy `<backup-root>` to a second machine or encrypted cloud storage on a schedule you trust: a backup on the mini's own disk does not survive losing the mini ([Public single-VM deployment](self-host.md#public-single-vm-deployment) says the same about local snapshots).

Schedule it with `launchd`. Save as `~/Library/LaunchAgents/<reverse-dns>.praci-backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string><reverse-dns>.praci-backup</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string><backup-script-path></string></array>
  <key>EnvironmentVariables</key><dict>
    <key>RAKAZO_DEPLOY_DIR</key><string><deploy-dir></string>
    <key>PRACI_BACKUP_DIR</key><string><backup-root></string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>15</integer></dict>
  <key>StandardErrorPath</key><string><backup-root>/backup.err</string>
  <key>StandardOutPath</key><string><backup-root>/backup.out</string>
</dict></plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<reverse-dns>.praci-backup.plist
launchctl kickstart gui/$(id -u)/<reverse-dns>.praci-backup     # run once now
```

A LaunchAgent runs only while that user is logged in, so it depends on auto-login (1.5). If `docker` is not found, add the directory of your Docker CLI to `PATH`. After a missed run (mini asleep or off), `launchd` runs the job when the mini wakes. Check `backup.err` weekly, and check that the newest folder is recent.

### Restore test (monthly, on any machine with Docker)

This never touches the running stack. It is the same check used in the rehearsal.

```bash
name=praci-restore-test-$RANDOM; port=$((42000 + RANDOM % 5000))
docker run -d --name $name -e POSTGRES_USER=rakazo -e POSTGRES_PASSWORD=test -e POSTGRES_DB=rakazo \
  -p 127.0.0.1:$port:5432 pgvector/pgvector:pg16-trixie
until docker exec $name psql -U rakazo -d rakazo -Atc 'select 1' >/dev/null 2>&1; do sleep 2; done
docker exec -i $name pg_restore --exit-on-error --no-owner --no-privileges -U rakazo -d rakazo < <backup-dir>/rakazo.dump
docker exec $name psql -U rakazo -d rakazo -Atc 'select (select count(*) from "user"), (select count(*) from "threads"), (select count(*) from "_prisma_migrations")'
( cd <backup-dir> && shasum -a 256 -c SHA256SUMS )
docker rm -fv $name
```

Compare the counts with the live database. Delete the container when done. The default Postgres image tag matches the digest-pinned image in `docker-compose.prod.yml` (`pgvector/pgvector:pg16-trixie`).

## 7. What not to do

- Never run `docker compose down -v` (or `docker volume rm`/`docker system prune --volumes`) on the mini. It deletes `pgdata`, `appdata`, `seaweedfsdata` and the Caddy certificates. Stop with `dc stop` or `dc down` (no `-v`).
- Do not run the laptop dev stack and the mini against the same database or the same live accounts (4.4). Dev uses its own database.
- Do not change `ENCRYPTION_KEY` or `BETTER_AUTH_SECRET` after the data is in. Do not change the bundled store's access keys after it first starts.
- Do not run `pnpm dev`, `pnpm db:migrate` or any other source-checkout command in `<deploy-dir>`. The checkout there is only a build context. Edit code on the laptop and update the mini by commit (5.2).
- Do not move, rename or reset `<deploy-dir>` while the stack exists, or leave uncommitted edits there ([The deploy directory must be one path](self-host.md#the-deploy-directory-must-be-one-path)).
- Do not enable the `updater` profile on the mini: it holds the Docker socket and the unattended fork path fast-forwards the checkout and rebuilds.
- Do not publish Postgres or the object store on a host port, and do not open Funnel beyond the three MCP paths.
- Do not update without a fresh backup, and do not prune the previous image until the new one is accepted.
- Do not commit `.env`, the dump, the object export or any of the files in `~/praci-config` that contain secrets. This repository is public.
