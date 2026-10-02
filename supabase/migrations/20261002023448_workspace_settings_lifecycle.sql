begin;
create schema if not exists workspace_internal;
revoke all on schema workspace_internal from public, anon, authenticated;
alter table public.workspaces
 add column description text not null default '' check(char_length(description)<=1000),
 add column timezone text not null default 'Asia/Bangkok',
 add column archived_at timestamptz,
 add column version integer not null default 1,
 add column updated_at timestamptz not null default now();
create table public.workspace_mutations(
 workspace_id uuid not null references public.workspaces(id), actor uuid not null references auth.users(id),
 mutation_id uuid not null, request jsonb not null, result jsonb not null,
 primary key(workspace_id,actor,mutation_id));
create table public.workspace_activity(
 id bigint generated always as identity primary key, workspace_id uuid not null references public.workspaces(id),
 actor_id uuid references auth.users(id), action text not null, changes jsonb not null default '{}',
 created_at timestamptz not null default now());
create index workspace_activity_cursor on public.workspace_activity(workspace_id,id);
alter table public.workspace_mutations enable row level security;
alter table public.workspace_activity enable row level security;
revoke all on public.workspace_mutations,public.workspace_activity from public,anon,authenticated;

create function workspace_internal.owner_invariant() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; o uuid; n integer;
begin
 if tg_table_name='workspaces' then w:=coalesce(new.id,old.id); else w:=coalesce(new.workspace_id,old.workspace_id); end if;
 select owner_id into o from public.workspaces where id=w;
 if not found then return null; end if;
 select count(*) into n from public.workspace_members where workspace_id=w and role='owner';
 if n<>1 or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=o and role='owner') then
  raise exception 'WORKSPACE_OWNER_INVARIANT' using errcode='23514';
 end if;
 return null;
end; $$;
create constraint trigger workspace_owner_check after insert or update on public.workspaces
 deferrable initially deferred for each row execute function workspace_internal.owner_invariant();
create constraint trigger membership_owner_check after insert or update or delete on public.workspace_members
 deferrable initially deferred for each row execute function workspace_internal.owner_invariant();

