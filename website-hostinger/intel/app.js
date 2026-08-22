import { renderPropertyMarketComparison, renderPropertyMarketComparisonError, renderPropertyMarketComparisonLoading } from '/shared/property-market-comparison.js?v=20260821-6';
import '/shared/vgv-command.js?v=20260821-6';
if(window.self!==window.top)document.documentElement.classList.add('embedded');

const API = 'https://permuta-api.vgventures.com.br';
const parameters = new URLSearchParams(location.search);
const state = { section: 'properties', selectedProperty: null, selectedVehicle: null, tenantId: parameters.get('tenantId'), permissions:new Set() };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
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

async function api(path, options = {}) {
  let response;
  const tenantPath=state.tenantId?(path.startsWith('/api/v1/market/finder/')?path.replace('/api/v1/market/finder/',`/api/v1/tenants/${encodeURIComponent(state.tenantId)}/finder/`):path.startsWith('/api/v1/market/')?path.replace('/api/v1/market/',`/api/v1/tenants/${encodeURIComponent(state.tenantId)}/intelligence/`):path):path;
  try {
    response = await fetch(`${API}${tenantPath}`, {
      method: options.method || 'GET', credentials: 'include',
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error('Não foi possível conectar ao serviço.');
  }
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const value = data?.error;
    const code = typeof value === 'string' ? value : value?.code;
    const message = typeof value === 'object' ? value?.message : null;
    if (response.status === 401) throw new Error('Sessão expirada. Entre novamente.');
    throw new Error(message || ({ invalid_credentials: 'Senha inválida.', origin_not_allowed: 'Esta origem não está autorizada.', validation_failed: 'Revise os campos informados.' }[code]) || `A solicitação falhou (${response.status}).`);
  }
  return data;
}

const money = (value) => value === null || value === undefined ? 'Desconhecido' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value));
const formatDate = (value) => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Desconhecido'; };
const display = (value) => value === null || value === undefined || value === '' ? 'Desconhecido' : String(value);
const triState = (value) => value === true ? 'Sim' : value === false ? 'Não' : 'Desconhecido';
const assertionLabel = (value) => ({ reported: 'Relatado', inferred: 'Inferido', verified: 'Verificado' }[value] || 'Desconhecido');
const warningLabel = (value) => ({ subject_armoring_unknown: 'Blindagem do veículo principal desconhecida.', candidate_armoring_unknown: 'Blindagem deste comparável desconhecida.', unknown_armoring_candidates_penalized: 'Comparáveis sem informação de blindagem receberam penalização.' }[value] || String(value).replaceAll('_', ' '));
const propertyTypeLabel = (value) => ({ house: 'Casa', apartment: 'Apartamento', land: 'Terreno', commercial: 'Comercial', other: 'Imóvel' }[value] || 'Imóvel');

function safeHttpUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function externalLink(url, label) {
  const safe = safeHttpUrl(url);
  return safe ? el('a', { className: 'source-link', href: safe, target: '_blank', rel: 'noopener noreferrer', text: label }) : el('span', { text: 'Referência inválida ou indisponível' });
}
function internalLink(url,label){
  const parsed=new URL(url,location.origin),module=parsed.pathname.startsWith('/finder/')?'finder':parsed.pathname.startsWith('/exchange/')?'exchange':null;
  if(state.tenantId&&module){parsed.searchParams.set('tenant',state.tenantId);return el('a',{className:'source-link',href:`/admin/${module}?${parsed.searchParams}`,target:'_top',text:label});}
  return el('a',{className:'source-link',href:url,text:label});
}

function notify(message, isError = false) {
  const box = $('#notice'); box.textContent = message; box.classList.toggle('is-error', isError); box.hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { box.hidden = true; }, 7000);
}

