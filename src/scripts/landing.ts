import { SUPABASE_ANON_KEY, SUPABASE_URL, WHATSAPP_NUMBER } from '../config/supabase';

type ProblemKey = 'reservation' | 'reminders' | 'information';

interface Question {
  key: ProblemKey;
  question: string;
  summary: string;
}

interface DiagnosticState {
  currentIndex: number;
  completed: boolean;
  answers: Partial<Record<ProblemKey, boolean>>;
}

interface AnonymousSession {
  id: string;
  secret: string;
}

interface SessionResponse {
  session_id: string;
  session_secret: string;
}

interface LeadResponse {
  lead_id: string;
}

const root = document.querySelector<HTMLElement>('[data-landing-root]');
const variant = root?.dataset.variant === 'odontologia' ? 'odontologia' : 'general';
const problemOrder: ProblemKey[] = ['reservation', 'reminders', 'information'];
const storageKey = `cita-suite:diagnostic:v2:${variant}`;
const sessionStorageKey = 'cita-suite:anonymous-session:v1';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sleep = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

async function rpc<T>(name: string, payload: Record<string, unknown>, bearer = SUPABASE_ANON_KEY): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    keepalive: true
  });

  if (!response.ok) throw new Error('request_failed');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function readAnonymousSession(): AnonymousSession | null {
  try {
    const stored = sessionStorage.getItem(sessionStorageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as AnonymousSession;
    return parsed.id && parsed.secret ? parsed : null;
  } catch {
    return null;
  }
}

let sessionPromise: Promise<AnonymousSession> | null = null;

async function ensureAnonymousSession(): Promise<AnonymousSession> {
  const existing = readAnonymousSession();
  if (existing) return existing;
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer.slice(0, 500) || null;
    let source = params.get('utm_source');

    if (!source && referrer) {
      try {
        source = new URL(referrer).hostname;
      } catch {
        source = 'referencia';
      }
    }

    const response = await rpc<SessionResponse[] | SessionResponse>('landing_start_session', {
      p_variant: variant,
      p_path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      p_referrer: referrer,
      p_source: source?.slice(0, 120) || 'directo',
      p_utm_source: params.get('utm_source')?.slice(0, 120) || null,
      p_utm_medium: params.get('utm_medium')?.slice(0, 120) || null,
      p_utm_campaign: params.get('utm_campaign')?.slice(0, 160) || null
    });

    const value = Array.isArray(response) ? response[0] : response;
    if (!value?.session_id || !value.session_secret) throw new Error('session_failed');

    const session = { id: value.session_id, secret: value.session_secret };
    sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
    return session;
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });

  return sessionPromise;
}

async function recordEvent(
  eventType: string,
  options: { problem?: ProblemKey | null; section?: string | null; cta?: string | null; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  const session = await ensureAnonymousSession();
  await rpc('landing_record_event', {
    p_session_id: session.id,
    p_session_secret: session.secret,
    p_event_type: eventType,
    p_problem_key: options.problem ?? null,
    p_section_key: options.section ?? null,
    p_cta_key: options.cta ?? null,
    p_metadata: options.metadata ?? {}
  });
}

const fireAndForget = (promise: Promise<unknown>) => promise.catch(() => undefined);

// Start tracking after the first paint; it never blocks rendering or interaction.
window.setTimeout(() => fireAndForget(ensureAnonymousSession()), 350);

const menuButton = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const mobileMenu = document.querySelector<HTMLElement>('[data-mobile-menu]');

const closeMenu = () => {
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Abrir menú');
  mobileMenu?.classList.remove('open');
  document.body.classList.remove('menu-open');
};

menuButton?.addEventListener('click', () => {
  const willOpen = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(willOpen));
  menuButton.setAttribute('aria-label', willOpen ? 'Cerrar menú' : 'Abrir menú');
  mobileMenu?.classList.toggle('open', willOpen);
  document.body.classList.toggle('menu-open', willOpen);
});

mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('resize', () => { if (window.innerWidth > 980) closeMenu(); });

const diagnostic = document.querySelector<HTMLElement>('[data-diagnostic]');
const questionConfig = document.querySelector<HTMLScriptElement>('[data-question-config]');
const questions: Question[] = questionConfig?.textContent ? JSON.parse(questionConfig.textContent) : [];

const emptyState = (): DiagnosticState => ({ currentIndex: 0, completed: false, answers: {} });

