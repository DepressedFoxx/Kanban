-- Run only after task-files has been deployed to this project.
-- No secret is included in the cron command or returned to the client.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
insert into workspace_internal.attachment_cleanup_config(singleton,endpoint)
values(true,'https://xhycrgdupstnxnbfyezk.supabase.co/functions/v1/task-files')
on conflict(singleton) do update set endpoint=excluded.endpoint;
do $$ begin
 if exists(select 1 from cron.job where jobname='kanban-attachment-cleanup') then
  perform cron.unschedule('kanban-attachment-cleanup');
 end if;
 perform cron.schedule('kanban-attachment-cleanup','*/5 * * * *','select workspace_internal.run_attachment_cleanup()');
end; $$;
commit;
