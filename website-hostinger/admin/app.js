import '/shared/vgv-command.js?v=20260821-6';
const API_BASE = 'https://permuta-api.vgventures.com.br';
const PAGE_SIZE = 25;
const MODULES = [
  { id: 'finder', name: 'VGVfinder', purpose: 'descoberta, similares e oportunidades imobiliárias', interfacePath: '/finder/' },
  { id: 'intelligence', name: 'VGVintel', purpose: 'captura, deduplicação, histórico e inteligência de mercado', interfacePath: '/intel/' },
  { id: 'advisor', name: 'VGVadvisor', purpose: 'atendimento e recomendação imobiliária' },
  { id: 'match', name: 'VGVmatch', purpose: 'imóvel ↔ perfil do cliente via VGVfinder', interfacePath: '/finder/?mode=match' },
  { id: 'crm', name: 'VGVcrm', purpose: 'leads, clientes, histórico e funil' },
  { id: 'exchange', name: 'VGVexchange', purpose: 'avaliação e simulação de permutas', interfacePath: '/exchange/' },
  { id: 'social', name: 'VGVsocial', purpose: 'geração, aprovação, agendamento e analytics de conteúdo' },
  { id: 'dashboard', name: 'VGVdashboard', purpose: 'dashboards, indicadores, performance e inteligência' },
];
const MODULE_IDS = new Set(MODULES.map((module) => module.id));

const state = {
  identity: null,
  route: '',
  selectedTenantId: null,
  inviteToken: new URLSearchParams(location.search).get('invite'),
  resetToken: location.pathname.replace(/\/+$/, '') === '/admin/reset-password' ? new URLSearchParams(location.search).get('token') : null,
  capabilities: null,
  tenants: [],
  users: [],
  features: [],
  tenantRoles: [],
  actorTenantPermissions: [],
  offsets: Object.create(null),
  tenantFilters: { q: '', status: '', roleCode: '' },
};

const $ = (selector, root = document) => root.querySelector(selector);
const access = $('#access');
const app = $('#app');
const view = $('#view');
const globalMessage = $('#global-message');

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked') node.checked = Boolean(value);
    else if (key === 'disabled') node.disabled = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function replace(node, children) {
  node.replaceChildren(...(Array.isArray(children) ? children : [children]));
}

function requestId() {
  return crypto.randomUUID();
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', 'X-Request-ID': requestId(), ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw { code: 'network_error', status: 0 };
  }
  let payload = null;
  if (response.status !== 204) {
    try { payload = await response.json(); } catch { payload = null; }
  }
  if (!response.ok) {
    const error = payload?.error || {};
    throw { code: error.code || 'request_failed', status: response.status, requestId: error.requestId };
  }
  return payload;
}

const errorMessages = {
  authentication_required: 'Sua sessão expirou. Entre novamente.',
  invalid_credentials: 'E-mail ou senha inválidos.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  forbidden: 'Você não tem permissão para realizar esta ação.',
  entitlement_disabled: 'Esta capacidade não está habilitada para a organização.',
  validation_failed: 'Revise os campos informados.',
  not_found: 'O recurso não foi encontrado ou não está disponível para esta conta.',
  conflict: 'A alteração conflita com o estado atual. Atualize a página e tente novamente.',
  invitation_expired: 'Este convite expirou. Solicite um novo link à organização.',
  invitation_replayed: 'Este convite já foi utilizado.',
  invalid_invitation: 'Este convite é inválido ou foi revogado.',
  invitation_email_mismatch: 'O convite pertence a outro e-mail. Entre com a conta correta.',
  login_required: 'Já existe uma conta ativa para este e-mail. Entre para aceitar o convite.',
  tenant_inactive: 'A organização não está ativa.',
  account_inactive: 'A conta selecionada não está ativa.',
  invalid_current_password: 'A senha atual está incorreta.',
  credentials_changed: 'As credenciais foram alteradas. Entre novamente.',
  last_owner_required: 'O último proprietário ativo não pode ser removido, suspenso ou desabilitado.',
  role_escalation_denied: 'O papel solicitado excede sua autoridade nesta organização.',
  unknown_permission: 'Uma ou mais permissões não estão disponíveis.',
  reserved_role_code: 'Este código é reservado para um papel do sistema.',
  system_role_protected: 'Papéis do sistema não podem ser alterados.',
  role_assigned: 'Este papel ainda está atribuído a um membro e não pode ser excluído.',
  membership_exists: 'Este usuário já possui uma associação com a organização. Reative ou ajuste a associação existente.',
  active_plan_required: 'Selecione um plano ativo. A criação automática só funciona quando existe um único plano ativo.',
  password_reset_invalid: 'Este link de redefinição é inválido ou foi revogado.',
  password_reset_expired: 'Este link de redefinição expirou. Solicite um novo link.',
  password_reset_replayed: 'Este link de redefinição já foi utilizado.',
  network_error: 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.',
  request_failed: 'A solicitação não pôde ser concluída.',
  internal_error: 'O serviço encontrou um erro interno. Tente novamente mais tarde.',
};

function errorText(error) {
  const message = errorMessages[error?.code] || errorMessages.request_failed;
  return error?.requestId ? `${message} Referência: ${error.requestId}.` : message;
}

function showMessage(message, isError = false) {
  globalMessage.textContent = message;
  globalMessage.classList.toggle('is-error', isError);
  globalMessage.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { globalMessage.hidden = true; }, 7000);
}

function setButtonBusy(button, busy, label = 'Processando...') {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function clearInviteSecret() {
  state.inviteToken = null;
  const url = new URL(location.href);
  url.searchParams.delete('invite');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function hideAccessStates() {
  ['#login-form', '#recovery-form', '#reset-form', '#invite-form', '#invite-result'].forEach((selector) => { $(selector).hidden = true; });
}

function showLogin() {
  hideAccessStates();
  $('#login-form').hidden = false;
  $('#login-form [name="email"]').focus();
}

function showRecovery() {
  hideAccessStates();
  $('#recovery-message').textContent = '';
  $('#recovery-form').hidden = false;
  $('#recovery-form [name="email"]').focus();
}

function showReset() {
  hideAccessStates();
  $('#reset-error').textContent = '';
  $('#reset-form').hidden = false;
  $('#reset-form [name="newPassword"]').focus();
}

function showInvitation() {
  hideAccessStates();
  $('#invite-form').hidden = false;
  $('#invite-form [name="displayName"]').focus();
}

function leaveReset() {
  state.resetToken = null;
  history.replaceState(null, '', '/admin');
  showLogin();
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function has(permission) {
  return state.identity?.platformPermissions.includes(permission) || false;
}

const platformRoutes = [
  { id: 'overview', label: 'Visão geral', permission: 'platform.overview.read' },
  { id: 'tenants', label: 'Organizações', permission: 'platform.tenant.read' },
  { id: 'users', label: 'Usuários', permission: 'platform.user.read' },
  { id: 'catalog', label: 'Planos e recursos', permissions: ['platform.plan.read', 'platform.feature.read', 'platform.role.read'] },
  { id: 'usage', label: 'Uso', permission: 'platform.usage.read' },
  { id: 'audit', label: 'Auditoria', permission: 'platform.audit.read' },
];

const tenantViews = [
  { id: 'dashboard', label: 'Dashboard', permission: 'tenant.dashboard.read' },
  { id: 'users', label: 'Usuários', permission: 'tenant.user.read' },
  { id: 'invitations', label: 'Convites', permission: 'tenant.user.invite' },
  { id: 'roles', label: 'Papéis e permissões', permission: 'tenant.role.read' },
  { id: 'access', label: 'Matriz de acesso', permission: 'tenant.user.read' },
  { id: 'usage', label: 'Uso', permission: 'tenant.usage.read' },
  { id: 'settings', label: 'Configurações', permission: 'tenant.settings.read' },
  { id: 'audit', label: 'Auditoria', permission: 'audit.event.read' },
];

function allowedRoutes() {
  return platformRoutes.filter((item) => item.permission ? has(item.permission) : item.permissions.some(has));
}

function availableModules() {
  if (!state.selectedTenantId || !state.capabilities || state.capabilities.tenantId !== state.selectedTenantId) return [];
  const features = new Set(state.capabilities.features.map((feature) => feature.code));
  const permissions = new Set(state.capabilities.permissions);
  return MODULES.filter((module) => features.has(module.id) && permissions.has(`${module.id}.module.access`));
}

async function loadCapabilities() {
  state.capabilities = null;
  const membership = state.identity?.memberships.find((item) => item.tenantId === state.selectedTenantId);
  if (!membership) return;
  try { state.capabilities = await api(`/api/v1/tenants/${membership.tenantId}/capabilities`); }
  catch { state.capabilities = null; }
}

function renderNavigation() {
  document.documentElement.dataset.tenantId=state.selectedTenantId||'';
  const nav = $('#primary-nav');
  const nodes = [];
  allowedRoutes().forEach((item, index) => {
    nodes.push(el('button', { className: `nav-button${state.route === item.id ? ' active' : ''}`, type: 'button', text: item.label, dataset: { route: item.id, index: String(index + 1).padStart(2, '0') }, onclick: () => navigate(item.id) }));
  });
  if (state.identity.memberships.length) {
    if (nodes.length) nodes.push(el('div', { className: 'nav-rule', role: 'separator' }));
    nodes.push(el('p', { className: 'nav-section-label', text: 'Organizações' }));
    state.identity.memberships.forEach((membership, index) => {
      nodes.push(el('button', { className: `nav-button${state.route === 'tenant' && state.selectedTenantId === membership.tenantId ? ' active' : ''}`, type: 'button', text: membership.tenantName, dataset: { index: `O${index + 1}` }, onclick: async () => { state.selectedTenantId = membership.tenantId; await loadCapabilities(); navigate('tenant'); } }));
    });
  }
  const modules = availableModules();
  if (modules.length) {
    nodes.push(el('div', { className: 'nav-rule', role: 'separator' }), el('p', { className: 'nav-section-label', text: 'Aplicações' }));
    modules.forEach((module, index) => nodes.push(el('button', { className: `nav-button${state.route === module.id ? ' active' : ''}`, type: 'button', text: module.name, dataset: { route: module.id, index: `A${index + 1}` }, onclick: () => navigate(module.id) })));
  }
  replace(nav, nodes);
}

function renderIdentity() {
  $('#identity-name').textContent = state.identity.user.displayName;
  $('#identity-email').textContent = state.identity.user.email;
  $('#identity-mark').textContent = initials(state.identity.user.displayName);
  const expiresAt = state.identity.sessionExpiresAt || state.identity.expiresAt || state.identity.session?.expiresAt;
  $('#session-indicator').lastChild.textContent = expiresAt ? `Sessão até ${formatDate(expiresAt)}` : 'Expiração da sessão indisponível';
}

function pageHeading(context, title) {
  $('#page-context').textContent = context;
  $('#page-title').textContent = title;
}

function loading() {
  replace(view, el('div', { className: 'loading-state', text: 'Consultando dados protegidos...' }));
}

function renderError(error, retry) {
  const box = el('div', { className: 'error-state' }, [el('strong', { text: errorText(error) })]);
  if (retry) box.append(el('div', { className: 'actions' }, el('button', { className: 'button button-secondary', type: 'button', text: 'Tentar novamente', onclick: retry })));
  replace(view, box);
}

function empty(message) {
  return el('div', { className: 'empty-state', text: message });
}

function badge(status) {
  const labels = { active: 'Ativo', suspended: 'Suspenso', disabled: 'Desabilitado', invited: 'Convidado', succeeded: 'Sucesso', denied: 'Negado', failed: 'Falhou', trialing: 'Teste' };
  return el('span', { className: `badge badge-${status}`, text: labels[status] || status || 'Desconhecido' });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—';
}

function auditActorId(event) {
  return event.actorUserId || event.actorId || event.actor?.id || '—';
}

function roleName(role) {
  return typeof role === 'string' ? role : role.name || role.code;
}

function table(headers, rows) {
  const head = el('thead', {}, el('tr', {}, headers.map((header) => el('th', { text: header }))));
  const body = el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell) => el('td', {}, cell)))));
  return el('div', { className: 'table-shell' }, el('table', {}, [head, body]));
}

