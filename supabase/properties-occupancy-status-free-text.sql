-- Run after properties-occupancy-status.sql to allow custom statuses (e.g. owner_occupied)

alter table public.properties
  drop constraint if exists properties_occupancy_status_check;