function readDiagnosticState(): DiagnosticState {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as DiagnosticState;
    if (!parsed.answers || typeof parsed.currentIndex !== 'number') return emptyState();
    return {
      currentIndex: Math.min(Math.max(parsed.currentIndex, 0), questions.length - 1),
      completed: Boolean(parsed.completed),
      answers: parsed.answers
    };
  } catch {
    return emptyState();
  }
}

let diagnosticState = readDiagnosticState();

function saveDiagnosticState() {
  sessionStorage.setItem(storageKey, JSON.stringify(diagnosticState));
}

function selectedProblems(): ProblemKey[] {
  return problemOrder.filter((key) => diagnosticState.answers[key] === true);
}

const resultCtaCopy: Record<ProblemKey, string> = {
  reservation: 'Mirá cómo el paciente reserva por su cuenta',
  reminders: 'Mirá cómo Cita Suite reduce esos olvidos',
  information: 'Mirá cómo Cita Suite centraliza esa información'
};

const nextContextCopy: Record<ProblemKey, string> = {
  reservation: 'También te pasa que coordinar turnos requiere ida y vuelta.',
  reminders: 'También te pasa que algunos pacientes se olvidan del turno.',
  information: variant === 'odontologia'
    ? 'También te pasa que las radiografías o la información del paciente quedan dispersas.'
    : 'También te pasa que la información del paciente queda dispersa.'
};

const nextCtaCopy: Record<ProblemKey, string> = {
  reservation: 'Mirá cómo el paciente reserva por su cuenta',
  reminders: 'Mirá cómo Cita Suite reduce esos olvidos',
  information: 'Mirá cómo Cita Suite la centraliza'
};

const solutionIds: Record<ProblemKey, string> = {
  reservation: '#solucion-reserva',
  reminders: '#solucion-recordatorios',
  information: '#solucion-informacion'
};

function resetSolutionNavigation() {
  document.querySelectorAll<HTMLElement>('[data-solution-conversion]').forEach((conversion) => {
    conversion.hidden = false;
    conversion.removeAttribute('data-personalized');
    const context = conversion.querySelector<HTMLElement>('[data-next-context]');
    const nextLink = conversion.querySelector<HTMLAnchorElement>('[data-next-solution]');
    const trial = conversion.querySelector<HTMLButtonElement>('[data-trial-cta]');
    if (context) context.hidden = true;
    if (nextLink) nextLink.hidden = true;
    trial?.classList.remove('button-secondary');
    trial?.classList.add('button-primary');
  });
}

function renderSolutionNavigation() {
  resetSolutionNavigation();
  if (!diagnosticState.completed) return;

  const selected = selectedProblems();
  if (!selected.length) return;

  document.querySelectorAll<HTMLElement>('[data-solution-conversion]').forEach((conversion) => {
    const problem = conversion.dataset.problem as ProblemKey;
    const currentSelectedIndex = selected.indexOf(problem);

    if (currentSelectedIndex === -1) {
      conversion.hidden = true;
      return;
    }

    conversion.dataset.personalized = 'true';
    const nextProblem = selected[currentSelectedIndex + 1];
    if (!nextProblem) return;

    const context = conversion.querySelector<HTMLElement>('[data-next-context]');
    const nextLink = conversion.querySelector<HTMLAnchorElement>('[data-next-solution]');
    const nextLabel = conversion.querySelector<HTMLElement>('[data-next-label]');
    const trial = conversion.querySelector<HTMLButtonElement>('[data-trial-cta]');

    if (context) {
      context.textContent = nextContextCopy[nextProblem];
      context.hidden = false;
    }
    if (nextLink) {
      nextLink.href = solutionIds[nextProblem];
      nextLink.hidden = false;
      nextLink.dataset.nextProblem = nextProblem;
    }
    if (nextLabel) nextLabel.textContent = nextCtaCopy[nextProblem];
    trial?.classList.remove('button-primary');
    trial?.classList.add('button-secondary');
  });
}

function updateProgress(activeIndex: number, complete = false) {
  const label = diagnostic?.querySelector<HTMLElement>('[data-progress-label]');
  const marks = diagnostic?.querySelectorAll<SVGElement>('[data-progress-mark]');
  if (label) label.textContent = complete ? 'Cuestionario completo' : `Pregunta ${activeIndex + 1} de ${questions.length}`;

  marks?.forEach((mark, index) => {
    mark.classList.toggle('is-complete', complete || index < activeIndex);
    mark.classList.toggle('is-active', !complete && index === activeIndex);
  });
}

