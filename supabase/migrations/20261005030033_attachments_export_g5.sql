begin;
create table workspace_internal.attachments (
 id uuid primary key, task_id uuid not null references public.board_tasks(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 uploader_id uuid not null references auth.users(id), name text not null check(char_length(name) between 1 and 180),
 size bigint not null check(size between 1 and 10485760),
 mime text not null check(mime in ('image/png','image/jpeg','image/webp','application/pdf','text/plain')),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), object_path text unique not null,
 state text not null default 'pending' check(state in ('pending','ready','deleting','deleted')),
 expires_at timestamptz not null default now()+interval '30 minutes',
 created_at timestamptz not null default now(), confirmed_at timestamptz, deleted_at timestamptz,
 delete_id uuid, deleted_by uuid references auth.users(id), delete_reason text
);
create index attachments_workspace on workspace_internal.attachments(workspace_id,state);
create index attachments_task on workspace_internal.attachments(task_id,state);
create table workspace_internal.attachment_cleanup_config (
 singleton boolean primary key default true check(singleton),
 endpoint text not null, secret text not null default encode(extensions.gen_random_bytes(32),'hex')
);
alter table workspace_internal.attachments enable row level security;
alter table workspace_internal.attachment_cleanup_config enable row level security;
revoke all on workspace_internal.attachments,workspace_internal.attachment_cleanup_config from public,anon,authenticated;

create function workspace_internal.attachment_access(p_user uuid,p_task uuid,p_write boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('workspace',w.id,'role',m.role,'writable',m.role in ('owner','member') and w.archived_at is null and b.archived_at is null and t.archived_at is null)
 into result from public.board_tasks t join public.boards b on b.id=t.board_id join public.workspaces w on w.id=b.workspace_id
 join public.workspace_members m on m.workspace_id=w.id and m.user_id=p_user
 join auth.users u on u.id=p_user and u.email_confirmed_at is not null where t.id=p_task;
 if result is null or (p_write and not (result->>'writable')::boolean) then raise exception 'ATTACHMENT_ACCESS_DENIED' using errcode='42501'; end if;
 return result;
end; $$;
create function workspace_internal.attachment_audit(p_user uuid,p_task uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor text;
begin
 select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),'Thành viên') into actor from auth.users where id=p_user;
 insert into public.task_activity(task_id,actor_id,actor_name,action,changes) values(p_task,p_user,coalesce(actor,'Hệ thống'),'updated',p_changes);
 update public.boards set version=version+1 where id=(select board_id from public.board_tasks where id=p_task);
end; $$;
create function public.attachment_list(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare access jsonb;
begin
 access:=workspace_internal.attachment_access(auth.uid(),p_task,false);
 return jsonb_build_object('writable',(access->>'writable')::boolean,'role',access->>'role',
 'used_bytes',(select coalesce(sum(size),0) from workspace_internal.attachments where workspace_id=(access->>'workspace')::uuid and state<>'deleted'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'size',size,'mime',mime,'sha256',sha256,'uploader_id',uploader_id,'created_at',confirmed_at,
 'can_delete',(access->>'writable')::boolean and (access->>'role'='owner' or uploader_id=auth.uid()),'requires_reason',uploader_id<>auth.uid()) order by created_at,id)
 from workspace_internal.attachments where task_id=p_task and state='ready'),'[]'::jsonb));
end; $$;

