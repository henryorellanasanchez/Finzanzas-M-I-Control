-- Correccion inmediata de permisos para una BD donde la verificacion
-- devolvio anon_can_execute = true.
-- Ejecutar en Supabase SQL Editor como una sola transaccion.

begin;

alter default privileges in schema public revoke execute on functions from public;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_member(uuid) from anon;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.is_group_owner(uuid) from anon;
revoke all on function public.is_shared_viewer(uuid) from public;
revoke all on function public.is_shared_viewer(uuid) from anon;
revoke all on function public.is_shared_note_viewer(uuid) from public;
revoke all on function public.is_shared_note_viewer(uuid) from anon;
revoke all on function public.create_share_link(uuid, boolean) from public;
revoke all on function public.create_share_link(uuid, boolean) from anon;
revoke all on function public.accept_invitation(uuid) from public;
revoke all on function public.accept_invitation(uuid) from anon;
revoke all on function public.prevent_orphan_group() from public;
revoke all on function public.prevent_orphan_group() from anon;
revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_shared_viewer(uuid) to authenticated;
grant execute on function public.is_shared_note_viewer(uuid) to authenticated;
grant execute on function public.create_share_link(uuid, boolean) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

commit;