function sectionIntro(kicker, title, description, actions = []) {
  return el('div', { className: 'section-intro' }, [
    el('div', {}, [el('p', { className: 'kicker', text: kicker }), el('h2', { text: title }), el('p', { text: description })]),
    el('div', { className: 'actions' }, actions),
  ]);
}

function pagination(resource, page, reload) {
  const offset = page.offset || 0;
  return el('div', { className: 'pagination' }, [
    el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Anterior', disabled: offset === 0, onclick: () => { state.offsets[resource] = Math.max(0, offset - page.limit); reload(); } }),
    el('span', { text: `Página ${Math.floor(offset / page.limit) + 1}` }),
    el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Próxima', disabled: !page.hasMore, onclick: () => { state.offsets[resource] = offset + page.limit; reload(); } }),
  ]);
}

function routeUrl(route) {
  if (MODULE_IDS.has(route)) {
    const url = new URL(`/admin/${route}`, location.origin);
    if (state.selectedTenantId) url.searchParams.set('tenant', state.selectedTenantId);
    if (state.inviteToken) url.searchParams.set('invite', state.inviteToken);
    return `${url.pathname}${url.search}`;
  }
  const url = new URL('/admin', location.origin);
  if (route === 'tenant' && state.selectedTenantId) {
    url.searchParams.set('tenant', state.selectedTenantId);
    const tenantView = new URLSearchParams(location.search).get('tenantView');
    if (tenantView) url.searchParams.set('tenantView', tenantView);
  }
  else if (route !== 'overview') url.searchParams.set('view', route);
  if (state.inviteToken) url.searchParams.set('invite', state.inviteToken);
  return `${url.pathname}${url.search}`;
}

function routeFromLocation() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const moduleId = path.startsWith('/admin/') ? path.slice('/admin/'.length) : '';
  if (MODULE_IDS.has(moduleId)) {
    const tenantId = new URLSearchParams(location.search).get('tenant');
    if (tenantId && state.identity?.memberships.some((membership) => membership.tenantId === tenantId)) state.selectedTenantId = tenantId;
    return moduleId;
  }
  if (path !== '/admin') return 'overview';
  const parameters = new URLSearchParams(location.search);
  const tenantId = parameters.get('tenant');
  if (tenantId && (state.identity?.memberships.some((membership) => membership.tenantId === tenantId)
    || has('platform.tenant.read'))) {
    state.selectedTenantId = tenantId;
    return 'tenant';
  }
  const requested = parameters.get('view');
  return platformRoutes.some((route) => route.id === requested) ? requested : 'overview';
}

async function navigate(route, push = true) {
  state.route = route;
  renderNavigation();
  $('.sidebar').classList.remove('open');
  $('#mobile-nav').setAttribute('aria-expanded', 'false');
  loading();
  if (push) {
    const url = routeUrl(route);
    if (`${location.pathname}${location.search}` !== url) history.pushState(null, '', url);
  }
  const renderers = { overview: renderOverview, tenants: renderTenants, users: renderUsers, catalog: renderCatalog, usage: renderPlatformUsage, audit: renderAudit, tenant: renderTenantConsole };
  if (MODULE_IDS.has(route)) await renderModule(route);
  else await (renderers[route] || renderNoAccess)();
  $('#main-content').focus({ preventScroll: true });
}