function renderResult() {
  if (!diagnostic) return;
  const questionPanel = diagnostic.querySelector<HTMLElement>('[data-question-panel]');
  const result = diagnostic.querySelector<HTMLElement>('[data-diagnostic-result]');
  const title = diagnostic.querySelector<HTMLElement>('[data-result-title]');
  const list = diagnostic.querySelector<HTMLUListElement>('[data-result-list]');
  const conclusion = diagnostic.querySelector<HTMLElement>('[data-result-conclusion]');
  const cta = diagnostic.querySelector<HTMLAnchorElement>('[data-result-cta]');
  const ctaLabel = diagnostic.querySelector<HTMLElement>('[data-result-cta-label]');
  const selected = selectedProblems();

  if (questionPanel) questionPanel.hidden = true;
  if (result) result.hidden = false;
  updateProgress(questions.length - 1, true);
  diagnostic.classList.add('is-complete');

  if (list) {
    list.innerHTML = '';
    selected.forEach((key) => {
      const item = document.createElement('li');
      const question = questions.find((entry) => entry.key === key);
      const link = document.createElement('a');
      link.href = solutionIds[key];
      link.dataset.resultProblemLink = key;
      link.textContent = question?.summary ?? key;
      item.append(link);
      list.append(item);
    });
    list.hidden = selected.length === 0;
  }

  if (selected.length) {
    if (title) title.textContent = selected.length === 1 ? 'Te pasa esto:' : 'Te pasan estas cosas:';
    if (conclusion) {
      conclusion.textContent = 'Cita Suite está pensado justamente para resolver esto.';
      conclusion.hidden = selected.length > 1;
    }
    if (cta) cta.href = solutionIds[selected[0]];
    if (ctaLabel) ctaLabel.textContent = resultCtaCopy[selected[0]];
  } else {
    if (title) title.textContent = 'Estas tres fricciones no parecen ser centrales hoy.';
    if (conclusion) {
      conclusion.textContent = 'Podés recorrer las soluciones igual y descubrir otras formas de organizar el consultorio.';
      conclusion.hidden = false;
    }
    if (cta) cta.href = solutionIds.reservation;
    if (ctaLabel) ctaLabel.textContent = 'Conocé cómo funciona Cita Suite';
  }

  renderSolutionNavigation();
}

function renderQuestion() {
  if (!diagnostic || !questions.length) return;
  if (diagnosticState.completed) {
    renderResult();
    return;
  }

  const questionPanel = diagnostic.querySelector<HTMLElement>('[data-question-panel]');
  const result = diagnostic.querySelector<HTMLElement>('[data-diagnostic-result]');
  const questionText = diagnostic.querySelector<HTMLElement>('[data-question-text]');
  const answerButtons = diagnostic.querySelectorAll<HTMLButtonElement>('[data-answer]');
  const question = questions[diagnosticState.currentIndex];

  diagnostic.classList.remove('is-complete');
  if (result) result.hidden = true;
  if (questionPanel) {
    questionPanel.hidden = false;
    questionPanel.classList.remove('is-leaving');
  }
  if (questionText) questionText.textContent = question.question;
  answerButtons.forEach((button) => { button.disabled = false; });
  updateProgress(diagnosticState.currentIndex);
  renderSolutionNavigation();
}

async function persistAnswer(question: Question, answer: boolean, step: number) {
  const session = await ensureAnonymousSession();
  await rpc('landing_answer_question', {
    p_session_id: session.id,
    p_session_secret: session.secret,
    p_problem_key: question.key,
    p_answer: answer,
    p_step: step
  });
}

async function persistCompletion() {
  const session = await ensureAnonymousSession();
  await rpc('landing_complete_questionnaire', {
    p_session_id: session.id,
    p_session_secret: session.secret
  });
}

