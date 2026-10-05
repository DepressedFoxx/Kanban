begin;
-- Notification content is private; Realtime carries only a per-user counter.
create table public.notification_signals (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1
);
alter table public.notification_signals enable row level security;
revoke all on public.notification_signals from public,anon,authenticated;
grant select on public.notification_signals to authenticated;
create policy notification_signal_read on public.notification_signals for select to authenticated using(user_id=(select auth.uid()));

create table workspace_internal.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 assignments boolean not null default true, comments boolean not null default true,
 invitations boolean not null default true, version integer not null default 1
);
create table workspace_internal.task_watches (
 task_id uuid not null references public.board_tasks(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null, version integer not null default 1,
 primary key(task_id,user_id)
);
create index task_watches_user on workspace_internal.task_watches(user_id);
create table workspace_internal.notifications (
 id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, kind text not null check(kind in ('assignment','comment','invitation')),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 task_id uuid references public.board_tasks(id) on delete cascade,
 comment_id uuid references public.task_comments(id) on delete cascade,
 invitation_id uuid references public.workspace_invitations(id) on delete cascade,
 created_at timestamptz not null default now(), read_at timestamptz,
 version integer not null default 1, unique(user_id,event_key)
);
create index notifications_feed on workspace_internal.notifications(user_id,id desc);
create index notifications_comment on workspace_internal.notifications(comment_id,user_id) where comment_id is not null;
create index notifications_invitation on workspace_internal.notifications(invitation_id,user_id) where invitation_id is not null;
revoke all on sequence workspace_internal.notifications_id_seq from public,anon,authenticated;
create table workspace_internal.notification_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 mutation_id uuid not null, request jsonb not null, primary key(user_id,mutation_id)
);
alter table workspace_internal.notification_preferences enable row level security;
alter table workspace_internal.task_watches enable row level security;
alter table workspace_internal.notifications enable row level security;
alter table workspace_internal.notification_receipts enable row level security;
revoke all on workspace_internal.notification_preferences,workspace_internal.task_watches,workspace_internal.notifications,workspace_internal.notification_receipts from public,anon,authenticated;

