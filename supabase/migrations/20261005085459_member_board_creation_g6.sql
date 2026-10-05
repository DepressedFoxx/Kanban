-- Match the v1 role matrix. Public wrapper retains active-workspace locking.
create or replace function workspace_internal.board_create(p_workspace uuid,p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces where id=p_workspace for update;
 if coalesce(public.workspace_role(p_workspace),'') not in ('owner','member') then
   raise exception 'WORKSPACE_WRITE_DENIED' using errcode='42501';
 end if;
 if exists(select 1 from public.boards where id=p_id and workspace_id=p_workspace and created_by=auth.uid() and name=btrim(p_name)) then return p_id; end if;
 insert into public.boards(id,workspace_id,name,created_by) values(p_id,p_workspace,btrim(p_name),auth.uid());
 return p_id;
end; $$;
revoke all on function workspace_internal.board_create(uuid,uuid,text) from public,anon,authenticated;
