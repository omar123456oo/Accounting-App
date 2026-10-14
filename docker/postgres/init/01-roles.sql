-- Local development only: placeholder passwords. Production uses a secret store.
-- acct_owner runs migrations and seeders. It has BYPASSRLS so those can write across tenants; it is NOT used by the app.
-- acct_app is what the application connects as: no BYPASSRLS, owns no tables, so row-level security always applies.
CREATE ROLE acct_owner LOGIN PASSWORD 'owner_dev_only' CREATEDB BYPASSRLS;
CREATE ROLE acct_app   LOGIN PASSWORD 'app_dev_only' NOBYPASSRLS NOSUPERUSER;

CREATE DATABASE accounting OWNER acct_owner;
CREATE DATABASE accounting_test OWNER acct_owner;

\c accounting
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT CONNECT ON DATABASE accounting TO acct_app;
GRANT USAGE ON SCHEMA public TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO acct_app;

\c accounting_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT CONNECT ON DATABASE accounting_test TO acct_app;
GRANT USAGE ON SCHEMA public TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO acct_app;
