begin;

create table if not exists public.landing_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  secret_hash text not null,
  variant text not null default 'general' check (variant in ('general', 'odontologia')),
  path text,
  referrer text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  answer_reservation boolean,
  answer_reminders boolean,
  answer_information boolean,
  questionnaire_started_at timestamptz,
  questionnaire_completed_at timestamptz,
  questionnaire_completed boolean not null default false,
  latest_section text,
  trial_started_at timestamptz,
  whatsapp_opened_at timestamptz,
  identified_at timestamptz,
  started_at timestamptz not null default pg_catalog.now(),
  last_activity_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.landing_leads (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null unique references public.landing_sessions(id) on delete cascade,
  name text,
  phone text,
  status text not null default 'Nuevo' check (status in ('Nuevo', 'Contactado', 'Demo agendada', 'Probando', 'Cliente', 'No interesado')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (coalesce(pg_catalog.length(pg_catalog.btrim(name)), 0) >= 2 or coalesce(pg_catalog.length(pg_catalog.regexp_replace(phone, '[^0-9]', '', 'g')), 0) >= 6)
);

create table if not exists public.landing_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.landing_sessions(id) on delete cascade,
  event_type text not null,
  problem_key text check (problem_key is null or problem_key in ('reservation', 'reminders', 'information')),
  section_key text,
  cta_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.landing_crm_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists landing_sessions_started_at_idx on public.landing_sessions (started_at desc);
create index if not exists landing_sessions_last_activity_idx on public.landing_sessions (last_activity_at desc);
create index if not exists landing_events_session_time_idx on public.landing_events (session_id, occurred_at);
create index if not exists landing_events_type_time_idx on public.landing_events (event_type, occurred_at desc);
create index if not exists landing_leads_status_updated_idx on public.landing_leads (status, updated_at desc);

alter table public.landing_sessions enable row level security;
alter table public.landing_events enable row level security;
alter table public.landing_leads enable row level security;
alter table public.landing_crm_admins enable row level security;

revoke all on table public.landing_sessions from anon, authenticated;
revoke all on table public.landing_events from anon, authenticated;
revoke all on table public.landing_leads from anon, authenticated;
revoke all on table public.landing_crm_admins from anon, authenticated;
revoke all on sequence public.landing_events_id_seq from anon, authenticated;

create or replace function public.landing_session_is_valid(
  p_session_id uuid,
  p_session_secret text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.landing_sessions as sessions
    where sessions.id = p_session_id
      and sessions.secret_hash = pg_catalog.encode(extensions.digest(coalesce(p_session_secret, ''), 'sha256'), 'hex')
      and sessions.started_at > pg_catalog.now() - interval '30 days'
  );
$$;

create or replace function public.landing_start_session(
  p_variant text,
  p_path text,
  p_referrer text default null,
  p_source text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns table (session_id uuid, session_secret text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_secret text := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
  v_variant text := case when p_variant = 'odontologia' then 'odontologia' else 'general' end;
begin
  insert into public.landing_sessions (
    id, secret_hash, variant, path, referrer, source, utm_source, utm_medium, utm_campaign
  ) values (
    v_id,
    pg_catalog.encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    v_variant,
    pg_catalog.left(coalesce(p_path, '/'), 500),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_referrer, '')), 500), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_source, '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_utm_source, '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_utm_medium, '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_utm_campaign, '')), 160), '')
  );

  insert into public.landing_events (session_id, event_type, section_key)
  values (v_id, 'session_started', 'hero');

  return query select v_id, v_secret;
end;
$$;

