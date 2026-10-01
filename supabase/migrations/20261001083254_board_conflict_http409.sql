-- Application version conflicts are HTTP 409, not database serialization failures.
-- SQLSTATE 40001 can cause PostgREST transaction retry loops. Preserve grants/RLS.
begin;
create or replace function public.board_mutate(p_board uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb) returns jsonb
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
 if p_version is distinct from b.version then raise exception 'BOARD_CONFLICT' using errcode='PT409'; end if;
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
notify pgrst,'reload schema';
commit;
