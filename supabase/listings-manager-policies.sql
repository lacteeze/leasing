-- Run in Supabase SQL Editor after schema.sql
-- Lets managers read, archive, and delete their own listings

create policy "Managers can read own listings"
  on public.listings for select
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers can delete own archived listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = created_by and status = 'ARCHIVED');

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