async function renderOverview() {
  pageHeading('Control plane', 'Visão geral');
  try {
    const data = await api('/api/v1/platform/overview');
    const cards = [
      ['Organizações', data.counts.tenants], ['Usuários nomeados', data.counts.users],
      ['Sessões ativas', data.counts.activeSessions], ['Recursos', data.counts.features],
    ].map(([label, value]) => el('article', { className: 'metric' }, [el('span', { text: label }), el('strong', { text: value })]));
    replace(view, [
      sectionIntro('Panorama', 'Operação da plataforma', 'Contagens agregadas do control plane. Nenhum dado privado de negócio é consultado aqui.'),
      el('div', { className: 'metric-grid' }, cards),
      el('div', { className: 'editorial-grid' }, [
        el('article', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Limite de acesso' }), el('h2', { text: 'Administração não é observação.' }), el('p', { text: 'Platform Super Admin gerencia metadados, identidades e capacidades. Conteúdo privado de uma organização exige associação válida e as permissões tenant correspondentes; não há acesso implícito.' })]),
        el('article', { className: 'panel panel-dark' }, [el('p', { className: 'kicker', text: 'Saúde da persistência' }), el('h2', { text: 'Consulta ao banco' }), el('p', { text: 'Este indicador cobre somente a consulta de persistência, não a saúde integral do serviço.' }), el('div', { className: 'health-line' }, [el('span', { text: 'Banco de dados' }), el('strong', { className: `health-badge${data.database.healthy ? '' : ' down'}`, text: data.database.healthy ? 'Consulta operacional' : 'Consulta indisponível' })])]),
      ]),
      el('div', { className: 'foundation-grid' }, [
        el('article', { className: 'foundation-card' }, [el('p', { className: 'kicker', text: 'Fundação' }), el('h3', { text: 'Integration Layer' }), el('p', { text: 'Contratos e conexões controladas entre módulos, canais e provedores.' })]),
        el('article', { className: 'foundation-card' }, [el('p', { className: 'kicker', text: 'Fundação' }), el('h3', { text: 'Database' }), el('p', { text: 'Persistência governada para dados compartilhados e privados por organização.' })]),
        el('article', { className: 'foundation-card' }, [el('p', { className: 'kicker', text: 'Fundação' }), el('h3', { text: 'AI Core' }), el('p', { text: 'Capacidades de IA com contexto, validação e limites operacionais explícitos.' })]),
      ]),
    ]);
  } catch (error) { renderError(error, renderOverview); }
}

function moduleFrameSource(module) {
  const url = new URL(module.interfacePath, location.origin);
  url.searchParams.set('tenantId', state.selectedTenantId);
  url.searchParams.set('embedded', '1');
  url.searchParams.set('v', '20260821-6');
  const routeParameters = new URLSearchParams(location.search);
  const deepLinks = module.id === 'exchange' ? ['listingUrl', 'subjectPropertyId'] : module.id === 'finder' ? ['q', 'similarTo', 'mode'] : module.id === 'intelligence' ? ['propertyId'] : [];
  for (const key of deepLinks) {
    const value = routeParameters.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function renderModule(moduleId) {
  const module = availableModules().find((item) => item.id === moduleId);
  if (!module) {
    pageHeading('Aplicações', 'Acesso não disponível');
    replace(view, el('div', { className: 'error-state' }, [el('strong', { text: 'Este módulo não está habilitado para sua associação ativa ou a permissão necessária não é efetiva.' })]));
    return;
  }
  const membership = state.identity.memberships.find((item) => item.tenantId === state.selectedTenantId);
  const tenantAware = ['finder','match','intelligence','exchange'].includes(module.id);
  pageHeading(membership?.tenantName || 'Organização', module.name);
  if (module.interfacePath) {
    replace(view, el('section', { className: 'module-workspace' }, [
      el('div', { className: 'module-workspace-head' }, [
        el('div', {}, [el('p', { className: 'kicker', text: `Aplicação · ${module.id}` }), el('p', { text: tenantAware ? `Interface funcional de ${module.name} integrada à sessão e à organização selecionada.` : `Interface operacional compartilhada de ${module.name}; a sessão e os dados ainda não são isolados pela organização selecionada.` })]),
        el('span', { className: 'readiness-label', text: tenantAware ? 'Integração tenant ativa' : 'Interface compartilhada' }),
      ]),
      el('iframe', { className: 'module-frame', src: moduleFrameSource(module), title: `${module.name} - interface funcional` }),
    ]));
    return;
  }
  replace(view, el('article', { className: 'module-hero' }, [
    el('p', { className: 'kicker', text: `Aplicação · ${module.id}` }),
    el('h2', { text: module.name }),
    el('p', { className: 'module-purpose', text: `Função: ${module.purpose}.` }),
    el('div', { className: 'readiness-line' }, [
      el('span', { className: 'readiness-label', text: 'Landing disponível' }),
      el('p', { text: 'A integração funcional do módulo com esta sessão ainda não está disponível.' }),
    ]),
  ]));
}

async function ensureUsers() {
  return (await api('/api/v1/platform/users?limit=100&offset=0')).items;
}

async function renderTenants() {
  pageHeading('Control plane', 'Organizações');
  const offset = state.offsets.tenants || 0;
  try {
    const data = await api(`/api/v1/platform/tenants?limit=${PAGE_SIZE}&offset=${offset}`);
    state.tenants = data.items;
    const nodes = [sectionIntro('Diretório', 'Organizações da plataforma', 'Ciclo de vida, proprietário explícito e acesso ao console quando houver associação.')];
    if (has('platform.tenant.manage') && has('platform.subscription.manage')) nodes.push(await createTenantForm());
    if (!data.items.length) nodes.push(empty('Nenhuma organização encontrada.'));
    else {
      const rows = data.items.map((tenant) => {
        const statusSelect = el('select', { 'aria-label': `Novo status de ${tenant.name}` }, ['active', 'suspended', 'disabled'].map((status) => el('option', { value: status, text: statusLabel(status), selected: tenant.status === status })));
        return [
        el('div', {}, [el('button', { className: 'link-button', type: 'button', text: tenant.name, onclick: () => openTenant(tenant.id) }), el('span', { className: 'cell-subtitle', text: tenant.slug })]),
        badge(tenant.status), formatDate(tenant.createdAt),
        el('div', { className: 'cell-actions' }, [
          el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Detalhes', onclick: () => openTenant(tenant.id) }),
          ...(has('platform.tenant.manage') ? [statusSelect, el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Aplicar', onclick: () => changeTenantStatus(tenant, statusSelect.value) })] : []),
        ]),
      ]; });
      nodes.push(table(['Organização', 'Status', 'Criada em', 'Ações'], rows), pagination('tenants', data.page, renderTenants));
    }
    replace(view, nodes);
  } catch (error) { renderError(error, renderTenants); }
}

async function createTenantForm() {
  let plans = null;
  if (has('platform.plan.read')) {
    try { plans = (await api('/api/v1/platform/plans?limit=100&offset=0')).items.filter((plan) => plan.status === 'active'); }
    catch { plans = null; }
  }
  const form = el('form', { className: 'inline-form', novalidate: '' }, [
    el('label', {}, ['Nome', el('input', { name: 'name', maxlength: '120', required: '' })]),
    el('label', {}, ['Slug', el('input', { name: 'slug', maxlength: '80', pattern: '[a-z0-9]+(?:-[a-z0-9]+)*', placeholder: 'empresa-exemplo', required: '' })]),
    ...(plans ? [el('label', {}, ['Plano ativo', el('select', { name: 'planId' }, [el('option', { value: '', text: 'Usar o único plano ativo' }), ...plans.map((plan) => el('option', { value: plan.id, text: `${plan.name} · ${plan.code}` }))])])] : []),
    el('button', { className: 'button button-primary', type: 'submit', text: 'Criar organização' }),
    el('p', { className: 'form-message error', role: 'alert' }),
  ]);
  if (has('platform.plan.read') && plans === null) form.append(el('p', { className: 'form-message error', text: 'Planos indisponíveis. A API só criará a organização se houver um único plano ativo inequívoco.' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button', form); const message = $('.form-message', form); message.textContent = '';
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    setButtonBusy(button, true);
    try {
      const body = { name: values.get('name').trim(), slug: values.get('slug').trim().toLowerCase() };
      if (values.get('planId')) body.planId = values.get('planId');
      const created = await api('/api/v1/platform/tenants', { method: 'POST', body });
      state.tenants.unshift(created.tenant); form.reset(); showMessage('Organização criada. Atribua explicitamente um proprietário ativo.'); await openTenant(created.tenant.id);
    } catch (error) { message.textContent = errorText(error); }
    finally { setButtonBusy(button, false); }
  });
  return form;
}

async function changeTenantStatus(tenant, next) {
  if (!next || next === tenant.status) return;
  const accepted = await confirmAction('Alterar status da organização', `O status de ${tenant.name} será alterado para ${statusLabel(next)}. Isso afeta o acesso de todos os membros.`, 'Alterar status');
  if (!accepted) return;
  try { await api(`/api/v1/platform/tenants/${tenant.id}/status`, { method: 'PATCH', body: { status: next } }); showMessage('Status da organização atualizado.'); await renderTenants(); }
  catch (error) { showMessage(errorText(error), true); await renderTenants(); }
}

function statusLabel(status) {
  return { active: 'ativo', suspended: 'suspenso', disabled: 'desabilitado', invited: 'convidado', trialing: 'em teste', revoked: 'revogado', pending: 'pendente' }[status] || status;
}

async function openTenant(tenantId) {
  state.selectedTenantId = tenantId;
  state.route = 'tenant';
  await loadCapabilities();
  await navigate('tenant');
}

async function renderUsers() {
  pageHeading('Control plane', 'Usuários');
  const offset = state.offsets.users || 0;
  try {
    const data = await api(`/api/v1/platform/users?limit=${PAGE_SIZE}&offset=${offset}`);
    state.users = data.items;
    const rows = data.items.map((user) => [
      el('div', {}, [el('span', { className: 'cell-title', text: user.displayName }), el('span', { className: 'cell-subtitle', text: user.email })]),
      badge(user.status), formatDate(user.lastLoginAt), formatDate(user.createdAt),
    ]);
    replace(view, [sectionIntro('Identidades', 'Usuários nomeados', 'Diretório global de contas. Senhas e sessões nunca são expostas pela API.'), data.items.length ? table(['Usuário', 'Status', 'Último acesso', 'Criado em'], rows) : empty('Nenhum usuário encontrado.'), pagination('users', data.page, renderUsers)]);
  } catch (error) { renderError(error, renderUsers); }
}

async function renderCatalog() {
  pageHeading('Control plane', 'Planos e recursos');
  try {
    const calls = [has('platform.plan.read') ? api('/api/v1/platform/plans?limit=100&offset=0') : null, has('platform.feature.read') ? api('/api/v1/platform/features?limit=100&offset=0') : null, has('platform.role.read') ? api('/api/v1/platform/roles?limit=100&offset=0') : null];
    const [plans, features, roles] = await Promise.all(calls.map((call) => call || Promise.resolve(null)));
    state.features = features?.items || [];
    const cards = [];
    for (const plan of plans?.items || []) {
      cards.push(el('article', { className: 'catalog-card' }, [el('p', { className: 'kicker', text: plan.code }), el('h3', { text: plan.name }), el('p', {}, badge(plan.status)), ...(plan.features || []).map((feature) => el('div', { className: 'feature-line' }, [el('span', { text: feature.name || feature.code }), el('strong', { text: feature.enabled ? 'Incluído' : 'Não incluído' })]))]));
    }
    for (const feature of features?.items || []) cards.push(el('article', { className: 'catalog-card' }, [el('p', { className: 'kicker', text: 'Recurso' }), el('h3', { text: feature.name }), el('p', { text: feature.description || 'Sem descrição.' }), el('span', { className: 'permission', text: feature.code })]));
    for (const role of roles?.items || []) cards.push(el('article', { className: 'catalog-card' }, [el('p', { className: 'kicker', text: `Papel ${role.scope}` }), el('h3', { text: role.name }), el('p', { text: role.code }), permissionList(role.permissions)]));
    replace(view, [sectionIntro('Catálogo', 'Planos, recursos e papéis globais', 'Referências do control plane. Entitlements efetivos de cada organização são consultados no respectivo console.'), cards.length ? el('div', { className: 'catalog-grid' }, cards) : empty('Nenhum item de catálogo disponível para suas permissões.')]);
  } catch (error) { renderError(error, renderCatalog); }
}

function dateInputValue(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function usageDateRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function renderPlatformUsage() {
  pageHeading('Control plane', 'Uso');
  const parameters = new URLSearchParams(location.search);
  const now = new Date();
  const from = parameters.get('from') || dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = parameters.get('to') || dateInputValue(now);
  const offset = state.offsets.platformUsage || 0;
  const form = el('form', { className: 'inline-form', novalidate: '' }, [
    el('label', {}, ['De', el('input', { name: 'from', type: 'date', value: from, required: '' })]),
    el('label', {}, ['Até', el('input', { name: 'to', type: 'date', value: to, required: '' })]),
    el('button', { className: 'button button-primary', type: 'submit', text: 'Consultar' }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    state.offsets.platformUsage = 0;
    const url = new URL(location.href); url.searchParams.set('from', form.elements.from.value); url.searchParams.set('to', form.elements.to.value);
    history.replaceState(null, '', `${url.pathname}${url.search}`); renderPlatformUsage();
  });
  replace(view, [sectionIntro('Medição', 'Uso por organização', 'Fatos registrados no período, sem limites ou projeções inferidos.'), form, el('div', { className: 'loading-state', text: 'Consultando uso...' })]);
  try {
    const period = usageDateRange(from, to);
    const data = await api(`/api/v1/platform/usage?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}&limit=${PAGE_SIZE}&offset=${offset}`);
    const rows = data.items.map((item) => [
      el('div', {}, [el('span', { className: 'cell-title', text: item.tenantName }), el('span', { className: 'cell-subtitle', text: item.tenantId })]),
      item.featureCode, item.metric, String(item.quantity),
    ]);
    replace(view, [sectionIntro('Medição', 'Uso por organização', 'Fatos registrados no período, sem limites ou projeções inferidos.'), form, data.items.length ? table(['Organização', 'Recurso', 'Métrica', 'Quantidade'], rows) : empty('Nenhum uso registrado no período.'), pagination('platformUsage', data.page, renderPlatformUsage)]);
  } catch (error) {
    replace(view, [sectionIntro('Medição', 'Uso por organização', 'Fatos registrados no período, sem limites ou projeções inferidos.'), form, el('div', { className: 'error-state' }, el('strong', { text: errorText(error) }))]);
  }
}

function permissionLabel(code) {
  const labels = { read: 'Ler', create: 'Criar', update: 'Atualizar', delete: 'Excluir', manage: 'Gerenciar', invite: 'Convidar', disable: 'Desabilitar', access: 'Acessar', execute: 'Executar', export: 'Exportar' };
  const parts = String(code).split('.');
  return `${labels[parts.at(-1)] || parts.at(-1)} · ${parts.slice(0, -1).join(' / ')}`;
}

function permissionList(permissions = []) {
  return el('div', { className: 'permission-list' }, permissions.map((code) => el('span', { className: 'permission', title: code, text: permissionLabel(code) })));
}

async function renderAudit() {
  pageHeading('Control plane', 'Auditoria');
  const offset = state.offsets.audit || 0;
  try {
    const data = await api(`/api/v1/platform/audit-events?limit=${PAGE_SIZE}&offset=${offset}`);
    const rows = data.items.map((event) => [
      formatDate(event.occurredAt),
      el('div', { className: 'audit-detail' }, [el('span', { className: 'cell-title', text: event.action }), el('span', { className: 'cell-subtitle', text: `${event.targetType || 'recurso'}${event.targetId ? ` · ${event.targetId}` : ''}` })]),
      el('div', { className: 'audit-detail' }, [el('span', { text: auditActorId(event) }), el('span', { className: 'cell-subtitle', text: `Tenant: ${event.tenantId || '—'}` })]),
      badge(event.outcome),
      el('div', { className: 'audit-detail' }, [el('span', { text: event.reason || '—' }), el('span', { className: 'cell-subtitle', text: `Req. ${event.requestId}` })]),
    ]);
    replace(view, [sectionIntro('Evidência', 'Eventos administrativos', 'Registro paginado de ações e negativas. Metadados são apresentados como texto seguro.'), data.items.length ? table(['Data', 'Ação', 'Ator / tenant', 'Resultado', 'Razão / referência'], rows) : empty('Nenhum evento de auditoria encontrado.'), pagination('audit', data.page, renderAudit)]);
  } catch (error) { renderError(error, renderAudit); }
}

async function renderTenantConsole() {
  const membership = state.identity.memberships.find((item) => item.tenantId === state.selectedTenantId);
  if (membership) { await loadCapabilities(); renderNavigation(); }
  const tenant = state.tenants.find((item) => item.id === state.selectedTenantId);
  const name = membership?.tenantName || tenant?.name || 'Organização';
  pageHeading('Console da organização', name);
  const nodes = [
    el('div', { className: 'tenant-banner' }, [el('div', {}, [el('p', { className: 'kicker', text: membership ? 'Associação ativa' : 'Metadados do control plane' }), el('h2', { text: name }), el('p', { text: membership ? membership.tenantSlug : tenant?.slug || state.selectedTenantId })]), tenant ? badge(tenant.status) : null]),
  ];
  if (!membership) {
    nodes.push(el('div', { className: 'privacy-note' }, [el('strong', { text: 'Sem acesso implícito aos dados privados.' }), 'Sua função de plataforma permite operar o ciclo de vida e os metadados abaixo, mas os endpoints da organização exigem associação ativa. Atribuir um proprietário cria uma associação explícita para o usuário selecionado; não concede acesso silencioso ao administrador atual.']));
    if (has('platform.tenant.manage') && has('platform.user.read')) nodes.push(await ownerAssignmentPanel(state.selectedTenantId));
    if (has('platform.subscription.manage') && has('platform.plan.read')) nodes.push(await subscriptionPanel(state.selectedTenantId));
    if (has('platform.entitlement.manage') && has('platform.feature.read')) nodes.push(await platformEntitlementPanel(state.selectedTenantId));
    replace(view, nodes);
    return;
  }
  state.actorTenantPermissions = [...new Set(state.capabilities?.permissions || [])];
  const allowed = tenantViews.filter((item) => item.permission ? state.actorTenantPermissions.includes(item.permission) : item.permissions.some((permission) => state.actorTenantPermissions.includes(permission)));
  const requested = new URLSearchParams(location.search).get('tenantView');
  const selected = allowed.find((item) => item.id === requested) || allowed[0];
  if (!selected) {
    nodes.push(empty('Sua associação está ativa, mas nenhuma seção do console está disponível para suas permissões.'));
    replace(view, nodes); return;
  }
  const platformPanels = [];
  if (has('platform.tenant.manage') && has('platform.user.read')) platformPanels.push(await ownerAssignmentPanel(membership.tenantId));
  if (has('platform.subscription.manage') && has('platform.plan.read')) platformPanels.push(await subscriptionPanel(membership.tenantId));
  if (has('platform.entitlement.manage') && has('platform.feature.read')) platformPanels.push(await platformEntitlementPanel(membership.tenantId));
  if (platformPanels.length) nodes.push(el('details', { className: 'platform-controls' }, [el('summary', { text: 'Controles de plataforma para esta organização' }), el('div', { className: 'catalog-grid' }, platformPanels)]));
  nodes.push(el('nav', { className: 'tenant-tabs', 'aria-label': 'Seções do console da organização' }, allowed.map((item) => el('button', { className: `tenant-tab${item.id === selected.id ? ' active' : ''}`, type: 'button', text: item.label, 'aria-current': item.id === selected.id ? 'page' : null, onclick: () => selectTenantView(item.id) }))));
  const content = el('div', { className: 'tenant-section' }, el('div', { className: 'loading-state', text: 'Consultando seção...' }));
  nodes.push(content);
  replace(view, nodes);
  const renderers = { dashboard: renderTenantDashboard, users: renderTenantUsers, invitations: renderTenantInvitations, roles: renderTenantRoles, access: renderAccessMatrix, usage: renderTenantUsage, settings: renderTenantSettings, audit: renderTenantAudit };
  await renderers[selected.id](membership.tenantId, content);
}

function tenantCan(permission) {
  return state.actorTenantPermissions.includes(permission);
}

function selectTenantView(tenantView, membershipId = null) {
  const url = new URL(location.href);
  url.searchParams.set('tenantView', tenantView);
  if (membershipId) url.searchParams.set('member', membershipId); else url.searchParams.delete('member');
  history.pushState(null, '', `${url.pathname}${url.search}`);
  renderTenantConsole();
}

function sectionError(error, retry) {
  return el('div', { className: 'error-state' }, [el('strong', { text: errorText(error) }), el('div', { className: 'actions' }, el('button', { className: 'button button-secondary', type: 'button', text: 'Tentar novamente', onclick: retry }))]);
}

function fact(label, value) {
  return el('article', { className: 'metric' }, [el('span', { text: label }), el('strong', { text: value ?? 'Indisponível' })]);
}

async function renderTenantDashboard(tenantId, content) {
  try {
    const data = await api(`/api/v1/tenants/${tenantId}/dashboard`);
    const usage = data.usage?.items || [];
    const audits = data.recentAudit || [];
    const nodes = [
      sectionIntro('Resumo real', 'Dashboard', 'Contagens e fatos retornados pela organização. Dados ausentes são marcados como indisponíveis.'),
      el('div', { className: 'metric-grid' }, [fact('Usuários ativos', data.counts?.activeUsers), fact('Convites pendentes', data.counts?.pendingInvitations), fact('Módulos habilitados', data.counts?.enabledModules), fact('Status da assinatura', data.subscription?.status ? statusLabel(data.subscription.status) : null)]),
      el('div', { className: 'editorial-grid' }, [
        el('section', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Assinatura atual' }), el('h3', { text: data.subscription?.planName || 'Indisponível' }), el('p', { text: data.subscription ? `${data.subscription.planCode} · início ${formatDate(data.subscription.startsAt)} · término ${formatDate(data.subscription.endsAt)}` : 'Nenhuma assinatura retornada pelo backend.' }), data.subscription ? badge(data.subscription.status) : null]),
        el('section', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Uso no período' }), el('h3', { text: data.usage ? `${formatDate(data.usage.periodStart)} a ${formatDate(data.usage.periodEnd)}` : 'Indisponível' }), ...(usage.length ? usage.map((item) => el('div', { className: 'feature-line' }, [el('span', { text: `${item.featureCode} · ${item.metric}` }), el('strong', { text: item.quantity })])) : [el('p', { text: 'Nenhum fato de uso retornado.' })])]),
      ]),
      el('section', { className: 'panel section-block' }, [el('p', { className: 'kicker', text: 'Mudanças recentes' }), el('h3', { text: 'Auditoria' }), audits.length ? table(['Data', 'Ação', 'Ator', 'Resultado'], audits.map((event) => [formatDate(event.occurredAt), event.action || '—', auditActorId(event), badge(event.outcome)])) : empty('Nenhuma mudança recente retornada.')]),
    ];
    if (tenantCan('tenant.entitlement.read')) {
      try { nodes.push(entitlementsPanel((await api(`/api/v1/tenants/${tenantId}/entitlements`)).items)); }
      catch (error) { nodes.push(el('div', { className: 'privacy-note' }, [el('strong', { text: 'Entitlements indisponíveis' }), errorText(error)])); }
    }
    replace(content, nodes);
  } catch (error) { replace(content, sectionError(error, () => renderTenantDashboard(tenantId, content))); }
}

async function loadTenantRoles(tenantId) {
  const data = await api(`/api/v1/tenants/${tenantId}/roles?limit=100&offset=0`);
  state.tenantRoles = data.items;
  return data.items;
}

async function renderTenantUsers(tenantId, content) {
  const memberId = new URLSearchParams(location.search).get('member');
  if (memberId) { await renderMemberDetail(tenantId, memberId, content); return; }
  const offset = state.offsets.tenantUsers || 0;
  const filters = state.tenantFilters;
  const form = el('form', { className: 'filter-bar', novalidate: '' }, [
    el('label', {}, ['Buscar', el('input', { name: 'q', type: 'search', value: filters.q, placeholder: 'Nome ou e-mail' })]),
    el('label', {}, ['Status', el('select', { name: 'status' }, [el('option', { value: '', text: 'Todos' }), ...['active', 'suspended', 'disabled', 'invited'].map((status) => el('option', { value: status, text: statusLabel(status), selected: filters.status === status }))])]),
    el('label', {}, ['Papel', el('select', { name: 'roleCode' }, [el('option', { value: '', text: 'Todos os papéis' })])]),
    el('button', { className: 'button button-primary', type: 'submit', text: 'Filtrar' }),
  ]);
  form.addEventListener('submit', (event) => { event.preventDefault(); state.tenantFilters = { q: form.elements.q.value.trim(), status: form.elements.status.value, roleCode: form.elements.roleCode.value }; state.offsets.tenantUsers = 0; renderTenantUsers(tenantId, content); });
  try {
    let roles = [];
    try { roles = await loadTenantRoles(tenantId); } catch { /* The member list remains usable without role options. */ }
    roles.forEach((role) => form.elements.roleCode.append(el('option', { value: role.code, text: role.name, selected: filters.roleCode === role.code })));
    const query = new URLSearchParams({ limit: PAGE_SIZE, offset });
    if (filters.q) query.set('q', filters.q); if (filters.status) query.set('status', filters.status); if (filters.roleCode) query.set('roleCode', filters.roleCode);
    const data = await api(`/api/v1/tenants/${tenantId}/members?${query}`);
    const rows = data.items.map((member) => [
      el('div', {}, [el('span', { className: 'cell-title', text: member.displayName }), el('span', { className: 'cell-subtitle', text: member.email })]),
      badge(member.status),
      el('div', { className: 'role-list' }, (member.roles || []).map((role) => el('span', { className: 'role-chip', text: role.name }))),
      (member.modules || []).map((module) => module.name || module.code).join(', ') || '—', formatDate(member.lastLoginAt), formatDate(member.createdAt),
      el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Gerenciar', onclick: () => selectTenantView('users', member.id) }),
    ]);
    replace(content, [sectionIntro('Acesso', 'Usuários', 'Busca e filtros processados pelo servidor. Papéis e módulos são mostrados integralmente.'), form, data.items.length ? table(['Usuário', 'Status', 'Papéis', 'Módulos', 'Último acesso', 'Criado em', 'Ação'], rows) : empty('Nenhum usuário corresponde aos filtros.'), pagination('tenantUsers', data.page, () => renderTenantUsers(tenantId, content))]);
  } catch (error) { replace(content, [sectionIntro('Acesso', 'Usuários', 'Busca e filtros processados pelo servidor.'), form, sectionError(error, () => renderTenantUsers(tenantId, content))]); }
}

async function renderMemberDetail(tenantId, membershipId, content) {
  try {
    const actorMembershipId = state.identity.memberships.find((membership) => membership.tenantId === tenantId)?.id;
    const [data, roles, actorData] = await Promise.all([
      api(`/api/v1/tenants/${tenantId}/members/${membershipId}`),
      loadTenantRoles(tenantId).catch(() => []),
      actorMembershipId && actorMembershipId !== membershipId
        ? api(`/api/v1/tenants/${tenantId}/members/${actorMembershipId}`).catch(() => null) : Promise.resolve(null),
    ]);
    const member = data.member;
    const actorRoles = actorMembershipId === membershipId ? data.roles : actorData?.roles || [];
    const actorIsOwner = actorRoles.some((role) => role.code === 'tenant-owner');
    const assignableRoles = actorIsOwner ? roles : roles.filter((role) => role.code !== 'tenant-owner');
    const allowedStatuses = new Set([member.status]);
    if (tenantCan('tenant.user.update')) { allowedStatuses.add('active'); allowedStatuses.add('suspended'); }
    if (tenantCan('tenant.user.disable')) allowedStatuses.add('disabled');
    const statusSelect = el('select', { 'aria-label': `Status de ${member.displayName}` }, [...allowedStatuses].map((status) => el('option', { value: status, text: statusLabel(status), selected: member.status === status })));
    const roleSelect = el('select', { multiple: '', size: Math.min(6, Math.max(2, assignableRoles.length)), 'aria-label': `Papéis de ${member.displayName}` }, assignableRoles.map((role) => el('option', { value: role.id, text: role.name, selected: (data.roles || []).some((assigned) => assigned.id === role.id) })));
    const controls = el('div', { className: 'member-controls' });
    if (tenantCan('tenant.user.update') || tenantCan('tenant.user.disable')) controls.append(statusSelect, el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Alterar status', onclick: () => updateMemberStatus(tenantId, member, statusSelect.value) }));
    if (tenantCan('tenant.role.manage')) controls.append(roleSelect, el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Salvar papéis', onclick: () => updateMemberRoles(tenantId, member, [...roleSelect.selectedOptions].map((option) => option.value)) }));
    const inherited = data.permissions?.inherited || [];
    const moduleRows = (data.modules || []).map((module) => [
      el('span', { className: 'cell-title', text: module.name || module.code }),
      module.entitled ? 'Incluído' : badge('denied'),
      module.allowed ? badge('active') : badge('denied'),
      module.entitled ? ((module.sourceRoles || []).map(roleName).join(', ') || 'Sem papel de origem') : 'Negado pelo entitlement',
    ]);
    replace(content, [
      sectionIntro('Detalhe do usuário', member.displayName, 'Acesso efetivo derivado de papéis e entitlements.', [el('button', { className: 'button button-secondary', type: 'button', text: 'Voltar aos usuários', onclick: () => selectTenantView('users') })]),
      el('div', { className: 'detail-grid' }, [
        el('section', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Perfil e associação' }), el('h3', { text: member.email }), badge(member.status), el('p', { text: `Último acesso: ${formatDate(member.lastLoginAt)} · criado em ${formatDate(member.createdAt)}` }), el('h4', { text: 'Todos os papéis' }), el('div', { className: 'role-list' }, (data.roles || []).map((role) => el('span', { className: 'role-chip', text: role.name }))), controls]),
        el('section', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Permissões herdadas' }), el('h3', { text: 'Derivadas de papéis' }), inherited.length ? permissionList(inherited.map((permission) => permission.code || permission)) : empty('Nenhuma permissão herdada.')]),
      ]),
      el('section', { className: 'panel section-block' }, [el('p', { className: 'kicker', text: 'Módulos efetivos' }), el('h3', { text: 'Acesso por entitlement' }), table(['Módulo', 'Entitled', 'Acesso', 'Origem'], moduleRows)]),
    ]);
  } catch (error) { replace(content, sectionError(error, () => renderMemberDetail(tenantId, membershipId, content))); }
}

async function renderTenantInvitations(tenantId, content) {
  const offset = state.offsets.tenantInvitations || 0;
  const create = invitationPanel(tenantId, () => renderTenantInvitations(tenantId, content));
  try {
    const data = await api(`/api/v1/tenants/${tenantId}/invitations?limit=${PAGE_SIZE}&offset=${offset}`);
    const rows = data.items.map((invitation) => [
      invitation.email, badge(invitation.status), formatDate(invitation.expiresAt), formatDate(invitation.createdAt),
      el('div', { className: 'cell-actions' }, [
        el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Reenviar', disabled: invitation.status !== 'pending', onclick: () => resendInvitation(tenantId, invitation.id, content) }),
        el('button', { className: 'button button-danger button-small', type: 'button', text: 'Revogar', disabled: invitation.status !== 'pending', onclick: () => revokeInvitation(tenantId, invitation.id, content) }),
      ]),
    ]);
    replace(content, [sectionIntro('Entrada controlada', 'Convites', 'Todo convite nasce como Viewer. A atribuição de outros papéis ocorre somente após a ativação.'), create, data.items.length ? table(['E-mail', 'Status', 'Expira em', 'Criado em', 'Ações'], rows) : empty('Nenhum convite encontrado.'), pagination('tenantInvitations', data.page, () => renderTenantInvitations(tenantId, content))]);
  } catch (error) { replace(content, [sectionIntro('Entrada controlada', 'Convites', 'A atribuição de papéis ocorre após a ativação.'), create, sectionError(error, () => renderTenantInvitations(tenantId, content))]); }
}

async function revokeInvitation(tenantId, invitationId, content) {
  if (!await confirmAction('Revogar convite', 'O link deixará de aceitar ativações.', 'Revogar convite')) return;
  try { await api(`/api/v1/tenants/${tenantId}/invitations/${invitationId}`, { method: 'DELETE' }); showMessage('Convite revogado.'); await renderTenantInvitations(tenantId, content); }
  catch (error) { showMessage(errorText(error), true); }
}

async function resendInvitation(tenantId, invitationId, content) {
  try {
    const result = await api(`/api/v1/tenants/${tenantId}/invitations/${invitationId}/resend`, { method: 'POST' });
    showInvitationSecret(result.token, 'Convite reenviado'); await renderTenantInvitations(tenantId, content);
  } catch (error) { showMessage(errorText(error), true); }
}

async function renderTenantRoles(tenantId, content) {
  const [rolesResult, permissionsResult] = await Promise.allSettled([loadTenantRoles(tenantId), api(`/api/v1/tenants/${tenantId}/permissions`)]);
  const nodes = [sectionIntro('Autoridade', 'Papéis e permissões', 'Papéis podem ser administrados dentro da autoridade do ator. O catálogo de permissões é somente leitura.')];
  if (rolesResult.status === 'fulfilled') nodes.push(rolePanel(tenantId, rolesResult.value, tenantCan('tenant.role.manage')));
  else nodes.push(sectionError(rolesResult.reason, () => renderTenantRoles(tenantId, content)));
  if (permissionsResult.status === 'fulfilled') {
    const groups = permissionsResult.value.items.reduce((result, permission) => {
      const domain = permission.domain || 'Sem domínio';
      if (!result.has(domain)) result.set(domain, []);
      result.get(domain).push(permission);
      return result;
    }, new Map());
    nodes.push(el('section', { className: 'section-block' }, [el('div', { className: 'subsection-head' }, el('div', {}, [el('p', { className: 'kicker', text: 'Catálogo somente leitura' }), el('h3', { text: 'Permissões por domínio' })])), el('div', { className: 'catalog-grid' }, [...groups].map(([domain, permissions]) => el('article', { className: 'catalog-card' }, [el('h3', { text: domain }), ...permissions.map((permission) => el('div', { className: 'feature-line' }, [el('div', {}, [el('span', { className: 'cell-title', text: permission.name }), el('span', { className: 'cell-subtitle', text: permission.code })]), el('span', { className: 'permission', text: permission.featureCode || 'tenant' })]))]))) ]));
  } else nodes.push(sectionError(permissionsResult.reason, () => renderTenantRoles(tenantId, content)));
  replace(content, nodes);
}

async function renderAccessMatrix(tenantId, content) {
  const offset = state.offsets.accessMatrix || 0;
  try {
    const members = await api(`/api/v1/tenants/${tenantId}/members?limit=10&offset=${offset}`);
    const details = await Promise.allSettled(members.items.map((member) => api(`/api/v1/tenants/${tenantId}/members/${member.id}`)));
    const moduleCodes = [...new Set(details.flatMap((result) => result.status === 'fulfilled' ? result.value.modules.map((module) => module.code) : []))];
    const rows = members.items.map((member, index) => {
      const result = details[index];
      if (result.status === 'rejected') return [el('button', { className: 'link-button', type: 'button', text: member.displayName, onclick: () => selectTenantView('users', member.id) }), ...moduleCodes.map(() => 'Indisponível')];
      return [el('button', { className: 'link-button', type: 'button', text: member.displayName, onclick: () => selectTenantView('users', member.id) }), ...moduleCodes.map((code) => {
        const module = result.value.modules.find((item) => item.code === code);
        const label = !module?.entitled ? 'Negado pelo entitlement' : module.allowed ? `Via papel: ${(module.sourceRoles || []).map(roleName).join(', ') || 'derivado'}` : 'Sem papel efetivo';
        return el('button', { className: `matrix-cell ${module?.allowed ? 'allowed' : 'denied'}`, type: 'button', text: label, onclick: () => selectTenantView('users', member.id) });
      })];
    });
    replace(content, [sectionIntro('Acesso efetivo', 'Matriz de acesso', 'Leitura por usuário e módulo. As células encaminham ao detalhe e nunca concedem acesso diretamente.'), members.items.length ? table(['Usuário', ...moduleCodes], rows) : empty('Nenhum usuário disponível para a matriz.'), pagination('accessMatrix', members.page, () => renderAccessMatrix(tenantId, content))]);
  } catch (error) { replace(content, sectionError(error, () => renderAccessMatrix(tenantId, content))); }
}

async function renderTenantUsage(tenantId, content) {
  const offset = state.offsets.tenantUsage || 0;
  try {
    const data = await api(`/api/v1/tenants/${tenantId}/usage?limit=${PAGE_SIZE}&offset=${offset}`);
    const rows = data.items.map((item) => [item.featureCode, item.metric, String(item.quantity)]);
    replace(content, [sectionIntro('Mês atual', 'Uso', `Fatos de ${formatDate(data.period?.from)} a ${formatDate(data.period?.to)}. Nenhum limite é inferido.`), data.items.length ? table(['Recurso', 'Métrica', 'Quantidade'], rows) : empty('Nenhum fato de uso registrado no mês atual.'), pagination('tenantUsage', data.page, () => renderTenantUsage(tenantId, content))]);
  } catch (error) { replace(content, sectionError(error, () => renderTenantUsage(tenantId, content))); }
}

function validTimezone(value) {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(); return true; } catch { return false; }
}

async function renderTenantSettings(tenantId, content) {
  try {
    const settings = await api(`/api/v1/tenants/${tenantId}/settings`);
    const form = el('form', { className: 'form-card settings-form', novalidate: '' }, [
      el('label', {}, ['Localidade', el('select', { name: 'locale', required: '' }, [
        el('option', { value: 'pt-BR', text: 'Português (Brasil)', selected: (settings.locale || 'pt-BR') === 'pt-BR' }),
        el('option', { value: 'en-US', text: 'English (United States)', selected: settings.locale === 'en-US' }),
      ])]),
      el('label', {}, ['Fuso horário IANA', el('input', { name: 'timezone', value: settings.timezone, maxlength: '80', placeholder: 'America/Sao_Paulo', required: '' })]),
      el('label', {}, ['Início da semana', el('select', { name: 'weekStart', required: '' }, [
        el('option', { value: 'monday', text: 'Segunda-feira', selected: (settings.weekStart || 'monday') === 'monday' }),
        el('option', { value: 'sunday', text: 'Domingo', selected: settings.weekStart === 'sunday' }),
      ])]),
      el('button', { className: 'button button-primary', type: 'submit', text: 'Salvar configurações', disabled: !tenantCan('tenant.settings.update') }),
      el('p', { className: 'form-message error', role: 'alert' }),
    ]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); const message = $('.form-message', form); message.textContent = '';
      if (!form.reportValidity()) return;
      if (!validTimezone(form.elements.timezone.value.trim())) { message.textContent = 'Informe um fuso horário IANA válido, como America/Sao_Paulo.'; return; }
      const button = $('button', form); setButtonBusy(button, true);
      try { await api(`/api/v1/tenants/${tenantId}/settings`, { method: 'PUT', body: { locale: form.elements.locale.value.trim(), timezone: form.elements.timezone.value.trim(), weekStart: form.elements.weekStart.value } }); showMessage('Configurações atualizadas.'); }
      catch (error) { message.textContent = errorText(error); }
      finally { setButtonBusy(button, false); }
    });
    replace(content, [sectionIntro('Preferências', 'Configurações', 'Somente localidade, fuso horário e início da semana são administrados aqui.'), form]);
  } catch (error) { replace(content, sectionError(error, () => renderTenantSettings(tenantId, content))); }
}

async function renderTenantAudit(tenantId, content) {
  const offset = state.offsets.tenantAudit || 0;
  try {
    const data = await api(`/api/v1/tenants/${tenantId}/audit-events?limit=${PAGE_SIZE}&offset=${offset}`);
    const rows = data.items.map((event) => [formatDate(event.occurredAt), event.action || '—', el('div', {}, [el('span', { text: auditActorId(event) }), el('span', { className: 'cell-subtitle', text: `Tenant: ${event.tenantId || tenantId}` })]), badge(event.outcome), event.reason || '—']);
    replace(content, [sectionIntro('Evidência', 'Auditoria da organização', 'Eventos paginados com contexto de ator e tenant quando retornado.'), data.items.length ? table(['Data', 'Ação', 'Ator / tenant', 'Resultado', 'Razão'], rows) : empty('Nenhum evento encontrado.'), pagination('tenantAudit', data.page, () => renderTenantAudit(tenantId, content))]);
  } catch (error) { replace(content, sectionError(error, () => renderTenantAudit(tenantId, content))); }
}

function memberPanel(tenantId, members, roles, tenantCan) {
  const panel = el('section', { className: 'panel' }, el('div', { className: 'subsection-head' }, [el('div', {}, [el('p', { className: 'kicker', text: 'Acesso' }), el('h3', { text: 'Membros' })]), el('span', { text: String(members.length) })]));
  if (!members.length) { panel.append(empty('Nenhum membro encontrado.')); return panel; }
  for (const member of members) {
    const assignedRoles = Array.isArray(member.roles) ? member.roles : [];
    const roleSelect = el('select', { 'aria-label': `Papéis de ${member.displayName}`, multiple: '', size: Math.min(4, Math.max(2, roles.length)) }, roles.map((role) => el('option', { value: role.id, text: role.name, selected: assignedRoles.some((assigned) => assigned.id === role.id) })));
    const allowedStatuses = new Set([member.status]);
    if (tenantCan('tenant.user.update')) { allowedStatuses.add('active'); allowedStatuses.add('suspended'); }
    if (tenantCan('tenant.user.disable')) allowedStatuses.add('disabled');
    const statusSelect = el('select', { 'aria-label': `Status de ${member.displayName}` }, [...allowedStatuses].map((status) => el('option', { value: status, text: statusLabel(status), selected: member.status === status })));
    const controls = el('div', { className: 'member-controls' });
    if (tenantCan('tenant.user.update') || tenantCan('tenant.user.disable')) controls.append(statusSelect, el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Alterar status', onclick: () => updateMemberStatus(tenantId, member, statusSelect.value) }));
    if (tenantCan('tenant.role.manage')) controls.append(roleSelect, el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Salvar papéis', onclick: () => updateMemberRoles(tenantId, member, [...roleSelect.selectedOptions].map((option) => option.value)) }));
    panel.append(el('article', { className: 'member-card' }, [el('div', { className: 'member-head' }, [el('div', {}, [el('h4', { text: member.displayName }), el('p', { text: member.email })]), badge(member.status)]), el('div', { className: 'role-list' }, assignedRoles.map((role) => el('span', { className: 'role-chip', text: role.name }))), controls]));
  }
  return panel;
}

async function updateMemberStatus(tenantId, member, status) {
  if (status === member.status) return;
  const accepted = await confirmAction('Alterar status do membro', `${member.displayName} ficará ${statusLabel(status)}. A continuidade do último proprietário será validada pelo servidor.`, 'Alterar status');
  if (!accepted) return;
  try { await api(`/api/v1/tenants/${tenantId}/members/${member.id}/status`, { method: 'PATCH', body: { status } }); showMessage('Status do membro atualizado.'); await renderTenantConsole(); }
  catch (error) { showMessage(errorText(error), true); await renderTenantConsole(); }
}

async function updateMemberRoles(tenantId, member, roleIds) {
  const accepted = await confirmAction('Substituir papéis do membro', `Os papéis de ${member.displayName} serão substituídos pela seleção atual. O servidor bloqueará escalonamento e remoção do último proprietário.`, 'Substituir papéis');
  if (!accepted) return;
  try { await api(`/api/v1/tenants/${tenantId}/members/${member.id}/roles`, { method: 'PUT', body: { roleIds } }); showMessage('Papéis do membro atualizados.'); await renderTenantConsole(); }
  catch (error) { showMessage(errorText(error), true); await renderTenantConsole(); }
}

function rolePanel(tenantId, roles, canManage) {
  const add = canManage ? el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Novo papel', onclick: () => openRoleDialog(tenantId) }) : null;
  const panel = el('section', { className: 'panel' }, el('div', { className: 'subsection-head' }, [el('div', {}, [el('p', { className: 'kicker', text: 'Autoridade' }), el('h3', { text: 'Papéis' })]), add]));
  if (!roles.length) { panel.append(empty('Nenhum papel disponível.')); return panel; }
  for (const role of roles) {
    const actions = role.isSystem || !canManage ? el('span', { className: 'badge', text: role.isSystem ? 'Sistema' : 'Personalizado' }) : el('div', { className: 'cell-actions' }, [el('button', { className: 'button button-secondary button-small', type: 'button', text: 'Editar', onclick: () => openRoleDialog(tenantId, role) }), el('button', { className: 'button button-small button-danger', type: 'button', text: 'Excluir', onclick: () => deleteRole(tenantId, role) })]);
    panel.append(el('article', { className: 'role-card' }, [el('div', { className: 'role-head' }, [el('div', {}, [el('h4', { text: role.name }), el('p', { text: `${role.code}${role.isSystem ? ' · sistema' : ' · personalizado'}` })]), actions]), permissionList(role.permissions)]));
  }
  return panel;
}

function availablePermissions() {
  return state.actorTenantPermissions.filter((code) => !code.startsWith('platform.')).sort();
}

function openRoleDialog(tenantId, role = null) {
  const dialog = $('#role-dialog'); const form = $('#role-form');
  form.reset(); $('#role-error').textContent = '';
  form.dataset.tenantId = tenantId;
  form.elements.roleId.value = role?.id || '';
  form.elements.code.value = role?.code || '';
  form.elements.code.disabled = Boolean(role);
  form.elements.name.value = role?.name || '';
  $('#role-dialog-title').textContent = role ? 'Editar papel' : 'Novo papel';
  const available = availablePermissions();
  const hiddenPermissions = role ? role.permissions.filter((code) => !available.includes(code)) : [];
  form.dataset.preservePermissions = hiddenPermissions.length ? 'true' : 'false';
  replace($('#role-permissions'), [
    ...(hiddenPermissions.length ? [el('p', { className: 'privacy-note', text: 'Este papel contém permissões fora da sua autoridade efetiva. Elas serão preservadas e a edição ficará limitada ao nome.' })] : []),
    ...available.map((code) => el('label', {}, [el('input', { type: 'checkbox', name: 'permissionCodes', value: code,
      checked: role?.permissions.includes(code), disabled: hiddenPermissions.length > 0 }), el('span', {}, [el('span', { className: 'permission-label', text: permissionLabel(code) }), el('span', { className: 'cell-subtitle', text: code })])])),
  ]);
  dialog.showModal();
}

async function deleteRole(tenantId, role) {
  const accepted = await confirmAction('Excluir papel personalizado', `O papel “${role.name}” será excluído permanentemente. Papéis atribuídos são protegidos pelo servidor.`, 'Excluir papel');
  if (!accepted) return;
  try { await api(`/api/v1/tenants/${tenantId}/roles/${role.id}`, { method: 'DELETE' }); showMessage('Papel excluído.'); await renderTenantConsole(); }
  catch (error) { showMessage(errorText(error), true); }
}

function invitationPanel(tenantId, onCreated) {
  const form = el('form', { className: 'form-card', novalidate: '' }, [el('p', { className: 'kicker', text: 'Acesso inicial' }), el('h3', { text: 'Convidar membro' }), el('p', { text: 'O convite concede apenas o papel Viewer. Papéis adicionais devem ser atribuídos separadamente.' }), el('label', {}, ['E-mail', el('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: '254', required: '' })]), el('button', { className: 'button button-primary', type: 'submit', text: 'Gerar convite' }), el('p', { className: 'form-message error', role: 'alert' })]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const button = $('button', form); const message = $('.form-message', form); message.textContent = ''; setButtonBusy(button, true);
    try {
      const result = await api(`/api/v1/tenants/${tenantId}/invitations`, { method: 'POST', body: { email: form.elements.email.value.trim().toLowerCase() } });
      form.reset(); showInvitationSecret(result.token);
      if (onCreated) await onCreated();
    } catch (error) { message.textContent = errorText(error); }
    finally { setButtonBusy(button, false); }
  });
  return form;
}

function showInvitationSecret(token, title = 'Convite criado') {
  const dialog = $('#secret-dialog');
  const input = $('#invitation-url');
  $('h2', dialog).textContent = title;
  input.value = `${location.origin}/admin?invite=${encodeURIComponent(token)}`;
  $('#copy-status').textContent = '';
  dialog.showModal();
}

function entitlementsPanel(items) {
  const panel = el('section', { className: 'panel' }, [el('p', { className: 'kicker', text: 'Capacidades' }), el('h3', { text: 'Entitlements efetivos' })]);
  if (!items.length) { panel.append(empty('Nenhum recurso disponível.')); return panel; }
  items.forEach((item) => panel.append(el('div', { className: 'entitlement-row' }, [el('div', {}, [el('h4', { text: item.name }), el('p', { text: `${item.code} · origem: ${item.source || 'indisponível'} · plano: ${item.planIncluded ? 'incluído' : 'não incluído'}` }), item.overrideEnabled !== null && item.overrideEnabled !== undefined ? el('p', { text: `Override ${item.overrideEnabled ? 'habilitado' : 'desabilitado'}${item.overrideReason ? `: ${item.overrideReason}` : ''}` }) : null, item.overrideExpiresAt ? el('p', { text: `Expira em ${formatDate(item.overrideExpiresAt)}` }) : null]), badge(item.enabled ? 'active' : 'disabled')])));
  return panel;
}

async function ownerAssignmentPanel(tenantId) {
  const panel = el('form', { className: 'form-card', novalidate: '' }, [el('p', { className: 'kicker', text: 'Operação de plataforma' }), el('h3', { text: 'Atribuir proprietário' }), el('p', { text: 'Selecione explicitamente um usuário ativo. A operação cria ou reativa sua associação e adiciona Tenant Owner.' })]);
  try {
    const users = await ensureUsers();
    const select = el('select', { name: 'userId', required: '' }, [el('option', { value: '', text: 'Selecione um usuário ativo' }), ...users.filter((user) => user.status === 'active').map((user) => el('option', { value: user.id, text: `${user.displayName} · ${user.email}` }))]);
    panel.append(el('label', {}, ['Usuário', select]), el('p', { className: 'field-note', text: 'A seleção mostra no máximo os 100 usuários globais mais recentes.' }), el('button', { className: 'button button-secondary', type: 'submit', text: 'Atribuir como proprietário' }), el('p', { className: 'form-message error', role: 'alert' }));
    panel.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!panel.reportValidity()) return;
      const selected = select.selectedOptions[0];
      const accepted = await confirmAction('Atribuir Tenant Owner', `${selected.textContent} receberá associação ativa e o papel de proprietário nesta organização.`, 'Atribuir proprietário');
      if (!accepted) return;
      const button = $('button', panel); const message = $('.form-message', panel); setButtonBusy(button, true); message.textContent = '';
      try {
        await api(`/api/v1/platform/tenants/${tenantId}/owner`, { method: 'POST', body: { userId: select.value } });
        state.identity = await api('/api/v1/session'); renderIdentity(); renderNavigation();
        showMessage('Proprietário atribuído explicitamente.'); await renderTenantConsole();
      }
      catch (error) { message.textContent = errorText(error); }
      finally { setButtonBusy(button, false); }
    });
  } catch (error) { panel.append(el('p', { className: 'error', text: errorText(error) })); }
  return panel;
}

async function subscriptionPanel(tenantId) {
  const panel = el('form', { className: 'form-card', novalidate: '' }, [el('p', { className: 'kicker', text: 'Assinatura da plataforma' }), el('h3', { text: 'Atribuir plano' }), el('p', { text: 'O estado atual não está disponível neste endpoint. Salvar substitui a atribuição conforme validado pelo servidor.' })]);
  try {
    const plans = (await api('/api/v1/platform/plans?limit=100&offset=0')).items.filter((plan) => plan.status === 'active');
    const plan = el('select', { name: 'planId', required: '' }, [el('option', { value: '', text: 'Selecione um plano ativo' }), ...plans.map((item) => el('option', { value: item.id, text: `${item.name} · ${item.code}` }))]);
    panel.append(
      el('label', {}, ['Plano', plan]),
      el('label', {}, ['Status', el('select', { name: 'status' }, [el('option', { value: 'active', text: 'Ativo' }), el('option', { value: 'trialing', text: 'Em teste' })])]),
      el('label', {}, ['Término (opcional)', el('input', { name: 'endsAt', type: 'datetime-local' })]),
      el('button', { className: 'button button-secondary', type: 'submit', text: 'Atribuir assinatura' }),
      el('p', { className: 'form-message error', role: 'alert' }),
    );
    panel.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!panel.reportValidity()) return;
      const endsAt = panel.elements.endsAt.value;
      const accepted = await confirmAction('Atribuir assinatura', `O plano selecionado será atribuído com status ${statusLabel(panel.elements.status.value)}.`, 'Atribuir assinatura');
      if (!accepted) return;
      const button = $('button[type="submit"]', panel); const message = $('.form-message', panel); message.textContent = ''; setButtonBusy(button, true);
      try { await api(`/api/v1/platform/tenants/${tenantId}/subscription`, { method: 'PUT', body: { planId: plan.value, status: panel.elements.status.value, endsAt: endsAt ? new Date(endsAt).toISOString() : null } }); showMessage('Assinatura atribuída.'); }
      catch (error) { message.textContent = errorText(error); }
      finally { setButtonBusy(button, false); }
    });
  } catch (error) { panel.append(el('p', { className: 'error', text: `Planos indisponíveis. ${errorText(error)}` })); }
  return panel;
}

async function platformEntitlementPanel(tenantId, currentItems = null) {
  const panel = el('form', { className: 'form-card', novalidate: '' }, [el('p', { className: 'kicker', text: 'Override de plataforma' }), el('h3', { text: 'Alterar entitlement' }), el('p', { text: 'O motivo é obrigatório e a expiração, quando informada, deve estar no futuro.' })]);
  try {
    if (!state.features.length && has('platform.feature.read')) state.features = (await api('/api/v1/platform/features?limit=100&offset=0')).items;
    const source = state.features.length ? state.features : (currentItems || []);
    const feature = el('select', { name: 'featureCode', required: '' }, [el('option', { value: '', text: 'Selecione um recurso' }), ...source.map((item) => el('option', { value: item.code, text: `${item.name} · ${item.code}` }))]);
    const enabled = el('input', { name: 'enabled', type: 'checkbox', checked: true });
    panel.append(el('label', {}, ['Recurso', feature]), el('label', { className: 'switch-line' }, [enabled, 'Override habilitado']), el('label', {}, ['Motivo', el('textarea', { name: 'reason', maxlength: '500', rows: '3', required: '' })]), el('label', {}, ['Expira em (opcional)', el('input', { name: 'expiresAt', type: 'datetime-local' })]), el('button', { className: 'button button-secondary', type: 'submit', text: 'Aplicar override' }), el('p', { className: 'form-message error', role: 'alert' }));
    panel.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!panel.reportValidity()) return;
      const expiry = panel.elements.expiresAt.value;
      const body = { enabled: enabled.checked, reason: panel.elements.reason.value.trim(), expiresAt: expiry ? new Date(expiry).toISOString() : null };
      const accepted = await confirmAction('Aplicar override de entitlement', `O recurso ${feature.value} será ${body.enabled ? 'habilitado' : 'desabilitado'} por override.`, 'Aplicar override');
      if (!accepted) return;
      const button = $('button', panel); const message = $('.form-message', panel); setButtonBusy(button, true); message.textContent = '';
      try { await api(`/api/v1/platform/tenants/${tenantId}/entitlements/${encodeURIComponent(feature.value)}`, { method: 'PUT', body }); showMessage('Override de entitlement aplicado.'); await renderTenantConsole(); }
      catch (error) { message.textContent = errorText(error); }
      finally { setButtonBusy(button, false); }
    });
  } catch (error) { panel.append(el('p', { className: 'error', text: errorText(error) })); }
  return panel;
}

function renderNoAccess() {
  pageHeading('VGV Platform', 'Sem áreas disponíveis');
  replace(view, empty('Sua conta está autenticada, mas não possui uma associação ativa nem permissões de plataforma disponíveis.'));
}

function confirmAction(title, message, actionLabel) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-accept').textContent = actionLabel;
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

async function establishApp(identity) {
  state.identity = identity;
  access.hidden = true; app.hidden = false;
  renderIdentity();
  if (state.inviteToken) {
    try {
      await api('/api/v1/invitations/accept-authenticated', { method: 'POST', body: { token: state.inviteToken } });
      clearInviteSecret();
      state.identity = await api('/api/v1/session');
      showMessage('Convite aceito. Sua organização já está disponível.');
    } catch (error) {
      if (!['authentication_required', 'network_error', 'internal_error'].includes(error.code)) clearInviteSecret();
      showMessage(errorText(error), true);
    }
  }
  state.selectedTenantId ||= state.identity.memberships[0]?.tenantId || null;
  const requested = routeFromLocation();
  await loadCapabilities();
  const allowedPlatform = allowedRoutes().some((route) => route.id === requested);
  const initial = MODULE_IDS.has(requested) || requested === 'tenant' || allowedPlatform
    ? requested : (allowedRoutes()[0]?.id || (state.selectedTenantId ? 'tenant' : 'none'));
  await navigate(initial, false);
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#login-error'); message.textContent = ''; $('#login-message').textContent = '';
  if (!form.reportValidity()) return;
  setButtonBusy(button, true, 'Entrando...');
  try {
    const values = new FormData(form);
    const identity = await api('/api/v1/session', { method: 'POST', body: { email: values.get('email').trim().toLowerCase(), password: values.get('password') } });
    form.reset(); await establishApp(identity);
  } catch (error) { message.textContent = errorText(error); }
  finally { setButtonBusy(button, false); }
});

$('#recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#recovery-message');
  message.textContent = '';
  if (!form.reportValidity()) return;
  setButtonBusy(button, true, 'Enviando...');
  try {
    await api('/api/v1/password-recovery', { method: 'POST', body: { email: form.elements.email.value.trim().toLowerCase() } });
  } catch { /* The public result is intentionally identical for every account and delivery outcome. */ }
  form.reset();
  message.textContent = 'Se a conta existir, enviaremos as instruções de redefinição para o e-mail informado.';
  setButtonBusy(button, false);
});

function validNewPassword(password) {
  return password.length >= 14 && password.length <= 256 && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

$('#reset-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#reset-error'); message.textContent = '';
  if (!form.reportValidity()) return;
  if (!validNewPassword(form.elements.newPassword.value)) { message.textContent = 'Use ao menos 14 caracteres, com maiúscula, minúscula, número e símbolo.'; return; }
  if (form.elements.newPassword.value !== form.elements.confirmation.value) { message.textContent = 'A confirmação da nova senha não coincide.'; return; }
  if (!state.resetToken || !/^[A-Za-z0-9_-]{43}$/.test(state.resetToken)) { message.textContent = errorMessages.password_reset_invalid; return; }
  setButtonBusy(button, true);
  try {
    await api('/api/v1/password-recovery/confirm', { method: 'POST', body: { token: state.resetToken, newPassword: form.elements.newPassword.value } });
    form.reset();
    state.resetToken = null;
    history.replaceState(null, '', '/admin');
    showLogin();
    $('#login-message').textContent = 'Senha atualizada. Entre com sua nova credencial.';
  } catch (error) { message.textContent = errorText(error); }
  finally { setButtonBusy(button, false); }
});

$('#invite-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#invite-error'); message.textContent = '';
  if (!state.inviteToken) { message.textContent = 'O token de convite não está disponível.'; return; }
  if (!form.reportValidity()) return;
  if (!validNewPassword(form.elements.password.value)) { message.textContent = 'Use ao menos 14 caracteres, com maiúscula, minúscula, número e símbolo.'; return; }
  if (form.elements.password.value !== form.elements.confirmation.value) { message.textContent = 'A confirmação da senha não coincide.'; return; }
  setButtonBusy(button, true, 'Ativando...');
  try {
    await api('/api/v1/invitations/accept', { method: 'POST', body: { token: state.inviteToken, displayName: form.elements.displayName.value.trim(), password: form.elements.password.value } });
    clearInviteSecret(); form.reset(); form.hidden = true; $('#invite-result').hidden = false;
  } catch (error) {
    if (error.code === 'login_required') { message.textContent = errorText(error); setTimeout(showLogin, 900); }
    else message.textContent = errorText(error);
  } finally { setButtonBusy(button, false); }
});

$('#role-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#role-error'); message.textContent = '';
  if (!form.reportValidity()) return;
  const permissionCodes = [...form.querySelectorAll('[name="permissionCodes"]:checked')].map((input) => input.value);
  const roleId = form.elements.roleId.value;
  const body = roleId ? { name: form.elements.name.value.trim(), ...(form.dataset.preservePermissions === 'true' ? {} : { permissionCodes }) }
    : { code: form.elements.code.value.trim(), name: form.elements.name.value.trim(), permissionCodes };
  setButtonBusy(button, true);
  try {
    const path = roleId ? `/api/v1/tenants/${form.dataset.tenantId}/roles/${roleId}` : `/api/v1/tenants/${form.dataset.tenantId}/roles`;
    await api(path, { method: roleId ? 'PATCH' : 'POST', body });
    $('#role-dialog').close(); showMessage(roleId ? 'Papel atualizado.' : 'Papel criado.'); await renderTenantConsole();
  } catch (error) { message.textContent = errorText(error); }
  finally { setButtonBusy(button, false); }
});

