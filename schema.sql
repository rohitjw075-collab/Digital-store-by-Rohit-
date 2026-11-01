-- Waghmare Digital Solutions — Supabase schema
-- Run this in Supabase Dashboard > SQL Editor.
-- Keep RLS enabled. Never expose the service_role key in frontend code.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  details text not null,
  status text not null default 'submitted'
    check (status in ('submitted','reviewing','quoted','payment_pending','in_progress','completed','rejected')),
  quoted_amount numeric(12,2) check (quoted_amount is null or quoted_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  upi_reference text not null,
  note text,
  status text not null default 'submitted' check (status in ('submitted','verified','rejected')),
  created_at timestamptz not null default now()
);

create or replace function public.is_wds_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_wds_admin() from public;
grant execute on function public.is_wds_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.payments enable row level security;

-- Admin membership is intentionally not self-service.
create policy "admins can read admin list"
on public.admin_users for select to authenticated
using (public.is_wds_admin());

create policy "customers create own orders"
on public.orders for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "customers read own orders, admins read all"
on public.orders for select to authenticated
using (user_id = (select auth.uid()) or public.is_wds_admin());

create policy "admins update orders"
on public.orders for update to authenticated
using (public.is_wds_admin())
with check (public.is_wds_admin());

create policy "customers add own file records"
on public.order_files for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
);

create policy "customers and admins read file records"
on public.order_files for select to authenticated
using (user_id = (select auth.uid()) or public.is_wds_admin());

create policy "customers submit own payment references"
on public.payments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
      and o.quoted_amount is not null
  )
);

create policy "customers and admins read payments"
on public.payments for select to authenticated
using (user_id = (select auth.uid()) or public.is_wds_admin());

create policy "admins update payment verification"
on public.payments for update to authenticated
using (public.is_wds_admin())
with check (public.is_wds_admin());

-- Private file bucket. Customers can upload only within their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files','project-files',false,10485760,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain','application/zip'])
on conflict (id) do nothing;

create policy "customer upload own project files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "customer read own project files, admins read all"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-files'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_wds_admin()
  )
);

-- IMPORTANT: create your admin account in Authentication first.
-- Then replace YOUR_ADMIN_USER_UUID below with that auth.users.id and run:
-- insert into public.admin_users(user_id) values ('YOUR_ADMIN_USER_UUID');
