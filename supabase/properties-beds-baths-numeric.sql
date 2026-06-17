-- Run in Supabase SQL Editor after properties.sql
-- Allows half-bath values (1.5, 2.5) from bulk CSV imports

alter table public.properties
  alter column baths type numeric(4,1) using baths::numeric(4,1);

alter table public.listings
  alter column baths type numeric(4,1) using baths::numeric(4,1);
