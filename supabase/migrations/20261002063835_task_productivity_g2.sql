begin;
create table public.workspace_labels (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 40),
 color text not null check(color in ('blue','green','amber','red','purple','slate'))
);
create unique index workspace_labels_name on public.workspace_labels(workspace_id,lower(btrim(name)));
create table public.task_labels (
 task_id uuid not null references public.board_tasks(id) on delete cascade,
 label_id uuid not null references public.workspace_labels(id) on delete cascade,
 primary key(task_id,label_id)
);
create index task_labels_label on public.task_labels(label_id);
create table public.task_checklist (
 id uuid primary key, task_id uuid not null references public.board_tasks(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 300),
 done boolean not null default false, position integer not null check(position>=0)
);
create index task_checklist_order on public.task_checklist(task_id,position,id);
alter table public.workspace_labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_checklist enable row level security;
revoke all on public.workspace_labels,public.task_labels,public.task_checklist from public,anon,authenticated;
grant select on public.workspace_labels,public.task_labels,public.task_checklist to authenticated;
create policy labels_read on public.workspace_labels for select to authenticated using(public.workspace_role(workspace_id) is not null);
create policy task_labels_read on public.task_labels for select to authenticated using(exists(select 1 from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=task_id and public.workspace_role(b.workspace_id) is not null));
create policy checklist_read on public.task_checklist for select to authenticated using(exists(select 1 from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=task_id and public.workspace_role(b.workspace_id) is not null));

alter table public.task_comments alter column body drop not null;
alter table public.task_comments add column version integer not null default 1;
alter table public.task_comments add column edited_at timestamptz;
alter table public.task_comments add column deleted_at timestamptz;
alter table public.task_comments add constraint comment_tombstone check ((deleted_at is null and body is not null) or (deleted_at is not null and body is null));
create table workspace_internal.comment_mutations (
 comment_id uuid not null references public.task_comments(id) on delete cascade,
 actor uuid not null references auth.users(id), mutation_id uuid not null,
 request jsonb not null, primary key(comment_id,actor,mutation_id)
);
alter table workspace_internal.comment_mutations enable row level security;
revoke all on workspace_internal.comment_mutations from public,anon,authenticated;

-- Keep the G1 snapshot as a private base; do not expose an unguarded helper.
alter function public.board_snapshot(uuid) rename to board_snapshot_g1;
alter function public.board_snapshot_g1(uuid) set schema workspace_internal;
create function public.board_snapshot(p_board uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb; w uuid;
begin
 value:=workspace_internal.board_snapshot_g1(p_board); w:=(value->'board'->>'workspace_id')::uuid;
 return value||jsonb_build_object(
 'labels',coalesce((select jsonb_agg(to_jsonb(l) order by lower(l.name),l.id) from public.workspace_labels l where workspace_id=w),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object(
  'label_ids',coalesce((select jsonb_agg(label_id order by label_id) from public.task_labels where task_id=t.id),'[]'::jsonb),
  'checklist',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.task_checklist c where task_id=t.id),'[]'::jsonb)
 ) order by t.position,t.id) from public.board_tasks t where t.board_id=p_board),'[]'::jsonb));
end; $$;

