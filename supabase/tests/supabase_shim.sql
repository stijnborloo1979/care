-- =====================================================================
--  Alleen voor lokale tests en CI — NOOIT in Supabase draaien.
--
--  Bootst het deel van Supabase na waar de migraties op leunen: de rollen
--  anon / authenticated / service_role, auth.uid() uit de JWT-claims,
--  auth.users, storage.buckets / storage.objects / storage.foldername(),
--  de publicatie supabase_realtime en de standaardrechten die Supabase op
--  het schema public zet. Die laatste zijn belangrijk: zonder ze zou een
--  functie zonder revoke hier veiliger lijken dan in het echte project.
-- =====================================================================

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
alter database current_database_placeholder set search_path = public, extensions;

-- ---- auth -----------------------------------------------------------
create schema if not exists auth;
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ---- storage --------------------------------------------------------
create schema if not exists storage;
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);
create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

-- Zoals in Supabase: de mappen van een pad, zonder de bestandsnaam.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;
create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[array_length(_parts, 1)];
end $$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

-- ---- realtime -------------------------------------------------------
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

-- ---- de standaardrechten van Supabase op public -----------------------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
