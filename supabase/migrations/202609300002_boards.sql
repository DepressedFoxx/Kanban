begin;
create table public.boards (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 archived_at timestamptz, version integer not null default 1,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index boards_workspace on public.boards(workspace_id);
create table public.board_tasks (
 id uuid primary key, board_id uuid not null references public.boards(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 120),
 description text not null default '' check (char_length(description)<=2000),
 status text not null check(status in ('todo','doing','review','done')),
 priority text not null check(priority in ('low','medium','high')),
 assignee_id uuid references auth.users(id), due_date date,
 position integer not null, archived_at timestamptz,
 created_at timestamptz not null default now()
);
create index board_tasks_order on public.board_tasks(board_id,status,position,id);
create table public.board_mutations (
 board_id uuid not null references public.boards(id) on delete cascade,
 actor uuid not null references auth.users(id), mutation_id uuid not null,
 request jsonb not null, primary key(board_id,actor,mutation_id)
);
alter table public.boards enable row level security;
alter table public.board_tasks enable row level security;
alter table public.board_mutations enable row level security;
revoke all on public.boards,public.board_tasks,public.board_mutations from anon,authenticated;
grant select on public.boards,public.board_tasks to authenticated;
create policy boards_read on public.boards for select to authenticated using(public.workspace_role(workspace_id) is not null);
create policy board_tasks_read on public.board_tasks for select to authenticated using(exists(select 1 from public.boards b where b.id=board_id and public.workspace_role(b.workspace_id) is not null));

create function public.board_list(p_workspace uuid) returns setof public.boards
language plpgsql stable security definer set search_path='' as $$
begin
 if public.workspace_role(p_workspace) is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 return query select * from public.boards where workspace_id=p_workspace order by created_at,id;
end; $$;
create function public.board_create(p_workspace uuid,p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces where id=p_workspace for update;
 if public.workspace_role(p_workspace) is distinct from 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if exists(select 1 from public.boards where id=p_id and workspace_id=p_workspace and created_by=auth.uid() and name=btrim(p_name)) then return p_id; end if;
 insert into public.boards(id,workspace_id,name,created_by) values(p_id,p_workspace,btrim(p_name),auth.uid());
 return p_id;
end; $$;
create function public.board_snapshot(p_board uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b public.boards%rowtype; r text;
begin
 select * into b from public.boards where id=p_board;
 r:=public.workspace_role(b.workspace_id);
 if r is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 return jsonb_build_object('board',to_jsonb(b),'role',r,
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.position,t.id) from public.board_tasks t where t.board_id=p_board),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.workspace_member_list(b.workspace_id) m),'[]'::jsonb));
end; $$;

