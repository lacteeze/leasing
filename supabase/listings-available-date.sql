-- Run in Supabase SQL Editor after schema.sql

alter table public.listings
  add column if not exists available_date date;
