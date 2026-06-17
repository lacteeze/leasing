-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  type text not null check (type in ('SINGLE', 'MULTI', 'SHORT_TERM')),
  area text,
  address text,
  city text,
  province text default 'NL',
  postal text,
  latitude double precision,
  longitude double precision,
  rate numeric not null default 0,
  cleaning numeric not null default 0,
  beds integer not null default 0,
  baths integer not null default 0,
  sqft integer not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  features jsonb not null default '[]'::jsonb,
  description text,
  parking integer not null default 0,
  pet_friendly boolean not null default false,
  dogs boolean not null default false,
  cats boolean not null default false,
  utilities_included boolean not null default false,
  utility_types jsonb not null default '[]'::jsonb,
  utility_cap integer not null default 0,
  year_built integer,
  storeys integer,
  heating_type text,
  water_heater text,
  firewall boolean not null default false,
  power_meter text,
  oil_company text,
  internal_notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listing_photos_listing_id_idx on public.listing_photos (listing_id);
create index if not exists listings_status_idx on public.listings (status);

alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

create policy "Public can read active listings"
  on public.listings for select
  using (status = 'ACTIVE');

create policy "Managers can insert listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Managers can update own listings"
  on public.listings for update
  to authenticated
  using (auth.uid() = created_by);

create policy "Public can read listing photos"
  on public.listing_photos for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status = 'ACTIVE'
    )
  );

create policy "Managers can insert listing photos"
  on public.listing_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

-- Storage bucket for uploaded listing photos
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

create policy "Public read listing photos bucket"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

create policy "Authenticated upload listing photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Authenticated delete own listing photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
