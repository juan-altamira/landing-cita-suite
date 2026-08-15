# Landing CRM database

`landing-crm.sql` creates the anonymous session store, the minimal lead record,
the event timeline and the authenticated CRM functions.

The public site never receives table permissions. It can only call a small set
of RPC functions using an unguessable per-session secret. CRM reads require both
a valid Supabase Auth session and an explicit row in `landing_crm_admins`.

After applying the SQL, add the authorized Cita Suite account without committing
its email address:

```sql
insert into public.landing_crm_admins (user_id)
select id from auth.users where lower(email) = lower('AUTHORIZED_EMAIL')
on conflict (user_id) do nothing;
```
