begin;

create index board_tasks_assigned_active on public.board_tasks(assignee_id,board_id,due_date,id) where archived_at is null;

create table public.task_saved_filters (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 60),
 filters jsonb not null, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index task_saved_filters_name on public.task_saved_filters(user_id,lower(btrim(name)));
alter table public.task_saved_filters enable row level security;
revoke all on public.task_saved_filters from public,anon,authenticated;
grant select on public.task_saved_filters to authenticated;
create policy saved_filters_read on public.task_saved_filters for select to authenticated using(user_id=(select auth.uid()));
create table workspace_internal.saved_filter_mutations (
 user_id uuid not null references auth.users(id) on delete cascade, mutation_id uuid not null,
 request jsonb not null, primary key(user_id,mutation_id)
);
alter table workspace_internal.saved_filter_mutations enable row level security;
revoke all on workspace_internal.saved_filter_mutations from public,anon,authenticated;

-- Both query and saved presets use the same allowlist; never persist arbitrary query operators.
create function workspace_internal.task_filters(p_filters jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare f jsonb; k text; v text; d date;
begin
 if jsonb_typeof(p_filters) is distinct from 'object' or
 (p_filters-'view'-'workspace'-'board'-'status'-'priority'-'label'-'from'-'to'-'search'-'sort')<>'{}'::jsonb
 then raise exception 'INVALID_FILTERS' using errcode='22023'; end if;
 f:='{"view":"open","workspace":"","board":"","status":"","priority":"","label":"","from":"","to":"","search":"","sort":"due"}'::jsonb||p_filters;
 for k,v in select key,value from jsonb_each_text(f) loop
  if jsonb_typeof(f->k) is distinct from 'string' then raise exception 'INVALID_FILTERS' using errcode='22023'; end if;
  if k in ('workspace','board','label') and v<>'' then perform v::uuid; end if;
  if k in ('from','to') and v<>'' then
   if v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_FILTERS' using errcode='22023'; end if;
   d:=v::date;
  end if;
 end loop;
 if f->>'view' not in ('all','open','overdue','today','upcoming','completed')
 or f->>'sort' not in ('due','priority','newest','title')
 or f->>'status' not in ('','todo','doing','review','done')
 or f->>'priority' not in ('','low','medium','high')
 or char_length(f->>'search')>100
 or (f->>'from'<>'' and f->>'to'<>'' and (f->>'from')::date>(f->>'to')::date)
 then raise exception 'INVALID_FILTERS' using errcode='22023'; end if;
 return jsonb_set(f,'{search}',to_jsonb(btrim(f->>'search')));
end; $$;

create function public.my_tasks_query(p_filters jsonb default '{}'::jsonb,p_page integer default 1,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb; answer jsonb; options jsonb;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 f:=workspace_internal.task_filters(p_filters);
 if p_page is null or p_page<1 or p_page>100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'INVALID_PAGE' using errcode='22023'; end if;

 with visible as materialized (
 select t.id,t.board_id,t.title,t.description,t.status,t.priority,t.due_date,t.created_at,
 b.name board_name,w.id workspace_id,w.name workspace_name,w.timezone,
 (now() at time zone w.timezone)::date today
 from public.board_tasks t join public.boards b on b.id=t.board_id
 join public.workspaces w on w.id=b.workspace_id
 join public.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid()
 where t.assignee_id=auth.uid() and t.archived_at is null and b.archived_at is null and w.archived_at is null
 and (f->>'workspace'='' or w.id=nullif(f->>'workspace','')::uuid)
 and (f->>'board'='' or b.id=nullif(f->>'board','')::uuid)
 and (f->>'status'='' or t.status=f->>'status')
 and (f->>'priority'='' or t.priority=f->>'priority')
 and (f->>'label'='' or exists(select 1 from public.task_labels tl where tl.task_id=t.id and tl.label_id=nullif(f->>'label','')::uuid))
 and (f->>'from'='' or t.due_date>=nullif(f->>'from','')::date)
 and (f->>'to'='' or t.due_date<=nullif(f->>'to','')::date)
 and (f->>'search'='' or strpos(lower(t.title||' '||t.description),lower(f->>'search'))>0)
 ), filtered as materialized (
 select * from visible v where
 case f->>'view'
 when 'open' then v.status<>'done'
 when 'completed' then v.status='done'
 when 'overdue' then v.status<>'done' and v.due_date<v.today
 when 'today' then v.status<>'done' and v.due_date=v.today
 when 'upcoming' then v.status<>'done' and v.due_date>v.today and v.due_date<=v.today+7
 else true end
 ), counted as (select count(*)::integer total from filtered),
 paging as (select total,least(p_page,greatest(1,(total+p_limit-1)/p_limit)) page from counted),
 ordered as (
 select v.*,row_number() over(order by
 case when f->>'sort'='due' then v.due_date end asc nulls last,
 case when f->>'sort'='priority' then case v.priority when 'high' then 0 when 'medium' then 1 else 2 end end asc,
 case when f->>'sort'='newest' then v.created_at end desc,
 case when f->>'sort'='title' then lower(v.title) end collate "C" asc,
 v.id asc) rn from filtered v
 ), page_rows as (
 select o.* from ordered o cross join paging p where o.rn>(p.page-1)*p_limit and o.rn<=p.page*p_limit
 )
 select jsonb_build_object('total',p.total,'page',p.page,'limit',p_limit,'filters',f,
 'items',coalesce((select jsonb_agg((to_jsonb(x)-'rn')||jsonb_build_object(
 'overdue',x.status<>'done' and coalesce(x.due_date<x.today,false),
 'labels',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'color',l.color) order by lower(l.name),l.id)
 from public.task_labels tl join public.workspace_labels l on l.id=tl.label_id where tl.task_id=x.id),'[]'::jsonb)
 ) order by x.rn) from page_rows x),'[]'::jsonb)) into answer from paging p;

 select jsonb_build_object(
 'workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name) order by lower(w.name),w.id) from public.workspaces w join public.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid() where w.archived_at is null),'[]'::jsonb),
 'boards',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'workspace_id',b.workspace_id) order by lower(b.name),b.id) from public.boards b join public.workspaces w on w.id=b.workspace_id join public.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid() where w.archived_at is null and b.archived_at is null),'[]'::jsonb),
 'labels',coalesce((select jsonb_agg(to_jsonb(l) order by lower(l.name),l.id) from public.workspace_labels l join public.workspaces w on w.id=l.workspace_id join public.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid() where w.archived_at is null),'[]'::jsonb)
 ) into options;
 return answer||jsonb_build_object('options',options,'saved',coalesce((select jsonb_agg(to_jsonb(s) order by lower(s.name),s.id) from public.task_saved_filters s where s.user_id=auth.uid()),'[]'::jsonb));