function setBusy(button, busy, label) {
  if (busy) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

async function boot() {
  if(!state.tenantId){window.location.replace('/admin/intelligence');return;}
  try {
    const session=await api('/api/v1/session');
    if(!session.authenticated||!session.memberships?.some((item)=>item.tenantId===state.tenantId))throw new Error('Sua sessão não possui acesso a esta organização.');
    const capabilities=await api(`/api/v1/tenants/${encodeURIComponent(state.tenantId)}/capabilities`);
    state.permissions=new Set(capabilities.permissions||[]);if(!state.permissions.has('intelligence.module.access'))throw new Error('VGVintel não está habilitado para esta organização.');
    return showApp();
  } catch(error) {
    $('#login-error').textContent=error.message;
    $('#login').hidden=false;
  }
}

async function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#logout').hidden=window.self!==window.top;
  $('#toggle-import').hidden=!state.permissions.has('market.data.manage');
  const observed = $('#vehicle-import-form').elements.observedAt;
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); observed.value = now.toISOString().slice(0, 16);
  await searchProperties();
  const propertyId = parameters.get('propertyId');
  if (propertyId && /^[0-9a-f-]{36}$/i.test(propertyId)) await loadProperty(propertyId);
}

$('#logout').addEventListener('click',()=>window.top.location.assign('/admin/'));