create or replace function public.board_mutate(p_board uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid; b public.boards%rowtype; t public.board_tasks%rowtype; r text; prev jsonb;
 req jsonb:=jsonb_build_object('action',p_action,'data',p_data,'version',p_version);
 tid uuid; lid uuid; ids uuid[]; item jsonb; n integer; pos integer; target_status text; old_value jsonb; new_value jsonb; old_labels jsonb;
begin
 select workspace_id into w from public.boards where id=p_board;
 perform workspace_internal.active(w);
 if p_action not in ('label_save','label_delete','task_labels','checklist','task_details','duplicate_task','bulk_status','bulk_archive') then
  return workspace_internal.board_mutate(p_board,p_version,p_mutation,p_action,p_data);
 end if;
 select * into b from public.boards where id=p_board for update;
 r:=public.workspace_role(w);
 if r not in ('owner','member') or r is null then raise exception 'WRITE_DENIED' using errcode='42501'; end if;
 if p_mutation is null or p_version is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select request into prev from public.board_mutations where board_id=p_board and actor=auth.uid() and mutation_id=p_mutation;
 if found then
  if prev is distinct from req then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return public.board_snapshot(p_board);
 end if;
 if b.archived_at is not null then raise exception 'BOARD_ARCHIVED' using errcode='22023'; end if;
 if b.version<>p_version then raise exception 'BOARD_CONFLICT' using errcode='PT409'; end if;
 if p_action in ('label_save','label_delete') then
  if r<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  lid:=(p_data->>'id')::uuid;
  if lid is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  if exists(select 1 from public.workspace_labels where id=lid and workspace_id<>w) then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  if p_action='label_save' then
   if not exists(select 1 from public.workspace_labels where id=lid) and (select count(*) from public.workspace_labels where workspace_id=w)>=100 then raise exception 'LABEL_LIMIT' using errcode='22023'; end if;
   insert into public.workspace_labels(id,workspace_id,name,color) values(lid,w,btrim(p_data->>'name'),p_data->>'color')
   on conflict(id) do update set name=excluded.name,color=excluded.color;
  else
   delete from public.workspace_labels where id=lid and workspace_id=w;
   if not found then raise exception 'LABEL_NOT_FOUND' using errcode='22023'; end if;
  end if;
  -- Catalog changes invalidate every board, including label links removed by cascade.
  update public.boards set version=version+1 where workspace_id=w;
  perform workspace_internal.touch(w,p_action,jsonb_build_object('label_id',lid,'name',p_data->>'name'));
 elsif p_action in ('bulk_status','bulk_archive') then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  if coalesce(cardinality(ids),0) not between 1 and 50 or (select count(distinct x) from unnest(ids) x)<>cardinality(ids)
    or (select count(*) from public.board_tasks where board_id=p_board and id=any(ids) and archived_at is null)<>cardinality(ids) then raise exception 'INVALID_TASK_SELECTION' using errcode='22023'; end if;
  if p_action='bulk_archive' then update public.board_tasks set archived_at=now() where id=any(ids);
  else
   target_status:=p_data->>'status';
   if target_status is null or target_status not in ('todo','doing','review','done') then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
   select coalesce(max(position),-1)+1 into pos from public.board_tasks where board_id=p_board and status=target_status and archived_at is null;
   update public.board_tasks task_row set status=target_status,position=pos+x.n::integer-1 from unnest(ids) with ordinality x(id,n) where task_row.id=x.id;
  end if;
  update public.boards set version=version+1 where id=p_board;
 else
  tid:=(p_data->>'id')::uuid;
  select * into t from public.board_tasks where id=tid and board_id=p_board;
  if not found then raise exception 'TASK_NOT_FOUND' using errcode='22023'; end if;
  if t.archived_at is not null then raise exception 'TASK_ARCHIVED' using errcode='22023'; end if;
  if p_action in ('task_labels','task_details') then
   if jsonb_typeof(p_data->'label_ids') is distinct from 'array' then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
   select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_data->'label_ids');
   if cardinality(ids)>20 or (select count(distinct x) from unnest(ids) x)<>cardinality(ids)
    or (select count(*) from public.workspace_labels where workspace_id=w and id=any(ids))<>cardinality(ids) then raise exception 'INVALID_LABELS' using errcode='22023'; end if;
   select coalesce(jsonb_agg(label_id order by label_id),'[]'::jsonb) into old_value from public.task_labels where task_id=tid;
   delete from public.task_labels where task_id=tid;
   insert into public.task_labels select tid,x from unnest(ids) x;
   new_value:=to_jsonb(ids);
   old_labels:=old_value;
  end if;
  if p_action in ('checklist','task_details') then
   if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items')>100 then raise exception 'INVALID_CHECKLIST' using errcode='22023'; end if;
   select coalesce(jsonb_agg(to_jsonb(c) order by position,id),'[]'::jsonb) into old_value from public.task_checklist c where task_id=tid;
   delete from public.task_checklist where task_id=tid;
   n:=0;
   for item in select value from jsonb_array_elements(p_data->'items') loop
    if jsonb_typeof(item->'body') is distinct from 'string' or jsonb_typeof(item->'done') is distinct from 'boolean' then raise exception 'INVALID_CHECKLIST' using errcode='22023'; end if;
    insert into public.task_checklist(id,task_id,body,done,position) values((item->>'id')::uuid,tid,btrim(item->>'body'),(item->>'done')::boolean,n);
    n:=n+1;
   end loop;
   new_value:=p_data->'items';
   if p_action='task_details' then
    old_value:=jsonb_build_object('label_ids',old_labels,'items',old_value);
    new_value:=jsonb_build_object('label_ids',p_data->'label_ids','items',new_value);
   end if;
  elsif p_action='duplicate_task' then
   lid:=(p_data->>'new_id')::uuid;
   select coalesce(max(position),-1)+1 into pos from public.board_tasks where board_id=p_board and status=t.status and archived_at is null;
   insert into public.board_tasks(id,board_id,title,description,status,priority,assignee_id,due_date,position)
    values(lid,p_board,left(t.title,110)||' (bản sao)',t.description,t.status,t.priority,t.assignee_id,t.due_date,pos);
   insert into public.task_labels select lid,label_id from public.task_labels where task_id=tid;
   insert into public.task_checklist select gen_random_uuid(),lid,body,false,position from public.task_checklist where task_id=tid;
  end if;
  if p_action in ('task_labels','checklist','task_details') then
   insert into public.task_activity(task_id,actor_id,actor_name,action,changes)
    values(tid,auth.uid(),coalesce((select nullif(btrim(raw_user_meta_data->>'display_name'),'') from auth.users where id=auth.uid()),'Thành viên'),'updated',
    jsonb_build_object(p_action,jsonb_build_object('before',old_value,'after',new_value)));
  end if;
  update public.boards set version=version+1 where id=p_board;
 end if;
 insert into public.board_mutations values(p_board,auth.uid(),p_mutation,req);
 return public.board_snapshot(p_board);
