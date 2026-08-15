import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase';

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { email?: string };
}

interface Dashboard {
  periodDays: number;
  sessions: number;
  questionnairesCompleted: number;
  reservationRate: number;
  remindersRate: number;
  informationRate: number;
  trialIntentRate: number;
  identifiedRate: number;
}

interface SessionItem {
  id: string;
  variant: string;
  started_at: string;
  last_activity_at: string;
  answer_reservation: boolean | null;
  answer_reminders: boolean | null;
  answer_information: boolean | null;
  questionnaire_completed: boolean;
  latest_section: string | null;
  trial_started_at: string | null;
  whatsapp_opened_at: string | null;
  source: string | null;
  path: string | null;
  lead_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  event_count: number;
}

interface SessionList {
  total: number;
  limit: number;
  offset: number;
  items: SessionItem[];
}

interface DetailEvent {
  id: number;
  type: string;
  problem: string | null;
  section: string | null;
  cta: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface SessionDetail {
  session: {
    id: string;
    variant: string;
    path: string | null;
    referrer: string | null;
    source: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    answerReservation: boolean | null;
    answerReminders: boolean | null;
    answerInformation: boolean | null;
    questionnaireCompleted: boolean;
    latestSection: string | null;
    trialStartedAt: string | null;
    whatsappOpenedAt: string | null;
    startedAt: string;
    lastActivityAt: string;
  };
  lead: { id: string; name: string | null; phone: string | null; status: string; createdAt: string; updatedAt: string } | null;
  events: DetailEvent[];
}

const authStorageKey = 'cita-suite:crm-auth:v1';
const pageSize = 30;
const root = document.querySelector<HTMLElement>('[data-crm-root]');
const loginSection = document.querySelector<HTMLElement>('[data-crm-login]');
const appSection = document.querySelector<HTMLElement>('[data-crm-app]');
const loginForm = document.querySelector<HTMLFormElement>('[data-login-form]');
const loginError = document.querySelector<HTMLElement>('[data-login-error]');
const loading = document.querySelector<HTMLElement>('[data-crm-loading]');
const globalError = document.querySelector<HTMLElement>('[data-crm-error]');
const rows = document.querySelector<HTMLTableSectionElement>('[data-session-rows]');
const empty = document.querySelector<HTMLElement>('[data-crm-empty]');
const resultsCount = document.querySelector<HTMLElement>('[data-results-count]');
const periodFilter = document.querySelector<HTMLSelectElement>('[data-period-filter]');
const problemFilter = document.querySelector<HTMLSelectElement>('[data-problem-filter]');
const statusFilter = document.querySelector<HTMLSelectElement>('[data-status-filter]');
const searchFilter = document.querySelector<HTMLInputElement>('[data-search-filter]');
const previousButton = document.querySelector<HTMLButtonElement>('[data-page-previous]');
const nextButton = document.querySelector<HTMLButtonElement>('[data-page-next]');
const pageLabel = document.querySelector<HTMLElement>('[data-page-label]');
const detailDialog = document.querySelector<HTMLDialogElement>('[data-session-dialog]');
const statusSelect = document.querySelector<HTMLSelectElement>('[data-lead-status]');
const statusControl = document.querySelector<HTMLElement>('[data-status-control]');
const statusFeedback = document.querySelector<HTMLElement>('[data-status-feedback]');
let identityFilter = 'all';
let currentOffset = 0;
let currentTotal = 0;
let currentDetail: SessionDetail | null = null;
let searchTimer: number | undefined;

function readAuth(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(authStorageKey);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

function saveAuth(session: AuthSession | null) {
  if (session) sessionStorage.setItem(authStorageKey, JSON.stringify(session));
  else sessionStorage.removeItem(authStorageKey);
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthSession> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('auth_failed');
  return response.json() as Promise<AuthSession>;
}

async function refreshAuth(session: AuthSession): Promise<AuthSession> {
  const refreshed = await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
  saveAuth(refreshed);
  return refreshed;
}

async function validAuth(): Promise<AuthSession> {
  const session = readAuth();
  if (!session?.access_token) throw new Error('signed_out');
  if (session.expires_at * 1000 > Date.now() + 60_000) return session;
  return refreshAuth(session);
}

async function crmRpc<T>(name: string, payload: Record<string, unknown>, canRetry = true): Promise<T> {
  const auth = await validAuth();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401 && canRetry) {
    await refreshAuth(auth);
    return crmRpc<T>(name, payload, false);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('not_authorized');
    throw new Error('request_failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function setLoading(value: boolean) {
  if (loading) loading.hidden = !value;
  root?.setAttribute('aria-busy', String(value));
}

function showGlobalError(message: string | null) {
  if (!globalError) return;
  globalError.hidden = !message;
  globalError.textContent = message ?? '';
}

function showLogin(message?: string) {
  if (loginSection) loginSection.hidden = false;
  if (appSection) appSection.hidden = true;
  if (loginError) {
    loginError.hidden = !message;
    loginError.textContent = message ?? '';
  }
}

function showApp() {
  if (loginSection) loginSection.hidden = true;
  if (appSection) appSection.hidden = false;
  const email = document.querySelector<HTMLElement>('[data-account-email]');
  if (email) email.textContent = readAuth()?.user.email ?? 'Cuenta autorizada';
}

const percentage = (value: number) => `${Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

function renderDashboard(data: Dashboard) {
  const write = (key: string, value: string) => {
    const element = document.querySelector<HTMLElement>(`[data-metric="${key}"]`);
    if (element) element.textContent = value;
  };
  write('completed', String(data.questionnairesCompleted));
  write('reservation', percentage(data.reservationRate));
  write('reminders', percentage(data.remindersRate));
  write('information', percentage(data.informationRate));
  write('trial', percentage(data.trialIntentRate));
  write('identified', percentage(data.identifiedRate));
  const completedDetail = document.querySelector<HTMLElement>('[data-metric-detail="completed"]');
  if (completedDetail) completedDetail.textContent = `${data.sessions} sesiones en total`;
  const subtitle = document.querySelector<HTMLElement>('[data-dashboard-subtitle]');
  if (subtitle) subtitle.textContent = data.periodDays === 1 ? 'Actividad de hoy.' : `Actividad de los últimos ${data.periodDays} días.`;
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

function problemLabels(item: Pick<SessionItem, 'answer_reservation' | 'answer_reminders' | 'answer_information'>) {
  return [
    item.answer_reservation ? 'Reserva' : null,
    item.answer_reminders ? 'Olvidos' : null,
    item.answer_information ? 'Información' : null
  ].filter(Boolean) as string[];
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function appendBadge(container: HTMLElement, text: string, tone = '') {
  const badge = element('span', `crm-badge ${tone}`.trim(), text);
  container.append(badge);
}

function renderSessions(data: SessionList) {
  if (!rows) return;
  rows.replaceChildren();
  currentTotal = data.total;
  if (resultsCount) resultsCount.textContent = `${data.total} ${data.total === 1 ? 'resultado' : 'resultados'}`;
  if (empty) empty.hidden = data.items.length > 0;

  data.items.forEach((item) => {
    const row = element('tr');
    const visitorCell = element('td');
    const visitor = element('div', 'crm-visitor');
    const initials = item.name?.slice(0, 1).toUpperCase() ?? (item.lead_id ? 'L' : 'A');
    visitor.append(element('span', `crm-avatar ${item.lead_id ? 'identified' : ''}`.trim(), initials));
    const visitorCopy = element('div');
    visitorCopy.append(element('strong', '', item.name || item.phone || `Sesión ${item.id.slice(0, 8)}`));
    visitorCopy.append(element('small', '', item.lead_id ? (item.phone || 'Lead identificado') : item.id.slice(0, 13)));
    visitor.append(visitorCopy);
    visitorCell.append(visitor);

    const problemsCell = element('td');
    const problems = element('div', 'crm-badges');
    const labels = problemLabels(item);
    if (labels.length) labels.forEach((label) => appendBadge(problems, label, 'problem'));
    else appendBadge(problems, item.questionnaire_completed ? 'Ninguno' : 'Sin completar', 'muted');
    problemsCell.append(problems);

    const journeyCell = element('td');
    const journey = element('div', 'crm-badges');
    if (item.questionnaire_completed) appendBadge(journey, 'Test completo', 'success');
    if (item.trial_started_at) appendBadge(journey, 'Quiso probar', 'intent');
    if (item.whatsapp_opened_at) appendBadge(journey, 'WhatsApp', 'success');
    if (item.status) appendBadge(journey, item.status, 'status');
    if (!journey.childElementCount) appendBadge(journey, item.latest_section ? `Vio ${item.latest_section}` : 'Visita inicial', 'muted');
    journeyCell.append(journey);

    const sourceCell = element('td');
    sourceCell.append(element('span', 'crm-source', item.source || 'directo'));
    const activityCell = element('td');
    activityCell.append(element('time', '', dateFormatter.format(new Date(item.last_activity_at))));
    const actionCell = element('td');
    const viewButton = element('button', 'crm-view-button', 'Ver recorrido');
    viewButton.type = 'button';
    viewButton.dataset.sessionId = item.id;
    actionCell.append(viewButton);

    row.append(visitorCell, problemsCell, journeyCell, sourceCell, activityCell, actionCell);
    rows.append(row);
  });

  const currentPage = Math.floor(currentOffset / pageSize) + 1;
  const pageCount = Math.max(Math.ceil(data.total / pageSize), 1);
  if (pageLabel) pageLabel.textContent = `Página ${currentPage} de ${pageCount}`;
  if (previousButton) previousButton.disabled = currentOffset === 0;
  if (nextButton) nextButton.disabled = currentOffset + pageSize >= data.total;
}

function currentFilters() {
  return {
    p_days: Number(periodFilter?.value || 30),
    p_identity: identityFilter,
    p_problem: problemFilter?.value || null,
    p_status: statusFilter?.value || null,
    p_query: searchFilter?.value.trim() || null,
    p_limit: pageSize,
    p_offset: currentOffset
  };
}

async function loadRecords() {
  const list = await crmRpc<SessionList>('landing_crm_list_sessions', currentFilters());
  renderSessions(list);
}

async function loadDashboardAndRecords() {
  setLoading(true);
  showGlobalError(null);
  try {
    const days = Number(periodFilter?.value || 30);
    const [dashboard, list] = await Promise.all([
      crmRpc<Dashboard>('landing_crm_get_dashboard', { p_days: days }),
      crmRpc<SessionList>('landing_crm_list_sessions', currentFilters())
    ]);
    renderDashboard(dashboard);
    renderSessions(list);
  } catch (error) {
    if (error instanceof Error && (error.message === 'signed_out' || error.message === 'not_authorized')) {
      saveAuth(null);
      showLogin('Tu sesión venció o esta cuenta no tiene acceso al panel.');
      return;
    }
    showGlobalError('No pudimos actualizar el panel. Revisá tu conexión y volvé a intentar.');
  } finally {
    setLoading(false);
  }
}

function detailProblemRows(detail: SessionDetail) {
  return [
    ['Reserva', detail.session.answerReservation],
    ['Olvidos', detail.session.answerReminders],
    ['Información', detail.session.answerInformation]
  ] as const;
}

const sectionNames: Record<string, string> = {
  hero: 'inicio', diagnostic: 'cuestionario', reservation: 'reserva', reminders: 'recordatorios', information: 'información',
  team: 'equipo', onboarding: 'configuración asistida', story: 'origen', security: 'seguridad', pricing: 'precio', faq: 'preguntas frecuentes', 'final-cta': 'cierre'
};

const problemNames: Record<string, string> = { reservation: 'Reserva', reminders: 'Olvidos', information: 'Información' };

function eventDescription(event: DetailEvent) {
  switch (event.type) {
    case 'session_started': return 'Entró a la landing';
    case 'questionnaire_answered': return `${problemNames[event.problem || ''] || 'Pregunta'}: ${event.metadata.answer === true ? 'Sí' : 'No tanto'}`;
    case 'questionnaire_completed': return 'Completó el cuestionario';
    case 'section_viewed': return `Vio ${sectionNames[event.section || ''] || event.section || 'una sección'}`;
    case 'result_solution_clicked': return `Fue a la solución de ${sectionNames[event.section || ''] || event.section || 'su problema'}`;
    case 'personalized_next_clicked': return `Continuó hacia ${problemNames[event.problem || ''] || 'la siguiente solución'}`;
    case 'cta_clicked': return 'Usó un enlace de la landing';
    case 'trial_intent': return 'Quiso probar Cita Suite';
    case 'video_played': return 'Reprodujo la demo de reserva';
    case 'lead_identified': return 'Se identificó';
    case 'whatsapp_opened': return 'Continuó por WhatsApp';
    case 'commercial_status_changed': return `Estado comercial: ${String(event.metadata.status || 'actualizado')}`;
    default: return 'Actividad registrada';
  }
}

function renderDetail(detail: SessionDetail) {
  currentDetail = detail;
  const kind = document.querySelector<HTMLElement>('[data-detail-kind]');
  const title = document.querySelector<HTMLElement>('[data-detail-title]');
  const subtitle = document.querySelector<HTMLElement>('[data-detail-subtitle]');
  const summary = document.querySelector<HTMLElement>('[data-detail-summary]');
  const timeline = document.querySelector<HTMLOListElement>('[data-timeline]');
  const eventCount = document.querySelector<HTMLElement>('[data-event-count]');
  if (kind) kind.textContent = detail.lead ? 'Lead identificado' : 'Sesión anónima';
  if (title) title.textContent = detail.lead?.name || detail.lead?.phone || `Sesión ${detail.session.id.slice(0, 8)}`;
  if (subtitle) subtitle.textContent = `Inició ${dateFormatter.format(new Date(detail.session.startedAt))} · ${detail.session.source || 'directo'}`;

  if (summary) {
    summary.replaceChildren();
    detailProblemRows(detail).forEach(([label, answer]) => {
      const item = element('div');
      item.append(element('span', '', label), element('strong', answer === true ? 'Sí' : answer === false ? 'No tanto' : 'Sin responder'));
      item.dataset.answer = answer === true ? 'yes' : answer === false ? 'no' : 'empty';
      summary.append(item);
    });
  }

  if (statusControl && statusSelect) {
    statusControl.hidden = !detail.lead;
    if (detail.lead) statusSelect.value = detail.lead.status;
  }
  if (statusFeedback) statusFeedback.textContent = '';

  if (timeline) {
    timeline.replaceChildren();
    detail.events.forEach((event) => {
      const item = element('li');
      item.append(element('time', '', timeFormatter.format(new Date(event.occurredAt))));
      const content = element('div');
      content.append(element('strong', '', eventDescription(event)));
      if (event.cta) content.append(element('small', '', `Origen: ${event.cta}`));
      item.append(content);
      timeline.append(item);
    });
  }
  if (eventCount) eventCount.textContent = `${detail.events.length} ${detail.events.length === 1 ? 'evento' : 'eventos'}`;
}

async function openDetail(sessionId: string) {
  if (!detailDialog) return;
  detailDialog.showModal();
  const timeline = document.querySelector<HTMLOListElement>('[data-timeline]');
  if (timeline) timeline.replaceChildren(element('li', 'crm-timeline-loading', 'Cargando recorrido…'));
  try {
    const detail = await crmRpc<SessionDetail>('landing_crm_get_session', { p_session_id: sessionId });
    if (!detail?.session) throw new Error('not_found');
    renderDetail(detail);
  } catch {
    if (timeline) timeline.replaceChildren(element('li', 'crm-timeline-error', 'No pudimos cargar este recorrido. Cerrá el detalle e intentá de nuevo.'));
  }
}

rows?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-session-id]');
  if (button?.dataset.sessionId) void openDetail(button.dataset.sessionId);
});

document.querySelector<HTMLButtonElement>('[data-session-close]')?.addEventListener('click', () => detailDialog?.close());
detailDialog?.addEventListener('click', (event) => { if (event.target === detailDialog) detailDialog.close(); });

statusSelect?.addEventListener('change', async () => {
  if (!currentDetail?.lead || !statusFeedback) return;
  statusSelect.disabled = true;
  statusFeedback.textContent = 'Guardando…';
  try {
    const saved = await crmRpc<boolean>('landing_crm_update_status', { p_lead_id: currentDetail.lead.id, p_status: statusSelect.value });
    if (!saved) throw new Error('not_saved');
    currentDetail.lead.status = statusSelect.value;
    statusFeedback.textContent = 'Guardado';
    await loadRecords();
  } catch {
    statusFeedback.textContent = 'No se pudo guardar. Intentá de nuevo.';
  } finally {
    statusSelect.disabled = false;
  }
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = (loginForm.elements.namedItem('email') as HTMLInputElement).value.trim();
  const password = (loginForm.elements.namedItem('password') as HTMLInputElement).value;
  const button = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!email || !password || !button) return;
  button.disabled = true;
  button.textContent = 'Ingresando…';
  if (loginError) loginError.hidden = true;

  try {
    const session = await authRequest('/auth/v1/token?grant_type=password', { email, password });
    saveAuth(session);
    const authorized = await crmRpc<boolean>('landing_is_crm_admin', {});
    if (!authorized) throw new Error('not_authorized');
    showApp();
    await loadDashboardAndRecords();
  } catch (error) {
    saveAuth(null);
    showLogin(error instanceof Error && error.message === 'not_authorized'
      ? 'Esta cuenta no tiene permiso para acceder al panel.'
      : 'No pudimos ingresar. Revisá el email y la contraseña.');
  } finally {
    button.disabled = false;
    button.textContent = 'Ingresar';
  }
});

document.querySelector<HTMLButtonElement>('[data-logout]')?.addEventListener('click', () => {
  const auth = readAuth();
  if (auth) fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}` } }).catch(() => undefined);
  saveAuth(null);
  showLogin();
});