end; $$;

create function public.task_saved_filter_mutate(p_id uuid,p_version integer,p_mutation uuid,p_action text,p_name text default null,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_filter public.task_saved_filters%rowtype; prior jsonb; f jsonb;
 req jsonb:=jsonb_build_object('id',p_id,'version',p_version,'action',p_action,'name',p_name,'filters',p_filters);
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 if p_id is null or p_mutation is null or p_version is null or p_action is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('saved-filters:'||auth.uid()::text,0));
 select request into prior from workspace_internal.saved_filter_mutations where user_id=auth.uid() and mutation_id=p_mutation;
 if found then
  if prior is distinct from req then raise exception 'MUTATION_REUSED' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'mutation_id',p_mutation);
 end if;
 select * into current_filter from public.task_saved_filters where id=p_id;
 if found and current_filter.user_id<>auth.uid() then raise exception 'FILTER_ACCESS_DENIED' using errcode='42501'; end if;
 if p_action='save' then
  f:=workspace_internal.task_filters(p_filters);
  if current_filter.id is null then
   if p_version<>0 then raise exception 'FILTER_CONFLICT' using errcode='PT409'; end if;
   if (select count(*) from public.task_saved_filters where user_id=auth.uid())>=20 then raise exception 'FILTER_LIMIT' using errcode='22023'; end if;
   insert into public.task_saved_filters(id,user_id,name,filters) values(p_id,auth.uid(),btrim(p_name),f);
  else
   if current_filter.version<>p_version then raise exception 'FILTER_CONFLICT' using errcode='PT409'; end if;
   update public.task_saved_filters set name=btrim(p_name),filters=f,version=version+1,updated_at=now() where id=p_id;
  end if;
 elsif p_action='delete' then
  if current_filter.id is null or current_filter.version<>p_version then raise exception 'FILTER_CONFLICT' using errcode='PT409'; end if;
  delete from public.task_saved_filters where id=p_id and user_id=auth.uid();
 else raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 insert into workspace_internal.saved_filter_mutations values(auth.uid(),p_mutation,req);
 return jsonb_build_object('ok',true,'mutation_id',p_mutation);
end; $$;
revoke all on function workspace_internal.task_filters(jsonb) from public,anon,authenticated;
revoke all on function public.my_tasks_query(jsonb,integer,integer),public.task_saved_filter_mutate(uuid,integer,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.my_tasks_query(jsonb,integer,integer),public.task_saved_filter_mutate(uuid,integer,uuid,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
