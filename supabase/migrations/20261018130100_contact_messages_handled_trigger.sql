-- contact_messages: "who handled it" comes from the session, never the client.
-- Staff may only change `status`; a trigger stamps handled_at/handled_by.

revoke update on public.contact_messages from authenticated;
grant update (status) on public.contact_messages to authenticated;

create or replace function public.contact_messages_stamp_handled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'handled' and old.status is distinct from 'handled' then
    new.handled_at := now();
    new.handled_by := auth.uid();
  elsif new.status = 'new' then
    new.handled_at := null;
    new.handled_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_stamp_handled on public.contact_messages;
create trigger contact_messages_stamp_handled
  before update of status on public.contact_messages
  for each row execute function public.contact_messages_stamp_handled();