create function workspace_internal.notification_signal(p_user uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.notification_signals(user_id) values(p_user)
 on conflict(user_id) do update set revision=public.notification_signals.revision+1;
$$;
create function workspace_internal.notification_visible(n workspace_internal.notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select n.user_id=auth.uid() and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 and exists(select 1 from public.workspaces w where w.id=n.workspace_id and w.archived_at is null)
 and case when n.kind='invitation' then exists(
  select 1 from public.workspace_invitations i join auth.users u on u.id=auth.uid()
  where i.id=n.invitation_id and i.email=lower(u.email) and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()
 ) else exists(
  select 1 from public.board_tasks t join public.boards b on b.id=t.board_id
  join public.workspace_members m on m.workspace_id=b.workspace_id and m.user_id=auth.uid()
  where t.id=n.task_id and b.workspace_id=n.workspace_id and t.archived_at is null and b.archived_at is null
 ) and (n.comment_id is null or exists(select 1 from public.task_comments c where c.id=n.comment_id and c.deleted_at is null)) end;
$$;
create function workspace_internal.notification_emit(p_user uuid,p_key text,p_kind text,p_workspace uuid,p_task uuid default null,p_comment uuid default null,p_invitation uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or p_user=auth.uid() or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then return; end if;
 if not coalesce((select case p_kind when 'assignment' then assignments when 'comment' then comments else invitations end from workspace_internal.notification_preferences where user_id=p_user),true) then return; end if;
 insert into workspace_internal.notifications(user_id,event_key,kind,workspace_id,task_id,comment_id,invitation_id)
 values(p_user,p_key,p_kind,p_workspace,p_task,p_comment,p_invitation) on conflict(user_id,event_key) do nothing;
 if found then perform workspace_internal.notification_signal(p_user); end if;
end; $$;
create function workspace_internal.notification_task_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if auth.uid() is null or new.assignee_id is null or new.archived_at is not null then return new; end if;
 if tg_op='UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;
 select b.workspace_id into w from public.boards b join public.workspaces ws on ws.id=b.workspace_id where b.id=new.board_id and b.archived_at is null and ws.archived_at is null;
 if w is not null and exists(select 1 from public.workspace_members where workspace_id=w and user_id=new.assignee_id) then
  perform workspace_internal.notification_emit(new.assignee_id,'assignment:'||gen_random_uuid(),'assignment',w,new.id);
 end if;
 return new;
end; $$;
create trigger notification_task_event after insert or update of assignee_id on public.board_tasks for each row execute function workspace_internal.notification_task_event();
create function workspace_internal.notification_comment_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; assigned uuid; recipient record;
begin
 select b.workspace_id,t.assignee_id into w,assigned from public.board_tasks t join public.boards b on b.id=t.board_id join public.workspaces ws on ws.id=b.workspace_id where t.id=new.task_id and t.archived_at is null and b.archived_at is null and ws.archived_at is null;
 if w is null then return new; end if;
 for recipient in select m.user_id from public.workspace_members m left join workspace_internal.task_watches tw on tw.task_id=new.task_id and tw.user_id=m.user_id
 where m.workspace_id=w and coalesce(tw.enabled,m.user_id=assigned,false) and m.user_id is distinct from new.actor_id order by m.user_id
 loop perform workspace_internal.notification_emit(recipient.user_id,'comment:'||new.id,'comment',w,new.task_id,new.id); end loop;
 return new;
end; $$;
create trigger notification_comment_event after insert on public.task_comments for each row execute function workspace_internal.notification_comment_event();
create function workspace_internal.notification_invitation_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
 for recipient in select id from auth.users where lower(email)=new.email and email_confirmed_at is not null order by id loop
  perform workspace_internal.notification_emit(recipient.id,'invitation:'||new.id,'invitation',new.workspace_id,null,null,new.id);
 end loop;
 return new;
end; $$;
create trigger notification_invitation_event after insert on public.workspace_invitations for each row execute function workspace_internal.notification_invitation_event();
create function workspace_internal.notification_member_removed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from workspace_internal.task_watches tw using public.board_tasks t,public.boards b where tw.task_id=t.id and t.board_id=b.id and b.workspace_id=old.workspace_id and tw.user_id=old.user_id;
 perform workspace_internal.notification_signal(old.user_id);
 return old;
end; $$;
create trigger notification_member_removed after delete on public.workspace_members for each row execute function workspace_internal.notification_member_removed();

create function workspace_internal.notification_invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
 if tg_table_name='task_comments' then
  if new.deleted_at is not distinct from old.deleted_at then return new; end if;
  for recipient in select distinct user_id from workspace_internal.notifications where comment_id=new.id order by user_id loop
   perform workspace_internal.notification_signal(recipient.user_id);
  end loop;
 else
  for recipient in select distinct user_id from workspace_internal.notifications where invitation_id=new.id order by user_id loop
   perform workspace_internal.notification_signal(recipient.user_id);
  end loop;
 end if;
 return new;
end; $$;
create trigger notification_comment_invalidated after update of deleted_at on public.task_comments for each row execute function workspace_internal.notification_invalidate();
create trigger notification_invitation_invalidated after update of revoked_at,accepted_at,expires_at on public.workspace_invitations for each row execute function workspace_internal.notification_invalidate();

create function public.notification_feed(p_before bigint default null,p_unread boolean default false,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb; prefs jsonb;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_unread is null or p_before<=0 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select jsonb_build_object('assignments',assignments,'comments',comments,'invitations',invitations,'version',version) into prefs from workspace_internal.notification_preferences where user_id=auth.uid();
 with visible as materialized (
  select n.* from workspace_internal.notifications n where n.user_id=auth.uid() and workspace_internal.notification_visible(n)
 ), page as (
  select * from visible where (p_before is null or id<p_before) and (not p_unread or read_at is null) order by id desc limit p_limit+1
 ), trimmed as (select * from page order by id desc limit p_limit)
 select jsonb_build_object(
  'unread',(select count(*) from visible where read_at is null),
  'high_water',coalesce((select max(id)::text from visible),'0'),
  'next',case when (select count(*) from page)>p_limit then (select min(id)::text from trimmed) else null end,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',n.id::text,'kind',n.kind,'workspace_id',n.workspace_id,'workspace_name',w.name,
   'task_id',n.task_id,'board_id',t.board_id,'title',coalesce(t.title,w.name),
   'invitation_id',n.invitation_id,'invitation_role',i.role,'created_at',n.created_at,'read',n.read_at is not null,'version',n.version
  ) order by n.id desc) from trimmed n join public.workspaces w on w.id=n.workspace_id
  left join public.board_tasks t on t.id=n.task_id left join public.workspace_invitations i on i.id=n.invitation_id),'[]'::jsonb)
 ) into answer;
 return answer||jsonb_build_object('preferences',coalesce(prefs,'{"assignments":true,"comments":true,"invitations":true,"version":0}'::jsonb));
end; $$;

