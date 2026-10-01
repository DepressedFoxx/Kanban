begin;
create table public.task_comments (
 id uuid primary key,
 task_id uuid not null references public.board_tasks(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 actor_name text not null,
 body text not null check (char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index task_comments_task on public.task_comments(task_id,created_at,id);
create table public.task_activity (
 id bigint generated always as identity primary key,
 task_id uuid not null references public.board_tasks(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 actor_name text not null,
 action text not null check(action in ('created','updated','archived','restored')),
 changes jsonb not null,
 created_at timestamptz not null default now()
);
create index task_activity_task on public.task_activity(task_id,id);
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
revoke all on public.task_comments,public.task_activity from anon,authenticated;
grant select on public.task_comments,public.task_activity to authenticated;
create policy task_comments_read on public.task_comments for select to authenticated using(exists(select 1 from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=task_id and public.workspace_role(b.workspace_id) is not null));
create policy task_activity_read on public.task_activity for select to authenticated using(exists(select 1 from public.board_tasks t join public.boards b on b.id=t.board_id where t.id=task_id and public.workspace_role(b.workspace_id) is not null));

-- Audit rows are created in the same transaction as the existing board RPCs.
create function public.task_record_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb:=to_jsonb(new); v_changes jsonb:='{}'; v_key text; v_action text:='updated'; v_name text;
begin
 if TG_OP='INSERT' then v_before:='{}';v_action:='created'; else v_before:=to_jsonb(old); end if;
 foreach v_key in array array['title','description','status','priority','assignee_id','due_date','position','archived_at'] loop
  if (v_before->v_key) is distinct from (v_after->v_key) then
   v_changes:=v_changes||jsonb_build_object(v_key,jsonb_build_object('before',v_before->v_key,'after',v_after->v_key));
  end if;
 end loop;
 if v_changes='{}'::jsonb then return new; end if;
 if TG_OP='UPDATE' then
  if old.archived_at is null and new.archived_at is not null then v_action:='archived';
  elsif old.archived_at is not null and new.archived_at is null then v_action:='restored'; end if;
 end if;
 select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),'Thành viên') into v_name from auth.users where id=auth.uid();
 insert into public.task_activity(task_id,actor_id,actor_name,action,changes)
 values(new.id,auth.uid(),coalesce(v_name,'Hệ thống'),v_action,v_changes);
 return new;
end; $$;
create trigger task_record_activity after insert or update on public.board_tasks for each row execute function public.task_record_activity();
revoke all on function public.task_record_activity() from public,anon,authenticated;

-- Separate cursors let either timeline page independently without dropping entries.
create function public.task_thread(p_board uuid,p_task uuid,p_before_comment timestamptz default null,p_before_comment_id uuid default null,p_before_activity bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_board public.boards%rowtype; v_task public.board_tasks%rowtype; v_role text;
begin
 select * into v_board from public.boards where id=p_board;
 v_role:=public.workspace_role(v_board.workspace_id);
 if v_role is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 select * into v_task from public.board_tasks where id=p_task and board_id=p_board;
 if not found then raise exception 'TASK_NOT_FOUND' using errcode='22023'; end if;
 return jsonb_build_object('can_comment',v_role in ('owner','member') and v_board.archived_at is null and v_task.archived_at is null,
 'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (
  select id,actor_id,actor_name,body,created_at from public.task_comments where task_id=p_task
  and (p_before_comment is null or (created_at,id)<(p_before_comment,p_before_comment_id)) order by created_at desc,id desc limit 50
 ) c),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.sequence desc) from (
  select id as sequence,id::text as id,actor_id,actor_name,action,changes,created_at from public.task_activity where task_id=p_task
  and (p_before_activity is null or id<p_before_activity) order by id desc limit 50
 ) a),'[]'::jsonb));
end; $$;
create function public.task_comment_add(p_board uuid,p_task uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_workspace uuid; v_board public.boards%rowtype; v_task public.board_tasks%rowtype; v_existing public.task_comments%rowtype; v_role text; v_name text;
begin
 select workspace_id into v_workspace from public.boards where id=p_board;
 perform 1 from public.workspaces where id=v_workspace for update;
 select * into v_board from public.boards where id=p_board for update;
 v_role:=public.workspace_role(v_workspace);
 if v_role is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 if v_role not in ('owner','member') then raise exception 'WRITE_DENIED' using errcode='42501'; end if;
 select * into v_task from public.board_tasks where id=p_task and board_id=p_board;
 if not found then raise exception 'TASK_NOT_FOUND' using errcode='22023'; end if;
 select * into v_existing from public.task_comments where id=p_id;
 if found then
  if v_existing.task_id=p_task and v_existing.actor_id=auth.uid() and v_existing.body=btrim(p_body) then return public.task_thread(p_board,p_task); end if;
  raise exception 'MUTATION_REUSED' using errcode='22023';
 end if;
 if v_board.archived_at is not null then raise exception 'BOARD_ARCHIVED' using errcode='22023'; end if;
 if v_task.archived_at is not null then raise exception 'TASK_ARCHIVED' using errcode='22023'; end if;
 select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),'Thành viên') into v_name from auth.users where id=auth.uid();
 insert into public.task_comments(id,task_id,actor_id,actor_name,body) values(p_id,p_task,auth.uid(),v_name,btrim(p_body));
 return public.task_thread(p_board,p_task);
end; $$;
revoke all on function public.task_thread(uuid,uuid,timestamptz,uuid,bigint), public.task_comment_add(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.task_thread(uuid,uuid,timestamptz,uuid,bigint), public.task_comment_add(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