-- One workspace/board lock order for all mutations; board version protects ordering as well as edits.
create function public.board_mutate(p_board uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.boards%rowtype; w uuid; r text; t public.board_tasks%rowtype;
 v_id uuid; v_assignee uuid; v_status text; v_position integer; v_order uuid[];
 v_request jsonb:=jsonb_build_object('action',p_action,'data',p_data,'version',p_version); v_previous jsonb;
begin
 select workspace_id into w from public.boards where id=p_board;
 perform 1 from public.workspaces where id=w for update;
 select * into b from public.boards where id=p_board for update;
 r:=public.workspace_role(w);
 if r is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 if p_mutation is null or p_action is null or p_data is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select request into v_previous from public.board_mutations where board_id=p_board and actor=auth.uid() and mutation_id=p_mutation;
 if found then
  if v_previous is distinct from v_request then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return public.board_snapshot(p_board);
 end if;
 if p_action in ('rename','archive_board','restore_board') then
  if r<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 elsif p_action in ('save_task','move_task','archive_task','restore_task') then
  if r not in ('owner','member') then raise exception 'WRITE_DENIED' using errcode='42501'; end if;
  if b.archived_at is not null then raise exception 'BOARD_ARCHIVED' using errcode='22023'; end if;
 else raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 if p_version is distinct from b.version then raise exception 'BOARD_CONFLICT' using errcode='40001'; end if;
 if p_action='rename' then
  if b.archived_at is not null then raise exception 'BOARD_ARCHIVED' using errcode='22023'; end if;
  update public.boards set name=btrim(p_data->>'name') where id=p_board;
 elsif p_action='archive_board' then update public.boards set archived_at=now() where id=p_board;
 elsif p_action='restore_board' then update public.boards set archived_at=null where id=p_board;
 else
  v_id:=(p_data->>'id')::uuid;
  select * into t from public.board_tasks where id=v_id and board_id=p_board;
  if p_action='save_task' then
   if t.archived_at is not null then raise exception 'TASK_ARCHIVED' using errcode='22023'; end if;
   v_assignee:=nullif(p_data->>'assignee_id','')::uuid;
   if v_assignee is not null and not exists(select 1 from public.workspace_members where workspace_id=w and user_id=v_assignee) then
    raise exception 'INVALID_ASSIGNEE' using errcode='22023'; end if;
   v_status:=p_data->>'status';
   if t.id is null or t.status<>v_status then
    select coalesce(max(position),-1)+1 into v_position from public.board_tasks where board_id=p_board and status=v_status and archived_at is null;
   else v_position:=t.position; end if;
   if t.id is null then
    insert into public.board_tasks(id,board_id,title,description,status,priority,assignee_id,due_date,position)
    values(v_id,p_board,btrim(p_data->>'title'),p_data->>'description',v_status,p_data->>'priority',v_assignee,nullif(p_data->>'due_date','')::date,v_position);
   else
    update public.board_tasks set title=btrim(p_data->>'title'),description=p_data->>'description',status=v_status,priority=p_data->>'priority',assignee_id=v_assignee,due_date=nullif(p_data->>'due_date','')::date,position=v_position where id=v_id and board_id=p_board;
   end if;
  else
   if t.id is null then raise exception 'TASK_NOT_FOUND' using errcode='22023'; end if;
   if p_action='archive_task' then update public.board_tasks set archived_at=now() where id=v_id;
   elsif p_action='restore_task' then
    select coalesce(max(position),-1)+1 into v_position from public.board_tasks where board_id=p_board and status=t.status and archived_at is null;
    update public.board_tasks set archived_at=null,position=v_position where id=v_id;
   else
    if t.archived_at is not null then raise exception 'TASK_ARCHIVED' using errcode='22023'; end if;
    v_status:=p_data->>'status'; v_position:=(p_data->>'position')::integer;
    if v_status is null or v_status not in ('todo','doing','review','done') or v_position is null or v_position<0 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    select coalesce(array_agg(id order by position,id),'{}'::uuid[]) into v_order from public.board_tasks where board_id=p_board and status=v_status and archived_at is null and id<>v_id;
    v_position:=least(v_position,cardinality(v_order));
    v_order:=v_order[1:v_position] || array[v_id] || v_order[v_position+1:cardinality(v_order)];
    update public.board_tasks x set status=v_status,position=o.n::integer-1 from unnest(v_order) with ordinality o(id,n) where x.id=o.id and x.board_id=p_board;
   end if;
  end if;
 end if;
 update public.boards set version=version+1 where id=p_board;
 insert into public.board_mutations(board_id,actor,mutation_id,request) values(p_board,auth.uid(),p_mutation,v_request);
 return public.board_snapshot(p_board);
end; $$;

-- Removing a member also removes their assignments and invalidates stale board snapshots.
create function public.board_unassign_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.boards set version=version+1 where workspace_id=old.workspace_id;
 update public.board_tasks t set assignee_id=null from public.boards b where t.board_id=b.id and b.workspace_id=old.workspace_id and t.assignee_id=old.user_id;
 return old;
end; $$;
create trigger board_member_removed after delete on public.workspace_members for each row execute function public.board_unassign_member();
revoke all on function public.board_unassign_member() from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('board_list','board_create','board_snapshot','board_mutate') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