create function public.task_watch_get(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('enabled',coalesce(tw.enabled,t.assignee_id=auth.uid(),false),'version',coalesce(tw.version,0),'automatic',tw.user_id is null)
 into result from public.board_tasks t join public.boards b on b.id=t.board_id join public.workspaces w on w.id=b.workspace_id
 left join workspace_internal.task_watches tw on tw.task_id=t.id and tw.user_id=auth.uid()
 where t.id=p_task and public.workspace_role(w.id) is not null and t.archived_at is null and b.archived_at is null and w.archived_at is null;
 if result is null then raise exception 'TASK_ACCESS_DENIED' using errcode='42501'; end if;
 return result;
end; $$;

create function public.notification_mutate(p_mutation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare req jsonb:=jsonb_build_object('action',p_action,'data',p_data); prior jsonb; v integer; w uuid; n workspace_internal.notifications%rowtype;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 if p_mutation is null or p_action is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 if p_action='watch' then
  select b.workspace_id into w from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=(p_data->>'task')::uuid;
  perform 1 from public.workspaces where id=w for update;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('notifications:'||auth.uid()::text,0));
 select request into prior from workspace_internal.notification_receipts where user_id=auth.uid() and mutation_id=p_mutation;
 if found then
  if prior is distinct from req then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'mutation_id',p_mutation);
 end if;
 if p_action='read' then
  if p_data-'id'-'version'-'read'<>'{}'::jsonb or jsonb_typeof(p_data->'read') is distinct from 'boolean' or (p_data->>'version') is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select * into n from workspace_internal.notifications where id=(p_data->>'id')::bigint and user_id=auth.uid() for update;
  if not found or not workspace_internal.notification_visible(n) then raise exception 'NOTIFICATION_ACCESS_DENIED' using errcode='42501'; end if;
  if n.version<>(p_data->>'version')::integer then raise exception 'NOTIFICATION_CONFLICT' using errcode='PT409'; end if;
  update workspace_internal.notifications set read_at=case when (p_data->>'read')::boolean then now() else null end,version=version+1 where id=n.id;
 elsif p_action='read_all' then
  if p_data-'through'<>'{}'::jsonb or coalesce((p_data->>'through')::bigint,-1)<0 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  update workspace_internal.notifications entry set read_at=now(),version=entry.version+1 where entry.user_id=auth.uid() and entry.id<=(p_data->>'through')::bigint and entry.read_at is null and workspace_internal.notification_visible(entry);
 elsif p_action='preferences' then
  if p_data-'assignments'-'comments'-'invitations'-'version'<>'{}'::jsonb or jsonb_typeof(p_data->'assignments') is distinct from 'boolean' or jsonb_typeof(p_data->'comments') is distinct from 'boolean' or jsonb_typeof(p_data->'invitations') is distinct from 'boolean' or p_data->>'version' is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select version into v from workspace_internal.notification_preferences where user_id=auth.uid();
  if coalesce(v,0)<>(p_data->>'version')::integer then raise exception 'NOTIFICATION_CONFLICT' using errcode='PT409'; end if;
  insert into workspace_internal.notification_preferences(user_id,assignments,comments,invitations) values(auth.uid(),(p_data->>'assignments')::boolean,(p_data->>'comments')::boolean,(p_data->>'invitations')::boolean)
  on conflict(user_id) do update set assignments=excluded.assignments,comments=excluded.comments,invitations=excluded.invitations,version=workspace_internal.notification_preferences.version+1;
 elsif p_action='watch' then
  if p_data-'task'-'enabled'-'version'<>'{}'::jsonb or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or p_data->>'version' is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  v:=(public.task_watch_get((p_data->>'task')::uuid)->>'version')::integer;
  if v<>(p_data->>'version')::integer then raise exception 'NOTIFICATION_CONFLICT' using errcode='PT409'; end if;
  insert into workspace_internal.task_watches(task_id,user_id,enabled) values((p_data->>'task')::uuid,auth.uid(),(p_data->>'enabled')::boolean)
  on conflict(task_id,user_id) do update set enabled=excluded.enabled,version=workspace_internal.task_watches.version+1;
 else raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 insert into workspace_internal.notification_receipts values(auth.uid(),p_mutation,req);
 perform workspace_internal.notification_signal(auth.uid());
 return jsonb_build_object('ok',true,'mutation_id',p_mutation);
end; $$;

create function public.notification_invitation_accept(p_invitation uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.workspace_invitations%rowtype; w uuid; email text;
begin
 select lower(u.email) into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if email is null then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 select workspace_id into w from public.workspace_invitations where id=p_invitation;
 perform 1 from public.workspaces where id=w and archived_at is null for update;
 if not found then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
 select * into i from public.workspace_invitations where id=p_invitation for update;
 if not found or i.email<>email then raise exception 'INVITATION_ACCESS_DENIED' using errcode='42501'; end if;
 if i.accepted_by=auth.uid() and exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()) then return w; end if;
 if i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(w,auth.uid(),i.role) on conflict do nothing;
 update public.workspace_invitations set accepted_at=now(),accepted_by=auth.uid() where id=p_invitation;
 perform workspace_internal.touch(w,'joined',jsonb_build_object('role',i.role));
 perform workspace_internal.notification_signal(auth.uid());
 return w;
end; $$;

do $$ declare f record;
begin
 for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='workspace_internal' and p.proname like 'notification_%') or
 (n.nspname='public' and p.proname in ('notification_feed','notification_mutate','notification_invitation_accept','task_watch_get'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.sig); end if;
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.notification_signals; end if;
end; $$;
notify pgrst,'reload schema';
commit;