$('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = $('button[type="submit"]', form); const message = $('#password-error'); message.textContent = '';
  if (!form.reportValidity()) return;
  if (!validNewPassword(form.elements.newPassword.value)) { message.textContent = 'Use ao menos 14 caracteres, com maiúscula, minúscula, número e símbolo.'; return; }
  if (form.elements.newPassword.value !== form.elements.confirmation.value) { message.textContent = 'A confirmação da nova senha não coincide.'; return; }
  setButtonBusy(button, true);
  try {
    state.identity = await api('/api/v1/account/password', { method: 'POST', body: { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value } });
    form.reset(); $('#password-dialog').close(); renderIdentity(); showMessage('Senha alterada. As demais sessões foram revogadas.');
  } catch (error) { message.textContent = errorText(error); }
  finally { setButtonBusy(button, false); }
});

$('#logout').addEventListener('click', async () => {
  const accepted = await confirmAction('Encerrar sessão', 'A sessão nomeada neste navegador será revogada.', 'Encerrar sessão');
  if (!accepted) return;
  try { await api('/api/v1/session', { method: 'DELETE' }); } catch { /* Clear the local view even if the server is unavailable. */ }
  state.identity = null; state.capabilities = null; app.hidden = true; access.hidden = false;
  history.replaceState(null, '', '/admin'); showLogin();
});