create or replace function public.landing_answer_question(
  p_session_id uuid,
  p_session_secret text,
  p_problem_key text,
  p_answer boolean,
  p_step integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.landing_session_is_valid(p_session_id, p_session_secret) then
    return false;
  end if;

  if (p_problem_key, p_step) not in (('reservation', 1), ('reminders', 2), ('information', 3)) then
    return false;
  end if;

  update public.landing_sessions as sessions
  set answer_reservation = case when p_problem_key = 'reservation' then p_answer else sessions.answer_reservation end,
      answer_reminders = case when p_problem_key = 'reminders' then p_answer else sessions.answer_reminders end,
      answer_information = case when p_problem_key = 'information' then p_answer else sessions.answer_information end,
      questionnaire_started_at = coalesce(sessions.questionnaire_started_at, pg_catalog.now()),
      last_activity_at = pg_catalog.now()
  where sessions.id = p_session_id;

  insert into public.landing_events (session_id, event_type, problem_key, metadata)
  values (
    p_session_id,
    'questionnaire_answered',
    p_problem_key,
    pg_catalog.jsonb_build_object('answer', p_answer, 'step', p_step)
  );

  return true;
end;
$$;

create or replace function public.landing_complete_questionnaire(
  p_session_id uuid,
  p_session_secret text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_completed boolean;
begin
  if not public.landing_session_is_valid(p_session_id, p_session_secret) then
    return false;
  end if;

  select sessions.questionnaire_completed
  into v_was_completed
  from public.landing_sessions as sessions
  where sessions.id = p_session_id;

  update public.landing_sessions as sessions
  set questionnaire_completed = true,
      questionnaire_completed_at = coalesce(sessions.questionnaire_completed_at, pg_catalog.now()),
      last_activity_at = pg_catalog.now()
  where sessions.id = p_session_id
    and sessions.answer_reservation is not null
    and sessions.answer_reminders is not null
    and sessions.answer_information is not null;

  if not found then
    return false;
  end if;

  if not coalesce(v_was_completed, false) then
    insert into public.landing_events (session_id, event_type)
    values (p_session_id, 'questionnaire_completed');
  end if;

  return true;
end;
$$;

create or replace function public.landing_record_event(
  p_session_id uuid,
  p_session_secret text,
  p_event_type text,
  p_problem_key text default null,
  p_section_key text default null,
  p_cta_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_events constant text[] := array[
    'page_view', 'result_solution_clicked',
    'personalized_next_clicked', 'cta_clicked', 'section_viewed',
    'trial_intent', 'video_played', 'whatsapp_opened'
  ];
begin
  if not public.landing_session_is_valid(p_session_id, p_session_secret) then
    return false;
  end if;

  if not p_event_type = any(v_allowed_events) then
    return false;
  end if;

  if p_problem_key is not null and p_problem_key not in ('reservation', 'reminders', 'information') then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or pg_catalog.octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 2048 then
    return false;
  end if;

  if (select pg_catalog.count(*) from public.landing_events as events where events.session_id = p_session_id) >= 250 then
    return false;
  end if;

  insert into public.landing_events (session_id, event_type, problem_key, section_key, cta_key, metadata)
  values (
    p_session_id,
    p_event_type,
    p_problem_key,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_section_key, '')), 80), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_cta_key, '')), 80), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );

  update public.landing_sessions as sessions
  set latest_section = case when p_event_type = 'section_viewed' then pg_catalog.left(p_section_key, 80) else sessions.latest_section end,
      trial_started_at = case when p_event_type = 'trial_intent' then coalesce(sessions.trial_started_at, pg_catalog.now()) else sessions.trial_started_at end,
      whatsapp_opened_at = case when p_event_type = 'whatsapp_opened' then coalesce(sessions.whatsapp_opened_at, pg_catalog.now()) else sessions.whatsapp_opened_at end,
      last_activity_at = pg_catalog.now()
  where sessions.id = p_session_id;

  return true;
end;
$$;

create or replace function public.landing_identify_lead(
  p_session_id uuid,
  p_session_secret text,
  p_name text default null,
  p_phone text default null,
  p_source_cta text default null
)
returns table (lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_name, '')), 80), '');
  v_phone text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_phone, '')), 32), '');
  v_lead_id uuid;
begin
  if not public.landing_session_is_valid(p_session_id, p_session_secret) then
    return;
  end if;

  if coalesce(pg_catalog.length(v_name), 0) < 2
    and coalesce(pg_catalog.length(pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g')), 0) < 6 then
    return;
  end if;

  insert into public.landing_leads as leads (session_id, name, phone)
  values (p_session_id, v_name, v_phone)
  on conflict (session_id) do update
  set name = coalesce(excluded.name, leads.name),
      phone = coalesce(excluded.phone, leads.phone),
      updated_at = pg_catalog.now()
  returning id into v_lead_id;

  update public.landing_sessions as sessions
  set identified_at = coalesce(sessions.identified_at, pg_catalog.now()),
      last_activity_at = pg_catalog.now()
  where sessions.id = p_session_id;

  insert into public.landing_events (session_id, event_type, cta_key)
  values (
    p_session_id,
    'lead_identified',
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_source_cta, '')), 80), '')
  );

  return query select v_lead_id;
end;
$$;

create or replace function public.landing_is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.landing_crm_admins as admins
    where admins.user_id = auth.uid()
  );
