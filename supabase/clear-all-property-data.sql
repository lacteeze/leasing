-- Optional: wipe all property data in Supabase (run in SQL Editor).
-- Listings keep their rows but property_id is set to null.
-- Prefer the in-app "Clear all properties" button when signed in as the owner.

delete from public.leases;
delete from public.property_photos;
delete from public.properties;

-- Or delete only your rows (replace with your auth user id):
-- delete from public.properties where created_by = 'YOUR-USER-UUID';
