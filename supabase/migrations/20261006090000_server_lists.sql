-- Approved additive APIs. Existing membership/verified-account checks remain authoritative.
create function workspace_internal.page_json(p_items jsonb,p_page integer,p_page_size integer,p_filters jsonb default '{}') returns jsonb
language plpgsql immutable set search_path='' as $$
declare answer jsonb;
begin
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 50 or jsonb_typeof(p_filters) is distinct from 'object' then raise exception 'INVALID_PAGE' using errcode='22023'; end if;
 with filtered as materialized (
  select value, ordinality from jsonb_array_elements(p_items) with ordinality
  where (not(p_filters?'archived') or (value->>'archived_at' is not null)=(p_filters->>'archived')::boolean)
  and (coalesce(p_filters->>'search','')='' or strpos(lower(concat_ws(' ',value->>'name',value->>'title',value->>'description',value->>'email',value->>'display_name',value->>'assignee_name')),lower(p_filters->>'search'))>0)
  and (coalesce(p_filters->>'status','all')='all' or value->>'status'=p_filters->>'status')
  and (coalesce(p_filters->>'priority','all')='all' or value->>'priority'=p_filters->>'priority')
  and (coalesce(p_filters->>'assignee','all')='all' or case when p_filters->>'assignee'='none' then value->>'assignee_id' is null else value->>'assignee_id'=p_filters->>'assignee' end)
 ), counts as (select count(*)::integer total from filtered), paging as (select total,least(p_page,greatest(1,(total+p_page_size-1)/p_page_size)) page from counts)
 select jsonb_build_object('total',p.total,'page',p.page,'pageSize',p_page_size,'items',coalesce((select jsonb_agg(x.value order by x.ordinality) from (select * from filtered order by ordinality limit p_page_size offset (p.page-1)*p_page_size) x),'[]'::jsonb)) into answer from paging p;
 return answer;
end; $$;
revoke all on function workspace_internal.page_json(jsonb,integer,integer,jsonb) from public,anon,authenticated;

create function public.app_list_query(p_source text,p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}',p_workspace uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if p_source='workspaces' then select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc,w.id),'[]') into items from public.workspace_list() w;
 elsif p_source='boards' then select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id),'[]') into items from public.board_list(p_workspace) b;
 elsif p_source='members' then select coalesce(jsonb_agg(to_jsonb(m) order by lower(m.email),m.user_id),'[]') into items from public.workspace_member_list(p_workspace) m;
 elsif p_source='invitations' then select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id),'[]') into items from public.workspace_invitation_list(p_workspace) i;
 else raise exception 'INVALID_SOURCE' using errcode='22023'; end if;
 return workspace_internal.page_json(items,p_page,p_page_size,p_filters);
end; $$;
revoke all on function public.app_list_query(text,integer,integer,jsonb,uuid) from public,anon;
grant execute on function public.app_list_query(text,integer,integer,jsonb,uuid) to authenticated;

create function public.board_page_query(p_board uuid,p_pages jsonb default '{}',p_page_size integer default 20,p_filters jsonb default '{}',p_task uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb; tasks jsonb; subset jsonb:='[]'; pages jsonb:='{}'; part jsonb; state text; detail jsonb;
begin
 base:=public.board_snapshot(p_board);
 select coalesce(jsonb_agg(t.value||jsonb_build_object('assignee_name',coalesce(m.value->>'display_name','')||' '||coalesce(m.value->>'email','')) order by t.ordinality),'[]') into tasks
 from jsonb_array_elements(base->'tasks') with ordinality t
 left join jsonb_array_elements(base->'members') m on m.value->>'user_id'=t.value->>'assignee_id';
 foreach state in array array['todo','doing','review','done','archived'] loop
  part:=workspace_internal.page_json(tasks,coalesce((p_pages->>state)::integer,1),p_page_size,p_filters||case when state='archived' then '{"archived":true}'::jsonb else jsonb_build_object('status',state,'archived',false) end);
  pages:=pages||jsonb_build_object(state,part-'items'); subset:=subset||(part->'items');
 end loop;
 if p_task is not null then select value into detail from jsonb_array_elements(tasks) where value->>'id'=p_task::text; end if;
 return base||jsonb_build_object('tasks',subset,'pages',pages,'detail',detail);
end; $$;
revoke all on function public.board_page_query(uuid,jsonb,integer,jsonb,uuid) from public,anon;
grant execute on function public.board_page_query(uuid,jsonb,integer,jsonb,uuid) to authenticated;

create function public.board_page_mutate(p_board uuid,p_version integer,p_mutation uuid,p_action text,p_data jsonb,p_pages jsonb default '{}',p_page_size integer default 20,p_filters jsonb default '{}',p_task uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.board_mutate(p_board,p_version,p_mutation,p_action,p_data);
 return public.board_page_query(p_board,p_pages,p_page_size,p_filters,p_task);
end; $$;
revoke all on function public.board_page_mutate(uuid,integer,uuid,text,jsonb,jsonb,integer,jsonb,uuid) from public,anon;
grant execute on function public.board_page_mutate(uuid,integer,uuid,text,jsonb,jsonb,integer,jsonb,uuid) to authenticated;

create function public.notification_page(p_page integer default 1,p_page_size integer default 20,p_unread boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb; base jsonb; actual_page integer; total integer;
begin
 base:=public.notification_feed(null,false,1);
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 50 or p_unread is null then raise exception 'INVALID_PAGE' using errcode='22023'; end if;
 select count(*) into total from workspace_internal.notifications n where n.user_id=auth.uid() and workspace_internal.notification_visible(n) and (not p_unread or n.read_at is null);
 actual_page:=least(p_page,greatest(1,(total+p_page_size-1)/p_page_size));
 with page as (select n.* from workspace_internal.notifications n where n.user_id=auth.uid() and workspace_internal.notification_visible(n) and (not p_unread or n.read_at is null) order by n.id desc limit p_page_size offset (actual_page-1)*p_page_size)
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'kind',n.kind,'workspace_id',n.workspace_id,'workspace_name',w.name,'task_id',n.task_id,'board_id',t.board_id,'title',coalesce(t.title,w.name),'invitation_id',n.invitation_id,'invitation_role',i.role,'created_at',n.created_at,'read',n.read_at is not null,'version',n.version) order by n.id desc),'[]') into answer from page n join public.workspaces w on w.id=n.workspace_id left join public.board_tasks t on t.id=n.task_id left join public.workspace_invitations i on i.id=n.invitation_id;
 return base||jsonb_build_object('items',answer,'next',null,'page',actual_page,'pageSize',p_page_size,'total',total);
end; $$;
revoke all on function public.notification_page(integer,integer,boolean) from public,anon;
grant execute on function public.notification_page(integer,integer,boolean) to authenticated;
