begin;
-- Read-only preview; only the verified recipient can see workspace details.
create function public.workspace_invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_invite public.workspace_invitations%rowtype; v_name text;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
  select * into v_invite from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if not found then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
  if v_invite.email <> v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  if v_invite.revoked_at is not null or v_invite.expires_at <= now() or v_invite.accepted_at is not null then raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
  select name into v_name from public.workspaces where id=v_invite.workspace_id;
  return jsonb_build_object('workspace_name',v_name,'role',v_invite.role,'expires_at',v_invite.expires_at);
end; $$;
revoke all on function public.workspace_invitation_preview(text) from public, anon;
grant execute on function public.workspace_invitation_preview(text) to authenticated;
notify pgrst, 'reload schema';
commit;
