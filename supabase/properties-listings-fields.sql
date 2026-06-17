-- Run in Supabase SQL Editor after schema.sql / properties.sql

alter table public.properties add column if not exists offices integer not null default 0;
alter table public.listings add column if not exists offices integer not null default 0;

alter table public.properties add column if not exists electric_company text default 'NL Power';
alter table public.listings add column if not exists electric_company text default 'NL Power';

alter table public.properties add column if not exists heating_types jsonb not null default '[]'::jsonb;
alter table public.listings add column if not exists heating_types jsonb not null default '[]'::jsonb;

alter table public.properties add column if not exists parking_type text not null default 'OFF_STREET';
alter table public.listings add column if not exists parking_type text not null default 'OFF_STREET';

update public.properties
set heating_types = jsonb_build_array(heating_type)
where heating_types = '[]'::jsonb
  and heating_type is not null
  and btrim(heating_type) <> '';

update public.listings
set heating_types = jsonb_build_array(heating_type)
where heating_types = '[]'::jsonb
  and heating_type is not null
  and btrim(heating_type) <> '';

update public.properties
set electric_company = 'NL Power'
where electric_company is null or btrim(electric_company) = '';

update public.listings
set electric_company = 'NL Power'
where electric_company is null or btrim(electric_company) = '';

do $$
begin
  alter table public.properties
    add constraint properties_parking_type_check
    check (parking_type in ('ON_STREET', 'OFF_STREET', 'GARAGE'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.listings
    add constraint listings_parking_type_check
    check (parking_type in ('ON_STREET', 'OFF_STREET', 'GARAGE'));
exception
  when duplicate_object then null;
end $$;