end; $$;

create or replace function public.task_thread(p_board uuid,p_task uuid,p_before_comment timestamptz default null,p_before_comment_id uuid default null,p_before_activity bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb;
begin
 value:=workspace_internal.task_thread(p_board,p_task,p_before_comment,p_before_comment_id,p_before_activity);
 if exists(select 1 from public.boards b join public.workspaces w on w.id=b.workspace_id where b.id=p_board and w.archived_at is not null) then value:=value||'{"can_comment":false}'::jsonb; end if;
 return value||jsonb_build_object('comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (
  select id,actor_id,actor_name,body,created_at,version,edited_at,deleted_at from public.task_comments where task_id=p_task
  and (p_before_comment is null or (created_at,id)<(p_before_comment,p_before_comment_id)) order by created_at desc,id desc limit 50
 ) c),'[]'::jsonb));
end; $$;
create function public.task_comment_mutate(p_board uuid,p_task uuid,p_comment uuid,p_version integer,p_mutation uuid,p_action text,p_body text default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid; b public.boards%rowtype; t public.board_tasks%rowtype; c public.task_comments%rowtype; r text; prev jsonb;
 req jsonb:=jsonb_build_object('board',p_board,'task',p_task,'version',p_version,'action',p_action,'body',p_body,'reason',p_reason);
begin
 select workspace_id into w from public.boards where id=p_board;
 perform workspace_internal.active(w);
 select * into b from public.boards where id=p_board for update;
 r:=public.workspace_role(w);
 if r not in ('owner','member') or r is null then raise exception 'WRITE_DENIED' using errcode='42501'; end if;
 select * into t from public.board_tasks where id=p_task and board_id=p_board;
 if not found then raise exception 'TASK_NOT_FOUND' using errcode='22023'; end if;
 select * into c from public.task_comments where id=p_comment and task_id=p_task for update;
 if not found then raise exception 'COMMENT_NOT_FOUND' using errcode='22023'; end if;
 if p_mutation is null or p_version is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select request into prev from workspace_internal.comment_mutations where comment_id=p_comment and actor=auth.uid() and mutation_id=p_mutation;
 if found then
  if prev is distinct from req then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return public.task_thread(p_board,p_task);
 end if;
 if b.archived_at is not null or t.archived_at is not null then raise exception 'TASK_ARCHIVED' using errcode='22023'; end if;
 if c.actor_id is distinct from auth.uid() and (p_action is distinct from 'delete' or r<>'owner') then raise exception 'COMMENT_AUTHOR_REQUIRED' using errcode='42501'; end if;
 if c.version<>p_version then raise exception 'COMMENT_CONFLICT' using errcode='PT409'; end if;
 if c.deleted_at is not null then raise exception 'COMMENT_DELETED' using errcode='22023'; end if;
 if p_action='edit' then
  if p_body is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  update public.task_comments set body=btrim(p_body),edited_at=now(),version=version+1 where id=p_comment;
 elsif p_action='delete' then
  if c.actor_id is distinct from auth.uid() then
   if coalesce(char_length(btrim(p_reason)),0) not between 1 and 500 then raise exception 'REASON_REQUIRED' using errcode='22023'; end if;
   perform workspace_internal.touch(w,'comment_moderated',jsonb_build_object('comment_id',p_comment,'task_id',p_task,'reason',btrim(p_reason)));
  end if;
  update public.task_comments set body=null,deleted_at=now(),version=version+1 where id=p_comment;
 else raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 insert into workspace_internal.comment_mutations values(p_comment,auth.uid(),p_mutation,req);
 return public.task_thread(p_board,p_task);
end; $$;
revoke all on all functions in schema workspace_internal from public,anon,authenticated;
revoke all on function public.board_snapshot(uuid),public.task_comment_mutate(uuid,uuid,uuid,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.board_snapshot(uuid),public.task_comment_mutate(uuid,uuid,uuid,integer,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