$('#account-menu').addEventListener('click', () => {
  const popover = $('#account-popover'); popover.hidden = !popover.hidden; $('#account-menu').setAttribute('aria-expanded', String(!popover.hidden));
});
$('#change-password').addEventListener('click', () => { $('#account-popover').hidden = true; $('#account-menu').setAttribute('aria-expanded', 'false'); $('#password-error').textContent = ''; $('#password-dialog').showModal(); });
$('#mobile-nav').addEventListener('click', () => { const sidebar = $('.sidebar'); sidebar.classList.toggle('open'); $('#mobile-nav').setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); });
$('#forgot-password').addEventListener('click', showRecovery);
document.querySelectorAll('.back-to-login').forEach((button) => button.addEventListener('click', () => {
  if (state.resetToken || location.pathname.replace(/\/+$/, '') === '/admin/reset-password') leaveReset();
  else showLogin();
}));
$('#invite-login').addEventListener('click', showLogin);
$('#continue-login').addEventListener('click', showLogin);
document.querySelectorAll('.dialog-close').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));

$('#copy-invitation').addEventListener('click', async () => {
  const input = $('#invitation-url');
  try { await navigator.clipboard.writeText(input.value); $('#copy-status').textContent = 'Link copiado. Transfira-o com segurança.'; }
  catch { input.select(); $('#copy-status').textContent = 'Selecione e copie o link manualmente.'; }
});
$('#secret-dialog').addEventListener('close', () => { $('#invitation-url').value = ''; $('#copy-status').textContent = ''; });