async function identifyLead(name: string | null, phone: string | null, sourceCta: string): Promise<void> {
  const sendIdentity = async (session: AnonymousSession) => {
    const response = await rpc<LeadResponse[] | LeadResponse>('landing_identify_lead', {
      p_session_id: session.id,
      p_session_secret: session.secret,
      p_name: name,
      p_phone: phone,
      p_source_cta: sourceCta
    });
    return Array.isArray(response) ? response[0] : response;
  };

  let session = await ensureAnonymousSession();
  let lead = await sendIdentity(session);
  if (lead?.lead_id) return;

  // A tab can remain open after its anonymous session expires. Recreate the
  // session and replay only the three current answers before identifying it.
  sessionStorage.removeItem(sessionStorageKey);
  sessionPromise = null;
  session = await ensureAnonymousSession();
  for (const [index, question] of questions.entries()) {
    const answer = diagnosticState.answers[question.key];
    if (typeof answer !== 'boolean') continue;
    await rpc('landing_answer_question', {
      p_session_id: session.id,
      p_session_secret: session.secret,
      p_problem_key: question.key,
      p_answer: answer,
      p_step: index + 1
    });
  }
  if (diagnosticState.completed) {
    await rpc('landing_complete_questionnaire', {
      p_session_id: session.id,
      p_session_secret: session.secret
    });
  }
  lead = await sendIdentity(session);
  if (!lead?.lead_id) throw new Error('identity_not_saved');
}

diagnostic?.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => {
  button.addEventListener('click', async () => {
    const question = questions[diagnosticState.currentIndex];
    if (!question) return;
    const answer = button.dataset.answer === 'yes';
    const panel = diagnostic.querySelector<HTMLElement>('[data-question-panel]');
    diagnostic.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((item) => { item.disabled = true; });
    panel?.classList.add('is-leaving');

    diagnosticState.answers[question.key] = answer;
    fireAndForget(persistAnswer(question, answer, diagnosticState.currentIndex + 1));

    const isLast = diagnosticState.currentIndex >= questions.length - 1;
    if (isLast) {
      diagnosticState.completed = true;
      saveDiagnosticState();
      fireAndForget(persistCompletion());
      await sleep(reducedMotion ? 0 : 170);
      renderResult();
      return;
    }

    diagnosticState.currentIndex += 1;
    saveDiagnosticState();
    await sleep(reducedMotion ? 0 : 170);
    renderQuestion();
  });
});

diagnostic?.querySelector<HTMLAnchorElement>('[data-result-cta]')?.addEventListener('click', (event) => {
  const destination = (event.currentTarget as HTMLAnchorElement).getAttribute('href')?.replace('#solucion-', '') ?? null;
  fireAndForget(recordEvent('result_solution_clicked', { section: destination }));
});

diagnostic?.querySelector<HTMLUListElement>('[data-result-list]')?.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-result-problem-link]');
  const problem = link?.dataset.resultProblemLink as ProblemKey | undefined;
  if (problem) fireAndForget(recordEvent('result_solution_clicked', { problem, section: problem }));
});

document.querySelectorAll<HTMLAnchorElement>('[data-next-solution]').forEach((link) => {
  link.addEventListener('click', () => {
    const problem = link.dataset.nextProblem as ProblemKey | undefined;
    fireAndForget(recordEvent('personalized_next_clicked', { problem: problem ?? null, section: problem ?? null }));
  });
});

renderQuestion();

document.querySelectorAll<HTMLElement>('[data-track-cta]').forEach((element) => {
  element.addEventListener('click', () => {
    fireAndForget(recordEvent('cta_clicked', { cta: element.dataset.trackCta ?? null }));
  });
});

const observedSections = new Set<string>();
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const section = (entry.target as HTMLElement).dataset.trackSection;
      if (!section || observedSections.has(section)) return;
      observedSections.add(section);
      fireAndForget(recordEvent('section_viewed', { section }));
      sectionObserver.unobserve(entry.target);
    });
  }, { threshold: 0.35 });

  document.querySelectorAll<HTMLElement>('[data-track-section]').forEach((section) => sectionObserver.observe(section));
}

const video = document.querySelector<HTMLVideoElement>('[data-lazy-video]');
const videoToggle = document.querySelector<HTMLButtonElement>('[data-video-toggle]');
const videoLabel = videoToggle?.querySelector<HTMLElement>('[data-video-label]');

function prepareVideo(shouldPlay: boolean) {
  if (!video || video.dataset.loaded === 'true') {
    if (shouldPlay) fireAndForget(video?.play() ?? Promise.resolve());
    return;
  }
  video.querySelectorAll<HTMLSourceElement>('source[data-src]').forEach((source) => {
    source.src = source.dataset.src ?? '';
  });
  video.dataset.loaded = 'true';
  video.load();
  if (shouldPlay) video.addEventListener('canplay', () => fireAndForget(video.play()), { once: true });
}

