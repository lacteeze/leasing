-- Run in Supabase SQL Editor after schema.sql / properties.sql
-- Converts pet_friendly, dogs, and cats from boolean to NO | YES | BY_APPROVAL.

alter table public.properties
  alter column pet_friendly drop default,
  alter column dogs drop default,
  alter column cats drop default;

alter table public.properties
  alter column pet_friendly type text using (
    case when pet_friendly is true then 'BY_APPROVAL' else 'NO' end
  ),
  alter column dogs type text using (
    case when dogs is true then 'BY_APPROVAL' else 'NO' end
  ),
  alter column cats type text using (
    case when cats is true then 'BY_APPROVAL' else 'NO' end
  );

alter table public.properties
  alter column pet_friendly set default 'NO',
  alter column dogs set default 'NO',
  alter column cats set default 'NO';

alter table public.properties
  drop constraint if exists properties_pet_friendly_check,
  drop constraint if exists properties_dogs_check,
  drop constraint if exists properties_cats_check;

alter table public.properties
  add constraint properties_pet_friendly_check check (pet_friendly in ('NO', 'YES', 'BY_APPROVAL')),
  add constraint properties_dogs_check check (dogs in ('NO', 'YES', 'BY_APPROVAL')),
  add constraint properties_cats_check check (cats in ('NO', 'YES', 'BY_APPROVAL'));

alter table public.listings
  alter column pet_friendly drop default,
  alter column dogs drop default,
  alter column cats drop default;

alter table public.listings
  alter column pet_friendly type text using (
    case when pet_friendly is true then 'BY_APPROVAL' else 'NO' end
  ),
  alter column dogs type text using (
    case when dogs is true then 'BY_APPROVAL' else 'NO' end
  ),
  alter column cats type text using (
    case when cats is true then 'BY_APPROVAL' else 'NO' end
  );

alter table public.listings
  alter column pet_friendly set default 'NO',
  alter column dogs set default 'NO',
  alter column cats set default 'NO';

alter table public.listings
  drop constraint if exists listings_pet_friendly_check,
  drop constraint if exists listings_dogs_check,
  drop constraint if exists listings_cats_check;

alter table public.listings
  add constraint listings_pet_friendly_check check (pet_friendly in ('NO', 'YES', 'BY_APPROVAL')),
  add constraint listings_dogs_check check (dogs in ('NO', 'YES', 'BY_APPROVAL')),
  add constraint listings_cats_check check (cats in ('NO', 'YES', 'BY_APPROVAL'));