document.querySelectorAll<HTMLButtonElement>('[data-identity-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    identityFilter = tab.dataset.identityTab || 'all';
    document.querySelectorAll<HTMLButtonElement>('[data-identity-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    currentOffset = 0;
    void loadDashboardAndRecords();
  });
});

periodFilter?.addEventListener('change', () => { currentOffset = 0; void loadDashboardAndRecords(); });
problemFilter?.addEventListener('change', () => { currentOffset = 0; void loadDashboardAndRecords(); });
statusFilter?.addEventListener('change', () => { currentOffset = 0; void loadDashboardAndRecords(); });
searchFilter?.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => { currentOffset = 0; void loadDashboardAndRecords(); }, 300);
});
previousButton?.addEventListener('click', () => { currentOffset = Math.max(0, currentOffset - pageSize); void loadDashboardAndRecords(); });
nextButton?.addEventListener('click', () => { if (currentOffset + pageSize < currentTotal) currentOffset += pageSize; void loadDashboardAndRecords(); });

async function initialize() {
  if (!readAuth()) {
    showLogin();
    return;
  }
  try {
    const authorized = await crmRpc<boolean>('landing_is_crm_admin', {});
    if (!authorized) throw new Error('not_authorized');
    showApp();
    await loadDashboardAndRecords();
  } catch {
    saveAuth(null);
    showLogin('Tu sesión venció. Ingresá nuevamente.');
  }
}

void initialize();