create function workspace_internal.touch(p_workspace uuid,p_action text,p_changes jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.workspaces set version=version+1,updated_at=now() where id=p_workspace;
 insert into public.workspace_activity(workspace_id,actor_id,action,changes) values(p_workspace,auth.uid(),p_action,p_changes);
end; $$;
create function workspace_internal.active(p_workspace uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a timestamptz;
begin
 select archived_at into a from public.workspaces where id=p_workspace for update;
 if public.workspace_role(p_workspace) is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 if a is not null then raise exception 'WORKSPACE_ARCHIVED' using errcode='22023'; end if;
end; $$;

drop function public.workspace_list();
create function public.workspace_list() returns table(id uuid,name text,role text,created_at timestamptz,description text,timezone text,archived_at timestamptz,version integer)
language sql stable security definer set search_path='' as $$
 select w.id,w.name,m.role,w.created_at,w.description,w.timezone,w.archived_at,w.version from public.workspaces w
 join public.workspace_members m on m.workspace_id=w.id join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and u.email_confirmed_at is not null order by w.archived_at nulls first,w.created_at,w.id;
$$;
create function public.workspace_settings_get(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text;
begin
 r:=public.workspace_role(p_workspace);
 if r is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 return (select to_jsonb(w)||jsonb_build_object('role',r) from public.workspaces w where id=p_workspace);
end; $$;
create function public.workspace_activity_list(p_workspace uuid,p_before bigint default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.sequence desc) from (
 select id::text as id,id as sequence,actor_id,action,changes,created_at from public.workspace_activity where workspace_id=p_workspace and (p_before is null or id<p_before)
 order by public.workspace_activity.id desc limit greatest(1,least(coalesce(p_limit,50),50))) a),'[]');
end; $$;
create function public.workspace_mutate(p_workspace uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workspaces%rowtype; r text; target uuid; prev public.workspace_mutations%rowtype;
 req jsonb:=jsonb_build_object('version',p_version,'action',p_action,'data',p_data); result jsonb;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 if p_mutation is null or p_version is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_action is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select * into w from public.workspaces where id=p_workspace for update;
 select * into prev from public.workspace_mutations where workspace_id=p_workspace and actor=auth.uid() and mutation_id=p_mutation;
 if found then
  if prev.request is distinct from req then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return prev.result; -- Minimal ACK only, including after leave/transfer.
 end if;
 r:=public.workspace_role(p_workspace);
 if r is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 if p_action='leave' then
  if r='owner' then raise exception 'OWNER_MUST_TRANSFER' using errcode='22023'; end if;
 elsif r<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if w.version<>p_version then raise exception 'WORKSPACE_CONFLICT' using errcode='PT409'; end if;
 if p_action='update' then
  perform workspace_internal.active(p_workspace);
  if (p_data-'name'-'description'-'timezone')<>'{}'::jsonb or jsonb_typeof(p_data->'name') is distinct from 'string' or jsonb_typeof(p_data->'description') is distinct from 'string' or jsonb_typeof(p_data->'timezone') is distinct from 'string'
   or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  update public.workspaces set name=btrim(p_data->>'name'),description=p_data->>'description',timezone=p_data->>'timezone' where id=p_workspace;
 elsif p_action='transfer' then
  target:=(p_data->>'user_id')::uuid;
  if target is null or target=auth.uid() or not exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace and m.user_id=target and u.email_confirmed_at is not null) then raise exception 'INVALID_OWNER_TARGET' using errcode='22023'; end if;
  update public.workspace_members set role='member' where workspace_id=p_workspace and role='owner';
  update public.workspace_members set role='owner' where workspace_id=p_workspace and user_id=target;
  update public.workspaces set owner_id=target where id=p_workspace;
 elsif p_action='leave' then
  delete from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid();
 elsif p_action='archive' then
  if w.archived_at is not null then raise exception 'WORKSPACE_ARCHIVED' using errcode='22023'; end if;
  update public.workspaces set archived_at=now() where id=p_workspace;
  update public.workspace_invitations set revoked_at=now() where workspace_id=p_workspace and accepted_at is null and revoked_at is null;
 elsif p_action='restore' then
  if w.archived_at is null then raise exception 'WORKSPACE_ACTIVE' using errcode='22023'; end if;
  update public.workspaces set archived_at=null where id=p_workspace;
 else raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 perform workspace_internal.touch(p_workspace,p_action,p_data);
 result:=jsonb_build_object('ok',true,'mutation_id',p_mutation);
 insert into public.workspace_mutations values(p_workspace,auth.uid(),p_mutation,req,result);
 return result;
end; $$;

-- Preserve tested legacy bodies in a non-exposed schema; guarded wrappers below own the grants.
alter function public.workspace_rename(uuid,text) set schema workspace_internal;
alter function public.workspace_member_change(uuid,uuid,text) set schema workspace_internal;
alter function public.workspace_member_remove(uuid,uuid) set schema workspace_internal;
alter function public.workspace_invite(uuid,text,text) set schema workspace_internal;
alter function public.workspace_invitation_revoke(uuid,uuid) set schema workspace_internal;
alter function public.workspace_invitation_accept(text) set schema workspace_internal;
alter function public.workspace_invitation_preview(text) set schema workspace_internal;
alter function public.board_create(uuid,uuid,text) set schema workspace_internal;
alter function public.board_mutate(uuid,integer,uuid,text,jsonb) set schema workspace_internal;
alter function public.task_comment_add(uuid,uuid,uuid,text) set schema workspace_internal;
alter function public.board_snapshot(uuid) set schema workspace_internal;
alter function public.task_thread(uuid,uuid,timestamptz,uuid,bigint) set schema workspace_internal;

create function public.workspace_rename(p_workspace uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
begin perform workspace_internal.active(p_workspace); perform workspace_internal.workspace_rename(p_workspace,p_name); perform workspace_internal.touch(p_workspace,'rename'); end; $$;
create function public.workspace_member_change(p_workspace uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin perform workspace_internal.active(p_workspace); perform workspace_internal.workspace_member_change(p_workspace,p_user,p_role); perform workspace_internal.touch(p_workspace,'member_role',jsonb_build_object('user_id',p_user,'role',p_role)); end; $$;
create function public.workspace_member_remove(p_workspace uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform workspace_internal.workspace_member_remove(p_workspace,p_user); perform workspace_internal.touch(p_workspace,'member_removed',jsonb_build_object('user_id',p_user)); end; $$;
create function public.workspace_invite(p_workspace uuid,p_email text,p_role text) returns text language plpgsql security definer set search_path='' as $$
declare token text;
begin perform workspace_internal.active(p_workspace); token:=workspace_internal.workspace_invite(p_workspace,p_email,p_role); perform workspace_internal.touch(p_workspace,'invited',jsonb_build_object('role',p_role)); return token; end; $$;
create function public.workspace_invitation_revoke(p_workspace uuid,p_invitation uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform workspace_internal.workspace_invitation_revoke(p_workspace,p_invitation); perform workspace_internal.touch(p_workspace,'invite_revoked',jsonb_build_object('id',p_invitation)); end; $$;
create function public.workspace_invitation_accept(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; a timestamptz; joined boolean;
begin
 select workspace_id into w from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 select archived_at into a from public.workspaces where id=w for update;
 if a is not null then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
 joined:=exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid());
 w:=workspace_internal.workspace_invitation_accept(p_token);
 if not joined then perform workspace_internal.touch(w,'member_joined'); end if;
 return w;
end; $$;
create function public.workspace_invitation_preview(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.workspace_invitations i join public.workspaces w on w.id=i.workspace_id where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and w.archived_at is not null) then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
 return workspace_internal.workspace_invitation_preview(p_token);
end; $$;
create function public.board_create(p_workspace uuid,p_id uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
begin perform workspace_internal.active(p_workspace); return workspace_internal.board_create(p_workspace,p_id,p_name); end; $$;
create function public.board_mutate(p_board uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid;
begin select workspace_id into w from public.boards where id=p_board; perform workspace_internal.active(w); return workspace_internal.board_mutate(p_board,p_version,p_mutation,p_action,p_data); end; $$;
create function public.task_comment_add(p_board uuid,p_task uuid,p_id uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid;
begin select workspace_id into w from public.boards where id=p_board; perform workspace_internal.active(w); return workspace_internal.task_comment_add(p_board,p_task,p_id,p_body); end; $$;
create function public.board_snapshot(p_board uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb; w public.workspaces%rowtype;
begin
 value:=workspace_internal.board_snapshot(p_board);
 select * into w from public.workspaces where id=(value->'board'->>'workspace_id')::uuid;
 return value||jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'timezone',w.timezone,'archived_at',w.archived_at,'version',w.version));
end; $$;
create function public.task_thread(p_board uuid,p_task uuid,p_before_comment timestamptz default null,p_before_comment_id uuid default null,p_before_activity bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb;
begin
 value:=workspace_internal.task_thread(p_board,p_task,p_before_comment,p_before_comment_id,p_before_activity);
 if exists(select 1 from public.boards b join public.workspaces w on w.id=b.workspace_id where b.id=p_board and w.archived_at is not null) then value:=value||'{"can_comment":false}'::jsonb; end if;
 return value;
end; $$;

revoke all on all functions in schema workspace_internal from public,anon,authenticated;
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('workspace_list','workspace_settings_get','workspace_activity_list','workspace_mutate','workspace_rename','workspace_member_change','workspace_member_remove','workspace_invite','workspace_invitation_revoke','workspace_invitation_accept','workspace_invitation_preview','board_create','board_mutate','board_snapshot','task_comment_add','task_thread') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspaces') then alter publication supabase_realtime add table public.workspaces; end if;
end $$;
notify pgrst,'reload schema';
commit;
