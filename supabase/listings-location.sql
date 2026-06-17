-- Run in Supabase SQL Editor after schema.sql (adds location fields for Google Maps)

alter table public.listings
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