async function bootstrap() {
  if (location.pathname.replace(/\/+$/, '') === '/admin/reset-password') {
    access.hidden = false; app.hidden = true; showReset();
    if (!state.resetToken || !/^[A-Za-z0-9_-]{43}$/.test(state.resetToken)) $('#reset-error').textContent = errorMessages.password_reset_invalid;
    return;
  }
  if (state.inviteToken && (state.inviteToken.length < 20 || state.inviteToken.length > 256)) {
    clearInviteSecret(); $('#login-error').textContent = 'O link de convite é inválido.';
  }
  try {
    const identity = await api('/api/v1/session');
    await establishApp(identity);
  } catch (error) {
    access.hidden = false; app.hidden = true;
    if (state.inviteToken) showInvitation(); else showLogin();
    if (error.code !== 'authentication_required' && error.code !== 'network_error') $('#login-error').textContent = errorText(error);
  }
}

window.addEventListener('popstate', async () => {
  if (state.identity) {
    const previousTenantId = state.selectedTenantId;
    const route = routeFromLocation();
    if (state.selectedTenantId !== previousTenantId) await loadCapabilities();
    await navigate(route, false);
    return;
  }
  if (location.pathname.replace(/\/+$/, '') === '/admin/reset-password') {
    state.resetToken = new URLSearchParams(location.search).get('token');
    showReset();
    if (!state.resetToken || !/^[A-Za-z0-9_-]{43}$/.test(state.resetToken)) $('#reset-error').textContent = errorMessages.password_reset_invalid;
  } else {
    state.resetToken = null;
    showLogin();
  }
});

bootstrap();
