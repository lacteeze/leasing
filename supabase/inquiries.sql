-- Run in Supabase SQL Editor after schema.sql

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  property_ref text,
  property_title text,
  inquiry_type text not null default 'VIEWING_REQUEST'
    check (inquiry_type in ('VIEWING_REQUEST', 'LONG_TERM_RENTAL', 'SHORT_TERM_BOOKING')),
  status text not null default 'NEW'
    check (status in ('NEW', 'CONTACTED', 'APPLICATION_SENT', 'SIGNED')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  min_bedrooms integer,
  min_bathrooms numeric(3, 1),
  min_parking integer,
  pets text,
  move_in_date date,
  other_details text,
  lease_type text,
  max_price numeric,
  preferred_viewing_date date,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiries_status_idx on public.inquiries (status);
create index if not exists inquiries_listing_id_idx on public.inquiries (listing_id);
create index if not exists inquiries_property_ref_idx on public.inquiries (property_ref);
create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

create policy "Anyone can submit an inquiry"
  on public.inquiries for insert
  with check (true);

create policy "Authenticated managers can read inquiries"
  on public.inquiries for select
  to authenticated
  using (true);

create policy "Authenticated managers can update inquiries"
  on public.inquiries for update
  to authenticated
  using (true);
