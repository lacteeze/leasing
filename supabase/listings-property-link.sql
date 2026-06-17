-- Run in Supabase SQL Editor after properties.sql

alter table public.listings
  add column if not exists property_id uuid references public.properties (id) on delete set null;

alter table public.listings
  add column if not exists source_listing_id uuid references public.listings (id) on delete set null;

create index if not exists listings_property_id_idx on public.listings (property_id);

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('ACTIVE', 'DRAFT', 'ARCHIVED'));

drop policy if exists "Managers can delete own portfolio or archived listings" on public.listings;
drop policy if exists "Managers can delete own archived listings" on public.listings;

create policy "Managers can delete own archived listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = created_by and status = 'ARCHIVED');