-- Only the authenticated server handler can execute this RPC. p_user is never
-- accepted from a browser: the handler derives it with Auth getUser(token).
create function public.attachment_service(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a workspace_internal.attachments%rowtype; access jsonb; w uuid; task uuid; v_id uuid:=(p_data->>'id')::uuid;
begin
 if v_id is null then raise exception 'INVALID_ATTACHMENT' using errcode='22023'; end if;
 if p_action='reserve' then task:=(p_data->>'task')::uuid;
 else select task_id into task from workspace_internal.attachments where attachments.id=v_id; end if;
 select b.workspace_id into w from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=task;
 perform 1 from public.workspaces where workspaces.id=w for update;
 select * into a from workspace_internal.attachments where attachments.id=v_id for update;
 if p_action='finish_delete' then
  if a.state='deleted' then return jsonb_build_object('ok',true); end if;
  if a.state is distinct from 'deleting' or a.deleted_by is distinct from p_user or a.delete_id is distinct from (p_data->>'receipt')::uuid then raise exception 'INVALID_ATTACHMENT' using errcode='22023'; end if;
  update workspace_internal.attachments set state='deleted',deleted_at=now() where attachments.id=v_id;
  return jsonb_build_object('ok',true);
 end if;
 access:=workspace_internal.attachment_access(p_user,task,p_action<>'download');
 if p_action='reserve' then
  if a.id is not null then
   if a.uploader_id<>p_user or a.task_id<>task or a.name is distinct from p_data->>'name' or a.sha256 is distinct from p_data->>'sha256' or a.size is distinct from (p_data->>'size')::bigint or a.mime is distinct from p_data->>'mime' then raise exception 'ATTACHMENT_REUSED' using errcode='PT409'; end if;
   if a.state not in ('pending','ready') then raise exception 'ATTACHMENT_EXPIRED' using errcode='22023'; end if;
   if a.state='pending' then update workspace_internal.attachments set expires_at=now()+interval '30 minutes' where attachments.id=v_id; end if;
  else
   if (select count(*) from workspace_internal.attachments where task_id=task and state<>'deleted')>=20 then raise exception 'ATTACHMENT_COUNT_LIMIT' using errcode='22023'; end if;
   if (select coalesce(sum(size),0) from workspace_internal.attachments where workspace_id=w and state<>'deleted')+(p_data->>'size')::bigint>524288000 then raise exception 'ATTACHMENT_QUOTA' using errcode='22023'; end if;
   insert into workspace_internal.attachments(id,task_id,workspace_id,uploader_id,name,size,mime,sha256,object_path)
   values(v_id,task,w,p_user,p_data->>'name',(p_data->>'size')::bigint,p_data->>'mime',p_data->>'sha256',w::text||'/'||task::text||'/'||v_id::text) returning * into a;
  end if;
 elsif p_action='confirm' then
  if a.uploader_id<>p_user or a.state not in ('pending','ready') then raise exception 'ATTACHMENT_ACCESS_DENIED' using errcode='42501'; end if;
  if a.state='pending' then
   if not exists(select 1 from storage.objects o where bucket_id='task-attachments' and o.name=a.object_path and (o.metadata->>'size')::bigint=a.size) then raise exception 'UPLOAD_NOT_CONFIRMED' using errcode='22023'; end if;
   update workspace_internal.attachments set state='ready',confirmed_at=now() where attachments.id=v_id returning * into a;
   perform workspace_internal.attachment_audit(p_user,task,jsonb_build_object('attachment_added',jsonb_build_object('before',null,'after',a.name)));
  end if;
 elsif p_action='delete' then
  if a.uploader_id<>p_user and access->>'role'<>'owner' then raise exception 'ATTACHMENT_ACCESS_DENIED' using errcode='42501'; end if;
  if p_data->>'receipt' is null then raise exception 'INVALID_ATTACHMENT' using errcode='22023'; end if;
  if a.delete_id is not null then
   if a.delete_id is distinct from (p_data->>'receipt')::uuid or a.deleted_by is distinct from p_user or a.delete_reason is distinct from btrim(coalesce(p_data->>'reason','')) then raise exception 'ATTACHMENT_REUSED' using errcode='PT409'; end if;
  else
   if a.state not in ('pending','ready') then raise exception 'ATTACHMENT_EXPIRED' using errcode='22023'; end if;
   if char_length(btrim(coalesce(p_data->>'reason','')))>500 or (a.uploader_id<>p_user and char_length(btrim(coalesce(p_data->>'reason','')))<1) then raise exception 'DELETE_REASON_REQUIRED' using errcode='22023'; end if;
   update workspace_internal.attachments set state='deleting',delete_id=(p_data->>'receipt')::uuid,deleted_by=p_user,delete_reason=btrim(coalesce(p_data->>'reason','')),expires_at=now()+interval '2 minutes' where attachments.id=v_id returning * into a;
   perform workspace_internal.attachment_audit(p_user,task,jsonb_build_object('attachment_removed',jsonb_build_object('before',a.name,'after',null),'attachment_delete_reason',jsonb_build_object('before',null,'after',a.delete_reason)));
  end if;
 elsif p_action='download' then
  if a.state is distinct from 'ready' then raise exception 'ATTACHMENT_ACCESS_DENIED' using errcode='42501'; end if;
 else raise exception 'INVALID_ATTACHMENT' using errcode='22023'; end if;
 return to_jsonb(a);
end; $$;

create function public.attachment_gc(p_secret text,p_done uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from workspace_internal.attachment_cleanup_config where secret=p_secret) then raise exception 'GC_DENIED' using errcode='42501'; end if;
 if p_done is not null then
  update workspace_internal.attachments set state='deleted',deleted_at=coalesce(deleted_at,now()) where id=p_done and state='deleting';
  return jsonb_build_object('ok',true);
 end if;
 with candidates as (
  select a.id from workspace_internal.attachments a where
   (a.state in ('pending','deleting') and a.expires_at<now()) or
   (a.state='deleted' and exists(select 1 from storage.objects o where o.bucket_id='task-attachments' and o.name=a.object_path))
  order by a.expires_at,a.id for update skip locked limit 50
 ), claimed as (
  update workspace_internal.attachments a set state='deleting',expires_at=now()+interval '2 minutes' from candidates c where a.id=c.id returning a.id,a.object_path
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end; $$;
create function workspace_internal.run_attachment_cleanup() returns bigint
language plpgsql security definer set search_path='' as $$
declare config workspace_internal.attachment_cleanup_config%rowtype; request_id bigint;
begin
 select * into config from workspace_internal.attachment_cleanup_config where singleton;
 if not found then raise exception 'CLEANUP_NOT_CONFIGURED'; end if;
 select net.http_post(url:=config.endpoint,headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','gc','secret',config.secret),timeout_milliseconds:=60000) into request_id;
 return request_id;
end; $$;

create function public.workspace_export(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; counts jsonb;
begin
 if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 select jsonb_build_object('schema_version',1,'exported_at',now(),
 'workspace',(select to_jsonb(w) from public.workspaces w where w.id=p_workspace),
 'members',coalesce((select jsonb_agg(to_jsonb(m) order by user_id) from public.workspace_members m where workspace_id=p_workspace),'[]'::jsonb),
 'boards',coalesce((select jsonb_agg(to_jsonb(b) order by id) from public.boards b where workspace_id=p_workspace),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.board_tasks t join public.boards b on b.id=t.board_id where b.workspace_id=p_workspace),'[]'::jsonb),
 'labels',coalesce((select jsonb_agg(to_jsonb(l) order by id) from public.workspace_labels l where workspace_id=p_workspace),'[]'::jsonb),
 'task_labels',coalesce((select jsonb_agg(to_jsonb(tl) order by tl.task_id,tl.label_id) from public.task_labels tl join public.board_tasks t on t.id=tl.task_id join public.boards b on b.id=t.board_id where b.workspace_id=p_workspace),'[]'::jsonb),
 'checklist',coalesce((select jsonb_agg(to_jsonb(c) order by c.task_id,c.position,c.id) from public.task_checklist c join public.board_tasks t on t.id=c.task_id join public.boards b on b.id=t.board_id where b.workspace_id=p_workspace),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.task_comments c join public.board_tasks t on t.id=c.task_id join public.boards b on b.id=t.board_id where b.workspace_id=p_workspace),'[]'::jsonb),
 'task_activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.task_activity a join public.board_tasks t on t.id=a.task_id join public.boards b on b.id=t.board_id where b.workspace_id=p_workspace),'[]'::jsonb),
 'workspace_activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.workspace_activity a where workspace_id=p_workspace),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'task_id',task_id,'workspace_id',workspace_id,'uploader_id',uploader_id,'name',name,'size',size,'mime',mime,'sha256',sha256,'object_path',object_path,'created_at',created_at,'confirmed_at',confirmed_at) order by id) from workspace_internal.attachments where workspace_id=p_workspace and state='ready'),'[]'::jsonb)
 ) into result;
 select jsonb_object_agg(key,jsonb_array_length(value)) into counts from jsonb_each(result) where jsonb_typeof(value)='array';
 return result||jsonb_build_object('manifest',jsonb_build_object('counts',counts,'files','metadata_only','excluded',jsonb_build_array('file_binaries','auth','invitation_secrets','receipts','personal_preferences','notifications')));
end; $$;

do $$ declare f record;
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('task-attachments','task-attachments',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf','text/plain']);
  execute 'create policy task_attachments_server_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>''task-attachments'') with check(bucket_id<>''task-attachments'')';
 end if;
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='workspace_internal' and p.proname in ('attachment_access','attachment_audit','run_attachment_cleanup')) or
  (n.nspname='public' and p.proname in ('attachment_list','attachment_service','attachment_gc','workspace_export'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  if f.proname in ('attachment_list','workspace_export') then execute format('grant execute on function %s to authenticated',f.sig);
  elsif f.proname in ('attachment_service','attachment_gc') and exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
