create table if not exists public.wedding_rsvps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  attending text not null check (attending in ('yes', 'no')),
  guest_count integer not null default 0 check (guest_count between 0 and 30),
  message text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  constraint wedding_rsvps_attendance_count_check check ((attending = 'no' and guest_count = 0) or (attending = 'yes' and guest_count between 1 and 30))
);
create index if not exists wedding_rsvps_created_at_idx on public.wedding_rsvps (created_at desc);
alter table public.wedding_rsvps enable row level security;
revoke all on table public.wedding_rsvps from anon, authenticated;
grant all on table public.wedding_rsvps to service_role;
create extension if not exists pg_cron with schema pg_catalog;
do $$ begin if exists (select 1 from cron.job where jobname = 'wedding-rsvp-30-day-cleanup') then perform cron.unschedule('wedding-rsvp-30-day-cleanup'); end if; end $$;
select cron.schedule('wedding-rsvp-30-day-cleanup', '15 3 * * *', $$delete from public.wedding_rsvps where created_at < now() - interval '30 days'$$);
