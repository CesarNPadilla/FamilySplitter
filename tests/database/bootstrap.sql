-- TEST HARNESS ONLY. Minimal Supabase Auth contract for a disposable PostgreSQL
-- instance. Do not run this file on a Supabase project or existing database.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
revoke all on auth.users from anon, authenticated;

-- Reproduce permissive API-role defaults so the migration must close them.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges grant all on functions to anon, authenticated;
