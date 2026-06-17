-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  property_code text,
  title text not null,
  type text not null check (type in ('SINGLE', 'MULTI', 'SHORT_TERM')),
  area text,
  address text,
  city text,
  province text default 'NL',
  postal text,
  latitude double precision,
  longitude double precision,
  suggested_rate numeric,
  suggested_cleaning numeric not null default 0,
  beds integer not null default 0,
  baths numeric(4,1) not null default 0,
  offices integer not null default 0,
  sqft integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  description text,
  parking integer not null default 0,
  parking_type text not null default 'OFF_STREET'
    check (parking_type in ('ON_STREET', 'OFF_STREET', 'GARAGE')),
  pet_friendly boolean not null default false,
  dogs boolean not null default false,
  cats boolean not null default false,
  utilities_included boolean not null default false,
  utility_types jsonb not null default '[]'::jsonb,
  utility_cap integer not null default 0,
  year_built integer,
  storeys integer,
  heating_type text,
  heating_types jsonb not null default '[]'::jsonb,
  water_heater text,
  firewall boolean not null default false,
  power_meter text,
  electric_company text default 'NL Power',
  oil_company text,
  internal_notes text,
  management_status text not null default 'ACTIVE'
    check (management_status in ('ACTIVE', 'ARCHIVED')),
  occupancy_status text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  tenant_name text not null,
  tenant_email text,
  tenant_phone text,
  monthly_rate numeric not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED')),
  renewal_status text not null default 'UNKNOWN'
    check (renewal_status in ('UNKNOWN', 'RENEWING', 'NOT_RENEWING')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  property_id uuid references public.properties (id) on delete set null,
  source_listing_id uuid references public.listings (id) on delete set null,
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
  baths numeric(4,1) not null default 0,
  offices integer not null default 0,
  sqft integer not null default 0,
  available_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  features jsonb not null default '[]'::jsonb,
  description text,
  parking integer not null default 0,
  parking_type text not null default 'OFF_STREET'
    check (parking_type in ('ON_STREET', 'OFF_STREET', 'GARAGE')),
  pet_friendly boolean not null default false,
  dogs boolean not null default false,
  cats boolean not null default false,
  utilities_included boolean not null default false,
  utility_types jsonb not null default '[]'::jsonb,
  utility_cap integer not null default 0,
  year_built integer,
  storeys integer,
  heating_type text,
  heating_types jsonb not null default '[]'::jsonb,
  water_heater text,
  firewall boolean not null default false,
  power_meter text,
  electric_company text default 'NL Power',
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

create index if not exists property_photos_property_id_idx on public.property_photos (property_id);
create index if not exists properties_created_by_idx on public.properties (created_by);
create index if not exists leases_property_id_idx on public.leases (property_id);
create index if not exists listings_property_id_idx on public.listings (property_id);
create index if not exists listing_photos_listing_id_idx on public.listing_photos (listing_id);
create index if not exists listings_status_idx on public.listings (status);

create unique index if not exists leases_one_active_per_property_idx
  on public.leases (property_id)
  where status = 'ACTIVE';

alter table public.properties enable row level security;
alter table public.property_photos enable row level security;
alter table public.leases enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

create policy "Managers can insert properties"
  on public.properties for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Managers can update own properties"
  on public.properties for update
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers can read own properties"
  on public.properties for select
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers can delete own properties"
  on public.properties for delete
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers can insert property photos"
  on public.property_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can read own property photos"
  on public.property_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can delete own property photos"
  on public.property_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can read leases on own properties"
  on public.leases for select
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can insert leases on own properties"
  on public.leases for insert
  to authenticated
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can update leases on own properties"
  on public.leases for update
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

create policy "Managers can delete leases on own properties"
  on public.leases for delete
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.created_by = auth.uid()
    )
  );

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

create policy "Managers can read own listings"
  on public.listings for select
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers can delete own archived listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = created_by and status = 'ARCHIVED');

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

create policy "Managers can read own listing photos"
  on public.listing_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

create policy "Managers can delete own listing photos"
  on public.listing_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

-- Storage bucket for uploaded photos
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
