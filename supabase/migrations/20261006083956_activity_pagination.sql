-- Read-only pages; authorization stays in the existing task/workspace APIs.
create function public.activity_page(p_source text,p_workspace uuid default null,p_board uuid default null,p_task uuid default null,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer; actual integer; rows jsonb;
begin
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 50 then raise exception 'INVALID_PAGE' using errcode='22023'; end if;
 if p_source in ('comments','task_activity') then
  perform public.task_thread(p_board,p_task);
 elsif p_source='workspace_activity' then
  perform public.workspace_activity_list(p_workspace,null,1);
 else raise exception 'INVALID_SOURCE' using errcode='22023'; end if;
 if p_source='comments' then
  select count(*) into n from public.task_comments where task_id=p_task;
  actual:=least(p_page,greatest(1,(n+p_page_size-1)/p_page_size));
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc),'[]') into rows from (select id,actor_id,actor_name,body,created_at,version,edited_at,deleted_at from public.task_comments where task_id=p_task order by created_at desc,id desc limit p_page_size offset (actual-1)*p_page_size) c;
 elsif p_source='task_activity' then
  select count(*) into n from public.task_activity where task_id=p_task;
  actual:=least(p_page,greatest(1,(n+p_page_size-1)/p_page_size));
  select coalesce(jsonb_agg(to_jsonb(a)-'sequence' order by a.sequence desc),'[]') into rows from (select id as sequence,id::text as id,actor_id,actor_name,action,changes,created_at from public.task_activity where task_id=p_task order by id desc limit p_page_size offset (actual-1)*p_page_size) a;
 else
  select count(*) into n from public.workspace_activity where workspace_id=p_workspace;
  actual:=least(p_page,greatest(1,(n+p_page_size-1)/p_page_size));
  select coalesce(jsonb_agg(to_jsonb(a)-'sequence' order by a.sequence desc),'[]') into rows from (select id as sequence,id::text as id,actor_id,action,changes,created_at from public.workspace_activity where workspace_id=p_workspace order by id desc limit p_page_size offset (actual-1)*p_page_size) a;
 end if;
 return jsonb_build_object('items',rows,'page',actual,'pageSize',p_page_size,'total',n);
end; $$;
revoke all on function public.activity_page(text,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.activity_page(text,uuid,uuid,uuid,integer,integer) to authenticated;

create function public.task_thread_page(p_board uuid,p_task uuid,p_comment_page integer default 1,p_activity_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb; comments jsonb; activity jsonb;
begin
 base:=public.task_thread(p_board,p_task);
 comments:=public.activity_page('comments',null,p_board,p_task,p_comment_page,p_page_size);
 activity:=public.activity_page('task_activity',null,p_board,p_task,p_activity_page,p_page_size);
 return jsonb_build_object('can_comment',base->'can_comment','comments',comments->'items','activity',activity->'items','comment_page',comments-'items','activity_page',activity-'items');
end; $$;
revoke all on function public.task_thread_page(uuid,uuid,integer,integer,integer) from public,anon;
grant execute on function public.task_thread_page(uuid,uuid,integer,integer,integer) to authenticated;
