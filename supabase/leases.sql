-- Run in Supabase SQL Editor after properties.sql

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

create index if not exists leases_property_id_idx on public.leases (property_id);
create index if not exists leases_status_idx on public.leases (status);

create unique index if not exists leases_one_active_per_property_idx
  on public.leases (property_id)
  where status = 'ACTIVE';

alter table public.leases enable row level security;

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
