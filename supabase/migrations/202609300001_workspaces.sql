begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','member','viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create unique index workspace_one_owner on public.workspace_members(workspace_id) where role = 'owner';
create index workspace_members_user on public.workspace_members(user_id,workspace_id);
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  role text not null check (role in ('member','viewer')),
  token_hash text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz
);
create index workspace_invitations_workspace on public.workspace_invitations(workspace_id);
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

-- All identity checks use the authenticated UID and server-owned auth records.
create function public.workspace_role(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace and m.user_id = auth.uid() and u.email_confirmed_at is not null;
$$;
create policy workspace_read on public.workspaces for select to authenticated
using (public.workspace_role(id) is not null);
create policy membership_read on public.workspace_members for select to authenticated
using (public.workspace_role(workspace_id) is not null);
-- No table-write grants or invitation SELECT grant. RPCs below enforce writes.
revoke all on public.workspaces, public.workspace_members, public.workspace_invitations from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;

create function public.workspace_list() returns table(id uuid, name text, role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id,w.name,m.role,w.created_at from public.workspaces w
  join public.workspace_members m on m.workspace_id=w.id
  join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and u.email_confirmed_at is not null order by w.created_at,w.id;
$$;
create function public.workspace_create(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  insert into public.workspaces(name,owner_id) values(btrim(p_name),auth.uid()) returning id into v_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(v_id,auth.uid(),'owner');
  return v_id;
end; $$;
create function public.workspace_rename(p_workspace uuid,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  update public.workspaces set name=btrim(p_name) where id=p_workspace;
end; $$;
create function public.workspace_member_list(p_workspace uuid)
returns table(user_id uuid,display_name text,email text,role text,joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.workspace_role(p_workspace) is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
  return query select m.user_id,coalesce(u.raw_user_meta_data->>'display_name',''),u.email::text,m.role,m.joined_at
  from public.workspace_members m join auth.users u on u.id=m.user_id
  where m.workspace_id=p_workspace order by (m.role='owner') desc,m.joined_at,m.user_id;
end; $$;
create function public.workspace_member_change(p_workspace uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if p_role is null or p_role not in ('member','viewer') then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  update public.workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user and role <> 'owner';
  if not found then raise exception 'MEMBER_NOT_EDITABLE' using errcode='22023'; end if;
end; $$;
create function public.workspace_member_remove(p_workspace uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  delete from public.workspace_members where workspace_id=p_workspace and user_id=p_user and role <> 'owner';
  if not found then raise exception 'MEMBER_NOT_EDITABLE' using errcode='22023'; end if;
end; $$;
create function public.workspace_invite(p_workspace uuid,p_email text,p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_email text := lower(btrim(p_email));
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if p_role is null or p_role not in ('member','viewer') then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  if exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace and lower(u.email)=v_email) then
    raise exception 'ALREADY_MEMBER' using errcode='22023'; end if;
  -- Reissuing an invite invalidates older pending links for this recipient.
  update public.workspace_invitations set revoked_at=now() where workspace_id=p_workspace and email=v_email and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.workspace_invitations(workspace_id,email,role,token_hash)
  values(p_workspace,v_email,p_role,encode(extensions.digest(v_token,'sha256'),'hex'));
  return v_token;
end; $$;
create function public.workspace_invitation_list(p_workspace uuid)
returns table(id uuid,email text,role text,created_at timestamptz,expires_at timestamptz,revoked_at timestamptz,accepted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  return query select i.id,i.email,i.role,i.created_at,i.expires_at,i.revoked_at,i.accepted_at from public.workspace_invitations i
  where i.workspace_id=p_workspace order by i.created_at desc;
end; $$;
create function public.workspace_invitation_revoke(p_workspace uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  update public.workspace_invitations set revoked_at=now() where workspace_id=p_workspace and id=p_invitation and accepted_at is null and revoked_at is null;
end; $$;
create function public.workspace_invitation_accept(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_email text; v_invite public.workspace_invitations%rowtype;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  select workspace_id into v_workspace from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if v_workspace is null then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
  -- Same lock order as owner mutations; acceptance and revocation serialize.
  perform 1 from public.workspaces where id=v_workspace for update;
  select * into v_invite from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if v_invite.email <> v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  if v_invite.accepted_by=auth.uid() and exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=auth.uid()) then return v_workspace; end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(v_workspace,auth.uid(),v_invite.role) on conflict do nothing;
  update public.workspace_invitations set accepted_at=now(),accepted_by=auth.uid() where id=v_invite.id;
  return v_workspace;
end; $$;

-- Grant only this module's functions; never broaden unrelated function grants.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('workspace_role','workspace_list','workspace_create','workspace_rename','workspace_member_list','workspace_member_change','workspace_member_remove','workspace_invite','workspace_invitation_list','workspace_invitation_revoke','workspace_invitation_accept')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
