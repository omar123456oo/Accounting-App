#!/usr/bin/env bash
# One-time setup: creates the Laravel 11 skeleton, lays the project's own files over it, installs the packages.
# Needs Docker. Safe to re-run: it stops if backend/artisan already exists.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f backend/artisan ] && { echo "backend/ is already bootstrapped."; exit 0; }
command -v docker >/dev/null || { echo "Docker is required (plan Task 0)."; exit 1; }

docker compose build app
TMP=$(mktemp -d)
docker run --rm -v "$TMP:/out" -w /out composer:2 create-project laravel/laravel skeleton "^11.0" --no-interaction

# Project files win over the skeleton: -n never overwrites what is already in backend/.
cp -rn "$TMP/skeleton/." backend/
rm -rf "$TMP"
# The skeleton's users migration is replaced by the tenant-aware one in backend/database/migrations.
rm -f backend/database/migrations/0001_01_01_000000_create_users_table.php
cp -n backend/.env.example backend/.env

run() { docker compose run --rm -T app "$@"; }
run composer require laravel/sanctum pragmarx/google2fa-laravel spatie/laravel-permission dedoc/scramble mpdf/mpdf spatie/browsershot --no-interaction
run composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies --no-interaction
run php artisan key:generate
run php artisan install:api --no-interaction

# Spatie roles per organization: the team key is organization_id, so tenant isolation covers roles too.
run php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider" --no-interaction
sed -i "s/'teams' => false/'teams' => true/; s/'team_foreign_key' => 'team_id'/'team_foreign_key' => 'organization_id'/" backend/config/permission.php
# Fixed name so it always sorts between the users and the RLS migrations.
mv backend/database/migrations/*_create_permission_tables.php backend/database/migrations/2026_10_12_000005_create_permission_tables.php

echo "Next: docker compose up -d && docker compose exec app php artisan migrate --database=owner --force"