$$;

create or replace function public.landing_crm_get_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_result jsonb;
begin
  if not public.landing_is_crm_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  with scoped as (
    select sessions.*
    from public.landing_sessions as sessions
    where sessions.started_at >= pg_catalog.now() - pg_catalog.make_interval(days => v_days)
  ), totals as (
    select
      pg_catalog.count(*)::integer as sessions_count,
      pg_catalog.count(*) filter (where questionnaire_completed)::integer as completed_count,
      pg_catalog.count(*) filter (where questionnaire_completed and answer_reservation is true)::integer as reservation_count,
      pg_catalog.count(*) filter (where questionnaire_completed and answer_reminders is true)::integer as reminders_count,
      pg_catalog.count(*) filter (where questionnaire_completed and answer_information is true)::integer as information_count,
      pg_catalog.count(*) filter (where trial_started_at is not null)::integer as trial_count,
      pg_catalog.count(*) filter (where identified_at is not null)::integer as identified_count
    from scoped
  )
  select pg_catalog.jsonb_build_object(
    'periodDays', v_days,
    'sessions', totals.sessions_count,
    'questionnairesCompleted', totals.completed_count,
    'reservationCount', totals.reservation_count,
    'remindersCount', totals.reminders_count,
    'informationCount', totals.information_count,
    'trialIntentCount', totals.trial_count,
    'identifiedCount', totals.identified_count,
    'completionRate', coalesce(pg_catalog.round(totals.completed_count * 100.0 / nullif(totals.sessions_count, 0), 1), 0),
    'reservationRate', coalesce(pg_catalog.round(totals.reservation_count * 100.0 / nullif(totals.completed_count, 0), 1), 0),
    'remindersRate', coalesce(pg_catalog.round(totals.reminders_count * 100.0 / nullif(totals.completed_count, 0), 1), 0),
    'informationRate', coalesce(pg_catalog.round(totals.information_count * 100.0 / nullif(totals.completed_count, 0), 1), 0),
    'trialIntentRate', coalesce(pg_catalog.round(totals.trial_count * 100.0 / nullif(totals.sessions_count, 0), 1), 0),
    'identifiedRate', coalesce(pg_catalog.round(totals.identified_count * 100.0 / nullif(totals.sessions_count, 0), 1), 0)
  ) into v_result
  from totals;

  return v_result;
end;
$$;

create or replace function public.landing_crm_list_sessions(
  p_days integer default 30,
  p_identity text default 'all',
  p_problem text default null,
  p_status text default null,
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 80), '');
  v_result jsonb;
begin
  if not public.landing_is_crm_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_identity not in ('all', 'anonymous', 'identified') then
    p_identity := 'all';
  end if;

  with filtered as (
    select
      sessions.id,
      sessions.variant,
      sessions.started_at,
      sessions.last_activity_at,
      sessions.answer_reservation,
      sessions.answer_reminders,
      sessions.answer_information,
      sessions.questionnaire_completed,
      sessions.latest_section,
      sessions.trial_started_at,
      sessions.whatsapp_opened_at,
      sessions.source,
      sessions.path,
      leads.id as lead_id,
      leads.name,
      leads.phone,
      leads.status,
      (select pg_catalog.count(*)::integer from public.landing_events as events where events.session_id = sessions.id) as event_count
    from public.landing_sessions as sessions
    left join public.landing_leads as leads on leads.session_id = sessions.id
    where sessions.started_at >= pg_catalog.now() - pg_catalog.make_interval(days => v_days)
      and (p_identity = 'all' or (p_identity = 'anonymous' and leads.id is null) or (p_identity = 'identified' and leads.id is not null))
      and (p_problem is null
        or (p_problem = 'reservation' and sessions.answer_reservation is true)
        or (p_problem = 'reminders' and sessions.answer_reminders is true)
        or (p_problem = 'information' and sessions.answer_information is true))
      and (p_status is null or leads.status = p_status)
      and (v_query is null
        or sessions.id::text ilike '%' || v_query || '%'
        or coalesce(leads.name, '') ilike '%' || v_query || '%'
        or coalesce(leads.phone, '') ilike '%' || v_query || '%')
  ), counted as (
    select pg_catalog.count(*)::integer as total from filtered
  ), paged as (
    select * from filtered order by last_activity_at desc limit v_limit offset v_offset
  )
  select pg_catalog.jsonb_build_object(
    'total', counted.total,
    'limit', v_limit,
    'offset', v_offset,
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(paged) order by paged.last_activity_at desc) from paged), '[]'::jsonb)
  ) into v_result
  from counted;

  return v_result;