$$('.section-tab').forEach((button) => button.addEventListener('click', async () => {
  state.section = button.dataset.section;
  $$('.section-tab').forEach((item) => { const active = item === button; item.classList.toggle('active', active); if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
  $$('.section-view').forEach((section) => { section.hidden = section.id !== `section-${state.section}`; });
  if (state.section === 'vehicles' && !$('#vehicle-results').children.length) await searchVehicles();
  $('#main-content').focus({ preventScroll: true });
}));

function propertyTitle(item) {
  return [item.development, item.city, item.region].filter(Boolean).join(' · ') || item.name || item.propertyType || 'Imóvel';
}

$('#property-search-form').addEventListener('submit', (event) => { event.preventDefault(); searchProperties(); });
async function searchProperties() {
  const form = $('#property-search-form'); const button = $('button', form); const query = form.elements.query.value.trim();
  if (query.length > 200) return notify('A busca aceita no máximo 200 caracteres.', true);
  setBusy(button, true, 'Buscando...'); replace($('#property-results'), el('div', { className: 'loading', text: 'Consultando imóveis...' }));
  try {
    const data = await api('/api/v1/market/finder/search',{method:'POST',body:{...(query?{text:query}:{criteria:{}}),offset:0,limit:Number(form.elements.limit.value)}}),items=data.items.map((row)=>row.item);
    $('#property-count').textContent = `${data.resultCount??items.length} resultado(s) via VGVfinder`;
      replace($('#property-results'), items.length ? items.map((item) => el('button', { className: `result-card${state.selectedProperty === item.propertyId ? ' selected' : ''}`, type: 'button', onclick: () => loadProperty(item.propertyId) }, [el('div', {}, [el('strong', { text: propertyTitle(item) }), el('small', { text: `${propertyTypeLabel(item.propertyType)} · ${item.area == null ? 'área desconhecida' : `${item.area} m²`}` })]), el('span', { text: '→', 'aria-hidden': 'true' })])) : el('div', { className: 'empty-state', text: 'Nenhum imóvel encontrado.' }));
  } catch (error) { replace($('#property-results'), el('div', { className: 'empty-state error', text: error.message })); }
  finally { setBusy(button, false); }
}

async function loadProperty(id) {
  state.selectedProperty = id; $$('.result-card', $('#property-results')).forEach((card) => card.classList.remove('selected'));
  replace($('#property-detail'), el('div', { className: 'loading', text: 'Lendo fontes e evidências...' }));
  try {
    const [item, comparison] = await Promise.all([
      api(`/api/v1/market/properties/${encodeURIComponent(id)}`),
      api(`/api/v1/market/properties/${encodeURIComponent(id)}/comparison?asOf=${encodeURIComponent(new Date().toISOString())}`).catch((error) => ({ comparisonError: error })),
    ]);
    if (state.selectedProperty !== id) return;
    renderProperty(item);
    const finderActions=el('div',{className:'comparable-controls'},[
      internalLink(`/finder/?similarTo=${encodeURIComponent(id)}`,'Buscar imóveis semelhantes'),
      internalLink(`/finder/?q=${encodeURIComponent(`oportunidades no ${item.developmentName||item.development||item.regionName||item.region||item.cityName||item.city}`)}`,'Ver oportunidades deste condomínio'),
      internalLink(`/exchange/?subjectPropertyId=${encodeURIComponent(id)}`,'Analisar no VGVexchange'),
    ]);
    $('#property-detail').append(finderActions);
    const target = el('div', { className: 'property-market-comparison' });
    $('#property-detail').append(target);
    renderPropertyMarketComparisonLoading(target);
    if (comparison.comparisonError) renderPropertyMarketComparisonError(target);
    else renderPropertyMarketComparison(target, comparison);
  }
  catch (error) { replace($('#property-detail'), el('div', { className: 'empty-state error', text: error.message })); }
}

function fact(label, value) { return el('div', { className: 'fact' }, [el('span', { text: label }), el('strong', { text: display(value) })]); }
function evidenceStatus(status) { return el('span', { className: `status-chip status-${status || 'unknown'}`, text: assertionLabel(status) }); }

function renderProperty(item) {
  const listings = Array.isArray(item.listings) ? item.listings : []; const observations = Array.isArray(item.observations) ? item.observations : [];
  const latestFurnishing = observations.find((entry) => entry.furnishingStatus); const latestOccupancy = observations.find((entry) => entry.occupancyStatus);
  const evidenceCards = [];
  for (const [label, observation, key] of [['Mobília', latestFurnishing, 'furnishingStatus'], ['Ocupação', latestOccupancy, 'occupancyStatus']]) {
    evidenceCards.push(observation ? el('article', { className: 'evidence-card' }, [el('div', { className: 'evidence-card-head' }, [el('h4', { text: `${label}: ${display(observation[key])}` }), evidenceStatus(observation.assertionStatus)]), el('p', { text: observation.rawEvidence || 'Sem texto de evidência.' }), el('small', { text: `Observado em ${formatDate(observation.observedAt)}` }), observation.sourceReference ? externalLink(observation.sourceReference, 'Abrir referência da evidência') : null]) : el('div', { className: 'unknown-note', text: `${label}: Desconhecido. Nenhuma evidência foi registrada.` }));
  }
  const sourceCards = listings.map((listing) => {
    const references = (Array.isArray(listing.imageUrls) ? listing.imageUrls : []).map((url, index) => { const safe = safeHttpUrl(url); return safe ? el('a', { href: safe, target: '_blank', rel: 'noopener noreferrer', text: `Imagem ${index + 1}` }) : null; }).filter(Boolean);
    return el('article', { className: 'source-card' }, [el('div', { className: 'source-card-head' }, [el('h4', { text: listing.sourceName || 'Fonte desconhecida' }), el('strong', { text: money(listing.askingPrice) })]), el('p', { text: listing.title || 'Anúncio sem título' }), el('small', { text: `Última observação: ${formatDate(listing.lastSeenAt)}` }), listing.canonicalUrl ? externalLink(listing.canonicalUrl, 'Abrir anúncio de origem') : null, references.length ? el('div', { className: 'reference-list', 'aria-label': 'Referências de imagem' }, references) : el('p', { text: 'Sem referências de imagem.' })]);
  });
  replace($('#property-detail'), [el('div', { className: 'detail-head' }, [el('div', {}, [el('p', { className: 'eyebrow', text: propertyTypeLabel(item.propertyType) }), el('h2', { text: propertyTitle(item) }), el('p', { text: [item.regionName || item.region, item.cityName || item.city].filter(Boolean).join(' · ') || 'Localização desconhecida' })]), el('span', { className: 'id-chip', text: item.propertyId || item.id })]), el('div', { className: 'facts' }, [fact('Área', item.areaM2 == null ? null : `${item.areaM2} m²`), fact('Dormitórios', item.bedrooms), fact('Suítes', item.suites), fact('Banheiros', item.bathrooms), fact('Vagas', item.parkingSpaces), fact('Ano', item.constructionYear)]), el('section', { className: 'subsection' }, [el('h3', { text: 'Mobília e ocupação' }), ...evidenceCards]), el('section', { className: 'subsection' }, [el('h3', { text: `Anúncios e imagens (${listings.length})` }), ...(sourceCards.length ? sourceCards : [el('div', { className: 'unknown-note', text: 'Nenhum anúncio ou referência de imagem disponível.' })])])]);
}

$('#vehicle-search-form').addEventListener('submit', (event) => { event.preventDefault(); searchVehicles(); });
async function searchVehicles() {
  const form = $('#vehicle-search-form'); const button = $('button', form); const query = form.elements.query.value.trim();
  if (query.length > 200) return notify('A busca aceita no máximo 200 caracteres.', true);
  setBusy(button, true, 'Buscando...'); replace($('#vehicle-results'), el('div', { className: 'loading', text: 'Consultando veículos...' }));
  try {
    const data = await api(`/api/v1/market/vehicles?query=${encodeURIComponent(query)}&limit=${form.elements.limit.value}`);
    $('#vehicle-count').textContent = `${data.items.length} resultado(s) nesta consulta limitada`;
    replace($('#vehicle-results'), data.items.length ? data.items.map((item) => el('button', { className: `result-card${state.selectedVehicle === item.vehicleId ? ' selected' : ''}`, type: 'button', onclick: () => loadVehicle(item.vehicleId) }, [el('div', {}, [el('strong', { text: [item.make, item.model, item.version].filter(Boolean).join(' ') }), el('small', { text: `${display(item.manufactureYear)}/${display(item.modelYear)} · ${item.mileageKm == null ? 'km desconhecido' : `${Number(item.mileageKm).toLocaleString('pt-BR')} km`}` })]), el('span', { text: money(item.listing?.askingPrice) })])) : el('div', { className: 'empty-state', text: 'Nenhum veículo encontrado.' }));
  } catch (error) { replace($('#vehicle-results'), el('div', { className: 'empty-state error', text: error.message })); }
  finally { setBusy(button, false); }
}

async function loadVehicle(id) {
  state.selectedVehicle = id; replace($('#vehicle-detail'), el('div', { className: 'loading', text: 'Lendo veículo e evidências...' }));
  try { const vehicle = await api(`/api/v1/market/vehicles/${encodeURIComponent(id)}`); renderVehicle(vehicle); await loadComparables(id, false); }
  catch (error) { replace($('#vehicle-detail'), el('div', { className: 'empty-state error', text: error.message })); }
}

function renderVehicle(item) {
  const observations = Array.isArray(item.observations) ? item.observations : [];
  const observationNodes = observations.map((entry) => el('article', { className: 'evidence-card' }, [el('div', { className: 'evidence-card-head' }, [el('h4', { text: `${display(entry.factKey)}: ${typeof entry.value === 'boolean' ? triState(entry.value) : display(entry.value)}` }), evidenceStatus(entry.assertionStatus)]), el('p', { text: entry.rawEvidence || 'Sem texto complementar.' }), el('small', { text: formatDate(entry.observedAt) }), entry.sourceReference ? externalLink(entry.sourceReference, 'Abrir referência') : null]));
  const button = el('button', { className: 'button primary', type: 'button', text: 'Gerar comparáveis', hidden:!state.permissions.has('market.data.manage'), onclick: () => generateComparables(item.vehicleId, button) });
  replace($('#vehicle-detail'), [el('div', { className: 'detail-head' }, [el('div', {}, [el('p', { className: 'eyebrow', text: 'Veículo' }), el('h2', { text: [item.make, item.model, item.version].filter(Boolean).join(' ') }), el('p', { text: item.listing ? `${item.listing.sourceName} · ${money(item.listing.askingPrice)} · ${formatDate(item.listing.lastSeenAt)}` : 'Sem anúncio ativo' })]), el('span', { className: 'id-chip', text: item.vehicleId })]), el('div', { className: 'facts' }, [fact('Fabricação / modelo', `${display(item.manufactureYear)} / ${display(item.modelYear)}`), fact('Quilometragem', item.mileageKm == null ? null : `${Number(item.mileageKm).toLocaleString('pt-BR')} km`), fact('Blindagem', triState(item.armored)), fact('Leilão', triState(item.auctionHistory)), fact('Sinistro', triState(item.sinisterHistory)), fact('Teto solar', triState(item.sunroof)), fact('Revisões concessionária', triState(item.dealershipServiceHistory)), fact('Chave reserva', triState(item.spareKey)), fact('Preço', item.listing ? money(item.listing.askingPrice) : null)]), item.listing?.canonicalUrl ? externalLink(item.listing.canonicalUrl, 'Abrir anúncio de origem') : null, el('section', { className: 'subsection' }, [el('div', { className: 'comparable-controls' }, [el('div', {}, [el('h3', { text: 'Comparáveis' }), el('span', { text: 'Conjunto persistido e ordenado pelo serviço.' })]), button]), el('div', { id: 'vehicle-comparables', className: 'loading', text: 'Consultando último conjunto...' })]), el('section', { className: 'subsection' }, [el('h3', { text: `Histórico de evidência (${observations.length})` }), ...(observationNodes.length ? observationNodes : [el('div', { className: 'unknown-note', text: 'Nenhuma observação histórica disponível.' })])])]);
}

async function loadComparables(id, reportError = true) {
  const target = $('#vehicle-comparables'); if (!target) return;
  try { renderComparables(await api(`/api/v1/market/vehicles/${encodeURIComponent(id)}/comparables`)); }
  catch (error) { replace(target, el('div', { className: 'unknown-note', text: reportError ? error.message : 'Nenhum conjunto persistido. Gere comparáveis para este veículo.' })); }
}

async function generateComparables(id, button) {
  setBusy(button, true, 'Gerando...');
  try { const set = await api(`/api/v1/market/vehicles/${encodeURIComponent(id)}/comparables`, { method: 'POST', body: { asOfAt: new Date().toISOString() } }); renderComparables(set); notify('Conjunto de comparáveis gerado e persistido.'); }
  catch (error) { notify(error.message, true); }
  finally { setBusy(button, false); }
}

function renderComparables(set) {
  const target = $('#vehicle-comparables'); if (!target) return; const comparables = (Array.isArray(set.comparables) ? set.comparables : []).slice(0, 10).map((item) => ({ ...item, vehicleId: `${[item.make, item.model, item.version].filter(Boolean).join(' ') || 'Veículo sem identificação'} · Ano ${display(item.manufactureYear)}/${display(item.modelYear)} · ${item.mileageKm == null ? 'km Desconhecido' : `${Number(item.mileageKm).toLocaleString('pt-BR')} km`} · Blindagem ${triState(item.armored)} · Leilão ${triState(item.auctionHistory)} · Sinistro ${triState(item.sinisterHistory)} · Teto solar ${triState(item.sunroof)} · Revisões em concessionária ${triState(item.dealershipServiceHistory)} · Chave reserva ${triState(item.spareKey)} · Observado ${formatDate(item.observedAt)}` }));
  replace(target, [el('p', { text: `${set.actualCount ?? comparables.length} comparável(is) · confiança ${display(set.confidenceScore)}/100 · ${set.status === 'ready' ? 'pronto' : 'evidência insuficiente'}` }), el('div', { className: 'market-range' }, [fact('Mercado baixo', money(set.estimatedMarketValueLow)), fact('Mediana', money(set.estimatedMarketValueMid)), fact('Mercado alto', money(set.estimatedMarketValueHigh))]), set.warnings?.length ? el('ul', { className: 'warning-list' }, set.warnings.map((warning) => el('li', { text: warningLabel(warning) }))) : null, comparables.length ? el('ol', { className: 'comparable-list' }, comparables.map((item) => el('li', {}, [el('strong', { text: `#${item.rank}` }), el('div', {}, [el('strong', { text: item.vehicleId }), el('small', { text: `Similaridade ${item.similarityScore}/100${item.warnings?.length ? ` · ${item.warnings.map(warningLabel).join(' ')}` : ''}` })]), el('strong', { text: money(item.askingPrice) })]))) : el('div', { className: 'unknown-note', text: 'Não há membros comparáveis para este ativo.' })]);
}

$('#toggle-import').addEventListener('click', (event) => {
  const panel = $('#vehicle-import-panel'); panel.hidden = !panel.hidden; event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) $('#vehicle-import-form').elements.externalListingId.focus();
});

function optionalInteger(form, name) { const value = form.elements[name].value; return value === '' ? null : Number(value); }
function optionalBoolean(form, name) { const value = form.elements[name].value; return value === '' ? null : value === 'true'; }

$('#vehicle-import-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = $('button[type="submit"]', form); const error = $('#vehicle-import-error'); error.textContent = '';
  if (!form.reportValidity()) return;
  const sourceUrl = safeHttpUrl(form.elements.url.value); const canonicalUrl = safeHttpUrl(form.elements.canonicalUrl.value); const reference = form.elements.sourceReference.value ? safeHttpUrl(form.elements.sourceReference.value) : canonicalUrl;
  if (!sourceUrl || !canonicalUrl) { error.textContent = 'Informe URLs HTTP(S) válidas, sem credenciais.'; return; }
  if (!/(^|\.)webmotors\.com\.br$/i.test(new URL(sourceUrl).hostname) || !/(^|\.)webmotors\.com\.br$/i.test(new URL(canonicalUrl).hostname)) { error.textContent = 'As URLs de origem e canônica devem pertencer à Webmotors.'; return; }
  if (form.elements.sourceReference.value && !reference) { error.textContent = 'A referência da evidência deve ser uma URL HTTP(S) válida.'; return; }
  const observedDate = new Date(form.elements.observedAt.value); if (!Number.isFinite(observedDate.getTime())) { error.textContent = 'Informe uma data de observação válida.'; return; }
  const payload = { make: form.elements.make.value.trim(), model: form.elements.model.value.trim(), version: form.elements.version.value.trim() || null, manufactureYear: optionalInteger(form, 'manufactureYear'), modelYear: optionalInteger(form, 'modelYear'), mileageKm: optionalInteger(form, 'mileageKm'), listing: { source: { name: 'Webmotors' }, externalListingId: form.elements.externalListingId.value.trim(), url: sourceUrl, canonicalUrl, askingPrice: Number(form.elements.askingPrice.value), currency: 'BRL', rawPayload: { evidenceChannel: 'reviewed_manual_webmotors' } }, evidence: { observedAt: observedDate.toISOString(), assertionStatus: form.elements.assertionStatus.value, sourceReference: reference, rawEvidence: form.elements.rawEvidence.value.trim(), reviewedBy: form.elements.reviewedBy.value.trim(), metadata: { collectionMode: 'manual_review', automaticCollection: false } } };
  for (const name of ['armored', 'auctionHistory', 'sinisterHistory', 'sunroof', 'dealershipServiceHistory', 'spareKey']) payload[name] = optionalBoolean(form, name);
  if (!payload.make || !payload.model || !payload.evidence.reviewedBy || !payload.evidence.rawEvidence) { error.textContent = 'Preencha marca, modelo, responsável e texto da evidência.'; return; }
  setBusy(button, true, 'Registrando...');
  try { const result = await api('/api/v1/market/vehicles', { method: 'POST', body: payload }); notify(`Evidência ${result.outcome === 'created' ? 'criada' : result.outcome === 'updated' ? 'atualizada' : 'já estava atualizada'}. Agora é possível gerar comparáveis.`); state.section = 'vehicles'; await searchVehicles(); await loadVehicle(result.vehicleId); }
  catch (caught) { error.textContent = caught.message; }
  finally { setBusy(button, false); }
});

boot();