if (video && 'IntersectionObserver' in window) {
  const videoObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    prepareVideo(!reducedMotion);
    videoObserver.disconnect();
  }, { rootMargin: '320px 0px' });
  videoObserver.observe(video);
}

video?.addEventListener('play', () => {
  if (videoToggle) videoToggle.dataset.playing = 'true';
  if (videoLabel) videoLabel.textContent = 'Pausar demostración';
});

video?.addEventListener('pause', () => {
  if (videoToggle) delete videoToggle.dataset.playing;
  if (videoLabel) videoLabel.textContent = 'Ver demostración';
});

videoToggle?.addEventListener('click', () => {
  if (!video) return;
  if (video.paused) {
    prepareVideo(true);
    fireAndForget(recordEvent('video_played', { section: 'reservation' }));
  } else {
    video.pause();
  }
});

const trialDialog = document.querySelector<HTMLDialogElement>('[data-trial-dialog]');
const leadForm = trialDialog?.querySelector<HTMLFormElement>('[data-lead-form]');
const nameInput = leadForm?.elements.namedItem('name') as HTMLInputElement | null;
const phoneInput = leadForm?.elements.namedItem('phone') as HTMLInputElement | null;
const honeypot = leadForm?.elements.namedItem('website') as HTMLInputElement | null;
const submitButton = leadForm?.querySelector<HTMLButtonElement>('[data-whatsapp-submit]');
const formError = leadForm?.querySelector<HTMLElement>('[data-form-error]');
let trialCtaLocation = 'unknown';

function hasMinimumIdentity() {
  const hasName = (nameInput?.value.trim().length ?? 0) >= 2;
  const phoneDigits = phoneInput?.value.replace(/\D/g, '') ?? '';
  return hasName || phoneDigits.length >= 6;
}

function updateLeadFormState() {
  if (submitButton) submitButton.disabled = !hasMinimumIdentity();
  if (formError) formError.hidden = true;
}

nameInput?.addEventListener('input', updateLeadFormState);
phoneInput?.addEventListener('input', updateLeadFormState);

document.querySelectorAll<HTMLButtonElement>('[data-trial-cta]').forEach((button) => {
  button.addEventListener('click', () => {
    trialCtaLocation = button.dataset.ctaLocation ?? 'unknown';
    closeMenu();
    fireAndForget(recordEvent('trial_intent', { cta: trialCtaLocation }));
    if (!trialDialog) return;
    trialDialog.showModal();
    window.setTimeout(() => nameInput?.focus(), 60);
  });
});

trialDialog?.querySelector<HTMLButtonElement>('[data-dialog-close]')?.addEventListener('click', () => trialDialog.close());
trialDialog?.addEventListener('click', (event) => {
  if (event.target === trialDialog) trialDialog.close();
});

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hasMinimumIdentity() || !submitButton) return;
  if (honeypot?.value) return;

  const name = nameInput?.value.trim() || null;
  const phone = phoneInput?.value.trim() || null;
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  submitButton.textContent = 'Preparando WhatsApp…';
  if (formError) formError.hidden = true;

  try {
    await identifyLead(name, phone, trialCtaLocation);
    await recordEvent('whatsapp_opened', { cta: trialCtaLocation });

    const selectedLabels = selectedProblems()
      .map((key) => questions.find((question) => question.key === key)?.summary)
      .filter(Boolean);
    const messageParts = [
      `Hola${name ? `, soy ${name}` : ''}. Quiero probar Cita Suite.`,
      phone ? `Mi teléfono es ${phone}.` : '',
      selectedLabels.length ? `En la landing marqué: ${selectedLabels.join(', ')}.` : ''
    ].filter(Boolean);
    window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messageParts.join(' '))}`);
  } catch {
    if (formError) {
      formError.textContent = 'No pudimos preparar el contacto. Revisá tu conexión e intentá de nuevo.';
      formError.hidden = false;
    }
  } finally {
    submitButton.removeAttribute('aria-busy');
    submitButton.textContent = originalText ?? 'Continuar por WhatsApp';
    updateLeadFormState();
  }
});
