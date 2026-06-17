-- Run in Supabase SQL Editor after properties.sql, leases.sql, listings-property-link.sql
-- Migrates PORTFOLIO listings into properties and links existing ACTIVE/ARCHIVED listings.

do $$
declare
  r record;
  new_property_id uuid;
begin
  for r in
    select * from public.listings
    where status = 'PORTFOLIO'
    order by created_at
  loop
    insert into public.properties (
      title, type, area, address, city, province, postal,
      latitude, longitude, suggested_rate, suggested_cleaning,
      beds, baths, sqft, features, description, parking,
      pet_friendly, dogs, cats, utilities_included, utility_types,
      utility_cap, year_built, storeys, heating_type, water_heater,
      firewall, power_meter, oil_company, internal_notes,
      created_by, created_at, updated_at
    ) values (
      r.title, r.type, r.area, r.address, r.city, r.province, r.postal,
      r.latitude, r.longitude,
      case when r.rate > 0 then r.rate else null end,
      r.cleaning,
      r.beds, r.baths, r.sqft, r.features, r.description, r.parking,
      r.pet_friendly, r.dogs, r.cats, r.utilities_included, r.utility_types,
      r.utility_cap, r.year_built, r.storeys, r.heating_type, r.water_heater,
      r.firewall, r.power_meter, r.oil_company, r.internal_notes,
      r.created_by, r.created_at, r.updated_at
    )
    returning id into new_property_id;

    insert into public.property_photos (property_id, storage_path, public_url, sort_order, created_at)
    select new_property_id, lp.storage_path, lp.public_url, lp.sort_order, lp.created_at
    from public.listing_photos lp
    where lp.listing_id = r.id;

    update public.listings
    set property_id = new_property_id
    where created_by = r.created_by
      and title = r.title
      and status in ('ACTIVE', 'ARCHIVED', 'DRAFT')
      and property_id is null;

    delete from public.listings where id = r.id;
  end loop;

  -- Link any remaining listings without property_id (no portfolio row) to new properties
  for r in
    select * from public.listings
    where property_id is null
      and status in ('ACTIVE', 'ARCHIVED', 'DRAFT')
    order by created_at
  loop
    insert into public.properties (
      title, type, area, address, city, province, postal,
      latitude, longitude, suggested_rate, suggested_cleaning,
      beds, baths, sqft, features, description, parking,
      pet_friendly, dogs, cats, utilities_included, utility_types,
      utility_cap, year_built, storeys, heating_type, water_heater,
      firewall, power_meter, oil_company, internal_notes,
      created_by, created_at, updated_at
    ) values (
      r.title, r.type, r.area, r.address, r.city, r.province, r.postal,
      r.latitude, r.longitude,
      case when r.rate > 0 then r.rate else null end,
      r.cleaning,
      r.beds, r.baths, r.sqft, r.features, r.description, r.parking,
      r.pet_friendly, r.dogs, r.cats, r.utilities_included, r.utility_types,
      r.utility_cap, r.year_built, r.storeys, r.heating_type, r.water_heater,
      r.firewall, r.power_meter, r.oil_company, r.internal_notes,
      r.created_by, r.created_at, r.updated_at
    )
    returning id into new_property_id;

    update public.listings set property_id = new_property_id where id = r.id;

    insert into public.property_photos (property_id, storage_path, public_url, sort_order, created_at)
    select new_property_id, lp.storage_path, lp.public_url, lp.sort_order, lp.created_at
    from public.listing_photos lp
    where lp.listing_id = r.id;
  end loop;
end $$;