end;
$$;

create or replace function public.landing_crm_get_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.landing_is_crm_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_build_object(
      'id', sessions.id,
      'variant', sessions.variant,
      'path', sessions.path,
      'referrer', sessions.referrer,
      'source', sessions.source,
      'utmSource', sessions.utm_source,
      'utmMedium', sessions.utm_medium,
      'utmCampaign', sessions.utm_campaign,
      'answerReservation', sessions.answer_reservation,
      'answerReminders', sessions.answer_reminders,
      'answerInformation', sessions.answer_information,
      'questionnaireCompleted', sessions.questionnaire_completed,
      'questionnaireStartedAt', sessions.questionnaire_started_at,
      'questionnaireCompletedAt', sessions.questionnaire_completed_at,
      'latestSection', sessions.latest_section,
      'trialStartedAt', sessions.trial_started_at,
      'whatsappOpenedAt', sessions.whatsapp_opened_at,
      'startedAt', sessions.started_at,
      'lastActivityAt', sessions.last_activity_at
    ),
    'lead', case when leads.id is null then null else pg_catalog.jsonb_build_object(
      'id', leads.id,
      'name', leads.name,
      'phone', leads.phone,
      'status', leads.status,
      'createdAt', leads.created_at,
      'updatedAt', leads.updated_at
    ) end,
    'events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', events.id,
        'type', events.event_type,
        'problem', events.problem_key,
        'section', events.section_key,
        'cta', events.cta_key,
        'metadata', events.metadata,
        'occurredAt', events.occurred_at
      ) order by events.occurred_at)
      from public.landing_events as events
      where events.session_id = sessions.id
    ), '[]'::jsonb)
  ) into v_result
  from public.landing_sessions as sessions
  left join public.landing_leads as leads on leads.session_id = sessions.id
  where sessions.id = p_session_id;

  return v_result;
end;
$$;

create or replace function public.landing_crm_update_status(
  p_lead_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if not public.landing_is_crm_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_status not in ('Nuevo', 'Contactado', 'Demo agendada', 'Probando', 'Cliente', 'No interesado') then
    return false;
  end if;

  update public.landing_leads as leads
  set status = p_status,
      updated_at = pg_catalog.now()
  where leads.id = p_lead_id
  returning session_id into v_session_id;

  if not found then
    return false;
  end if;

  insert into public.landing_events (session_id, event_type, metadata)
  values (v_session_id, 'commercial_status_changed', pg_catalog.jsonb_build_object('status', p_status));

  return true;
end;
$$;

revoke all on function public.landing_session_is_valid(uuid, text) from public, anon, authenticated;
revoke all on function public.landing_start_session(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.landing_answer_question(uuid, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.landing_complete_questionnaire(uuid, text) from public, anon, authenticated;
revoke all on function public.landing_record_event(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.landing_identify_lead(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.landing_is_crm_admin() from public, anon, authenticated;
revoke all on function public.landing_crm_get_dashboard(integer) from public, anon, authenticated;
revoke all on function public.landing_crm_list_sessions(integer, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.landing_crm_get_session(uuid) from public, anon, authenticated;
revoke all on function public.landing_crm_update_status(uuid, text) from public, anon, authenticated;

grant execute on function public.landing_start_session(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.landing_answer_question(uuid, text, text, boolean, integer) to anon, authenticated;
grant execute on function public.landing_complete_questionnaire(uuid, text) to anon, authenticated;
grant execute on function public.landing_record_event(uuid, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.landing_identify_lead(uuid, text, text, text, text) to anon, authenticated;

grant execute on function public.landing_is_crm_admin() to authenticated;
grant execute on function public.landing_crm_get_dashboard(integer) to authenticated;
grant execute on function public.landing_crm_list_sessions(integer, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.landing_crm_get_session(uuid) to authenticated;
grant execute on function public.landing_crm_update_status(uuid, text) to authenticated;

comment on table public.landing_sessions is 'Anonymous landing visits and the latest state of the three-question diagnostic.';
comment on table public.landing_events is 'Allowlisted behavioral timeline for each landing session.';
comment on table public.landing_leads is 'Minimal voluntary identification linked one-to-one with a landing session.';
comment on table public.landing_crm_admins is 'Explicit allowlist for authenticated users authorized to read the private landing CRM.';

commit;
