# Setup

Needs Docker with Compose. Nothing else is installed on your machine for the backend.

## 1. Install Docker (Ubuntu)

Follow https://docs.docker.com/engine/install/ubuntu/, then:

```bash
sudo usermod -aG docker $USER   # log out and back in
docker run --rm hello-world
```

## 2. Build the backend

The repository holds the project's own backend files. `bootstrap-backend.sh` downloads a Laravel 11 skeleton, lays the project files over it, installs the packages and publishes the permissions migration. Run it once:

```bash
./scripts/bootstrap-backend.sh
docker compose up -d
docker compose exec app php artisan migrate --database=owner --force
docker compose exec app php artisan db:seed --class=DemoSeeder
```

`DemoSeeder` prints one password, once. It is for local development only and creates two fictional organizations with a user for every role.

Check it:

```bash
curl -s localhost:8080/api/health           # {"status":"ok"}
docker compose exec db psql -U postgres -c "select rolbypassrls from pg_roles where rolname='acct_app'"   # f
```

Why two database roles: migrations and seeders run as `acct_owner`; the application runs as `acct_app`, which cannot bypass row-level security. That is what keeps one office's data invisible to another.

### Try registration and sign-in against the API

```bash
curl -s -c jar -b jar localhost:8080/sanctum/csrf-cookie -o /dev/null
TOKEN=$(grep XSRF-TOKEN jar | awk '{print $7}' | python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))")
curl -s -b jar -c jar -H "X-XSRF-TOKEN: $TOKEN" -H "Origin: http://localhost:4200" -H "Content-Type: application/json" \
  -d '{"officeName":"My Office","name":"Me","email":"me@example.com","password":"a-long-unique-passphrase-1","passwordConfirmation":"a-long-unique-passphrase-1"}' \
  localhost:8080/api/v1/auth/register
```

The reply is `{"emailVerificationRequired":true}`. Open Mailpit (http://localhost:8025), click the link in the message, and you land on the sign-in page with a confirmation. Until then sign-in answers 422.

Endpoints: `POST /api/v1/auth/register`, `GET /api/v1/auth/verify/{id}/{hash}` (signed), `POST /api/v1/auth/verification/resend`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/mfa/setup`, `POST /api/v1/auth/mfa/confirm`. Settings: `FRONTEND_URL`, `REGISTRATION_OPEN`.

## 3. Run the frontend

```bash
cd frontend
npm ci
npm start            # in-memory mock API with demo users, no backend needed
npm run start:api    # against the real API through the dev proxy (needs step 2)
```

Open http://localhost:4200. With the mock API, sign in with the accounts in `docs/demo-credentials.json`. With the real API use the users `DemoSeeder` printed, for example `demo.owner.1@demo.test`.

## 4. Tests

```bash
docker compose exec app ./vendor/bin/pest          # backend (uses the separate accounting_test database)
cd frontend && npx ng test --watch=false           # unit tests
cd frontend && npx playwright test                 # browser tests (mock API)
./scripts/restore-drill.sh                         # backup and restore drill
```

## Other services

| Service | URL |
|---|---|
| API | http://localhost:8080 |
| API docs (local only) | http://localhost:8080/docs/api |
| Mailpit (caught e-mail) | http://localhost:8025 |
| MinIO console | http://localhost:9001 (`minio_dev` / `minio_dev_only`) |
