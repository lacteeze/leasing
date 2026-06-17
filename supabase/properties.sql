-- Run in Supabase SQL Editor after schema.sql

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

create index if not exists property_photos_property_id_idx on public.property_photos (property_id);
create index if not exists properties_created_by_idx on public.properties (created_by);
create index if not exists properties_occupancy_status_idx on public.properties (occupancy_status);
create unique index if not exists properties_owner_property_code_idx
  on public.properties (created_by, property_code)
  where property_code is not null;

alter table public.properties enable row level security;
alter table public.property_photos enable row level security;

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
