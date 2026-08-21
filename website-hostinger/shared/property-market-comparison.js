const IMAGE_HOSTS = new Set(['imgbr.imovelwebcdn.com', 'si9dados3.com.br']);
let instanceCount = 0;

const money = (value) => finite(value) === null ? 'Não informado' : new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(finite(value));
const moneyPerM2 = (value) => finite(value) === null ? 'Não informado' : `${money(value)}/m²`;
const number = (value) => finite(value) === null ? 'Não informado' : new Intl.NumberFormat('pt-BR').format(finite(value));

function finite(value) {
  const parsed = Number(value);
  return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function safeImageUrl(value) {
  const safe = safeHttpsUrl(value);
  return safe && IMAGE_HOSTS.has(new URL(safe).hostname.toLowerCase()) ? safe : null;
}

function firstImage(item) {
  const candidates = [
    item?.imageUrl,
    ...(Array.isArray(item?.imageUrls) ? item.imageUrls : []),
    ...(Array.isArray(item?.images) ? item.images.map((image) => typeof image === 'string' ? image : image?.url) : []),
    ...(Array.isArray(item?.listing?.imageUrls) ? item.listing.imageUrls : []),
  ];
  return candidates.map(safeImageUrl).find(Boolean) || null;
}

function imageNode(item) {
  const frame = node('div', 'pmc-media');
  const fallback = () => {
    frame.replaceChildren(node('span', 'pmc-image-fallback', 'Imagem não disponível'));
  };
  const source = firstImage(item);
  if (!source) {
    fallback();
    return frame;
  }
  const image = node('img');
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', fallback, { once: true });
  frame.append(image);
  return frame;
}

function itemId(item) {
  return String(item?.propertyId ?? item?.id ?? item?.listingId ?? '');
}

function selectedComparables(data) {
  const comparables = Array.isArray(data.comparables) ? data.comparables : [];
  const selection = data.selection;
  const selected = Array.isArray(selection) ? selection :
    selection?.comparableIds ?? selection?.selectedComparableIds ?? selection?.selected ?? [];
  if (!Array.isArray(selected) || !selected.length) return comparables.slice(0, 3);
  if (selected.every((item) => item && typeof item === 'object')) return selected.slice(0, 3);
  const ids = selected.map((item) => typeof item === 'object' ? itemId(item) : String(item));
  return ids.map((id) => comparables.find((item) => itemId(item) === id)).filter(Boolean).slice(0, 3);
}

function itemTitle(item, fallback) {
  return item?.label ?? item?.title ?? item?.development ?? item?.name ?? fallback;
}

function itemValue(item, key) {
  const listing = item?.listing ?? {};
  const aliases = {
    askingPrice: [item?.askingPrice, item?.price, listing.askingPrice],
    askingPricePerM2: [item?.askingPricePerM2, item?.pricePerM2, listing.askingPricePerM2],
    areaM2: [item?.areaM2, item?.area, item?.privateAreaM2, item?.builtAreaM2],
    parkingSpaces: [item?.parkingSpaces, item?.parking],
  };
  return aliases[key]?.find((value) => value !== null && value !== undefined) ?? item?.[key];
}

function dateLabel(value) {
  if (!value) return 'Não informado';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date) : 'Não informado';
}

function detail(label, value) {
  const wrapper = node('div', 'pmc-fact');
  wrapper.append(node('dt', '', label), node('dd', '', value));
  return wrapper;
}

function priceHistory(item) {
  const history = item?.priceHistory ?? item?.listing?.priceHistory;
  const entries = Array.isArray(history) ? history.slice(0, 4) : [];
  const section = node('div', 'pmc-history');
  section.append(node('strong', '', 'Histórico de preço'));
  if (!entries.length) {
    section.append(node('span', '', 'Sem alterações registradas'));
    return section;
  }
  const list = node('ol');
  entries.forEach((entry) => {
    const row = node('li');
    row.append(node('time', '', dateLabel(entry.capturedAt ?? entry.observedAt ?? entry.date ?? entry.at)), node('span', '', money(entry.askingPrice ?? entry.price ?? entry.value)));
    list.append(row);
  });
  section.append(list);
  return section;
}

function propertyCard(item, subject, index) {
  const article = node('article', `pmc-property${subject ? ' pmc-subject' : ''}`);
  const header = node('div', 'pmc-property-head');
  const identity = node('div');
  identity.append(node('span', 'pmc-column-label', subject ? 'Imóvel analisado' : `Comparável ${index}`), node('h4', '', itemTitle(item, subject ? 'Imóvel analisado' : `Comparável ${index}`)));
  const active = item?.active === true || item?.isActive === true || item?.status === 'active' || item?.listing?.active === true || item?.listing?.isActive === true;
  header.append(identity, node('span', `pmc-status ${active ? 'is-active' : 'is-history'}`, active ? '● Ativo' : '○ Histórico'));

  const price = node('div', 'pmc-card-price');
  price.append(node('strong', '', money(itemValue(item, 'askingPrice'))), node('span', '', moneyPerM2(itemValue(item, 'askingPricePerM2'))));
  const facts = node('dl', 'pmc-card-facts');
  [
    ['Área', finite(itemValue(item, 'areaM2')) === null ? 'Não informada' : `${number(itemValue(item, 'areaM2'))} m²`],
    ['Dormitórios', number(item?.bedrooms)], ['Suítes', number(item?.suites)],
    ['Banheiros', number(item?.bathrooms)], ['Vagas', number(itemValue(item, 'parkingSpaces'))],
  ].forEach(([label, value]) => facts.append(detail(label, value)));

  const listing = item?.listing ?? {};
  const source = item?.source?.name ?? item?.sourceName ?? listing.source?.name ?? listing.sourceName ?? 'Fonte não informada';
  const firstSeen = item?.firstSeenAt ?? listing.firstSeenAt;
  const days = finite(item?.daysOnMarket ?? listing.daysOnMarket);
  const provenance = node('p', 'pmc-provenance');
  provenance.textContent = `Fonte: ${source} · Primeira captura: ${dateLabel(firstSeen)}${days === null ? '' : ` · ${number(days)} dias no mercado`}`;
  const linkUrl = safeHttpsUrl(item?.sourceUrl ?? item?.canonicalUrl ?? item?.url ?? listing.sourceUrl ?? listing.canonicalUrl ?? listing.url);
  const link = linkUrl ? node('a', 'pmc-source-link', 'Abrir anúncio de origem ↗') : node('span', 'pmc-source-missing', 'Link de origem indisponível');
  if (linkUrl) {
    link.href = linkUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  article.append(imageNode(item), header, price, facts, provenance, link, priceHistory(item));
  return article;
}

function subjectPosition(benchmark, key, range, subjectValue) {
  const supplied = benchmark?.subjectPosition?.[key] ?? (key === 'askingPricePerM2' ? benchmark?.subjectPosition?.pricePerM2 : undefined);
  const raw = typeof supplied === 'object' ? supplied?.percentage ?? supplied?.ratio ?? supplied?.position : supplied;
  const numeric = finite(raw);
  if (numeric !== null && numeric >= 0 && numeric <= 1) return numeric * 100;
  if (numeric !== null && numeric >= 0 && numeric <= 100) return numeric;
  const values = [finite(range.low), finite(range.mid), finite(range.high)].filter((value) => value !== null);
  if (finite(subjectValue) === null || values.length < 2) return null;
  const low = Math.min(...values), high = Math.max(...values);
  return low === high ? 50 : Math.max(0, Math.min(100, (subjectValue - low) / (high - low) * 100));
}

function positionText(value, range) {
  const low = finite(range.low), high = finite(range.high), subject = finite(value);
  if (subject === null || low === null || high === null) return 'Posição do imóvel não disponível.';
  if (subject < low) return 'O imóvel está abaixo da faixa observada.';
  if (subject > high) return 'O imóvel está acima da faixa observada.';
  return 'O imóvel está dentro da faixa observada.';
}

function rangeBar(label, key, range, benchmark, subject) {
  const formatter = key === 'askingPrice' ? money : moneyPerM2;
  const subjectValue = itemValue(subject, key);
  const section = node('section', 'pmc-range');
  const heading = node('div', 'pmc-range-heading');
  heading.append(node('h4', '', label), node('strong', '', `Imóvel: ${formatter(subjectValue)}`));
  const bar = node('div', 'pmc-range-track');
  bar.setAttribute('aria-hidden', 'true');
  bar.append(node('span', 'pmc-segment pmc-low'), node('span', 'pmc-segment pmc-mid'), node('span', 'pmc-segment pmc-high'));
  const position = subjectPosition(benchmark, key, range, subjectValue);
  if (position !== null) {
    const marker = node('span', 'pmc-marker');
    marker.style.left = `${position}%`;
    bar.append(marker);
  }
  const boundaries = node('div', 'pmc-boundaries');
  [['Baixo', range.low], ['Referência', range.mid], ['Alto', range.high]].forEach(([name, value]) => {
    const boundary = node('span');
    boundary.append(node('small', '', name), node('strong', '', formatter(value)));
    boundaries.append(boundary);
  });
  const semantic = node('p', 'pmc-range-meaning', `${positionText(subjectValue, range)} Faixa baseada em ${number(benchmark.count)} anúncio(s).`);
  section.append(heading, bar, boundaries, semantic);
  return section;
}

function normalizeRange(range) {
  return { low: range?.low ?? range?.p25 ?? null, mid: range?.mid ?? range?.p50 ?? null, high: range?.high ?? range?.p75 ?? null };
}

function normalizeBenchmarks(value) {
  const labels = { same_development: 'Mesmo condomínio', same_region: 'Mesma região', same_city: 'Mesma cidade' };
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([scope, benchmark]) => ({ scope, ...benchmark })) : [];
  return rows.map((benchmark) => ({ ...benchmark, label: benchmark.label ?? labels[benchmark.scope] ?? benchmark.scope,
    askingPrice: normalizeRange(benchmark.askingPrice), askingPricePerM2: normalizeRange(benchmark.askingPricePerM2) }));
}

function marketPanel(data, benchmark, id) {
  const panel = node('div', 'pmc-market-panel');
  panel.id = `${id}-panel`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `${id}-tab`);
  const subject = data.subject ?? {};
  panel.append(
    rangeBar('Preço anunciado', 'askingPrice', benchmark.askingPrice ?? {}, benchmark, subject),
    rangeBar('Preço anunciado por m²', 'askingPricePerM2', benchmark.askingPricePerM2 ?? {}, benchmark, subject),
  );
  return panel;
}

function renderTabs(data, benchmarks) {
  const section = node('section', 'pmc-benchmarks');
  const label = node('div', 'pmc-section-heading');
  label.append(node('div', '', '02'), node('h3', '', 'Faixas por recorte de mercado'));
  const tabs = node('div', 'pmc-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Recorte de mercado');
  const panelSlot = node('div');
  const baseId = `pmc-${++instanceCount}`;
  const buttons = benchmarks.map((benchmark, index) => {
    const button = node('button', 'pmc-tab', benchmark.label ?? benchmark.scope ?? `Recorte ${index + 1}`);
    const id = `${baseId}-${index}`;
    button.type = 'button';
    button.id = `${id}-tab`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${id}-panel`);
    const activate = (focus = false) => {
      buttons.forEach((item) => { item.setAttribute('aria-selected', String(item === button)); item.tabIndex = item === button ? 0 : -1; });
      panelSlot.replaceChildren(marketPanel(data, benchmark, id));
      if (focus) button.focus();
    };
    button.addEventListener('click', () => activate());
    button.addEventListener('keydown', (event) => {
      const current = buttons.indexOf(button);
      const next = event.key === 'ArrowRight' ? (current + 1) % buttons.length : event.key === 'ArrowLeft' ? (current - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); buttons[next].click(); buttons[next].focus(); }
    });
    button.activate = activate;
    tabs.append(button);
    return button;
  });
  buttons[0].activate();
  section.append(label, tabs, panelSlot);
  return section;
}

export function renderPropertyMarketComparison(target, data) {
  if (!target) return;
  const benchmarks = normalizeBenchmarks(data?.benchmarks);
  const comparables = data ? selectedComparables(data) : [];
  const shell = node('section', 'pmc');
  shell.setAttribute('aria-labelledby', `pmc-title-${instanceCount + 1}`);
  const header = node('header', 'pmc-header');
  const titleWrap = node('div');
  const kicker = node('p', 'pmc-kicker', 'VGV · leitura comparativa');
  const title = node('h2', '', 'Posição no mercado anunciado');
  title.id = `pmc-title-${instanceCount + 1}`;
  titleWrap.append(kicker, title);
  const meta = node('p', 'pmc-meta', `Base em ${dateLabel(data?.asOf)}${data?.algorithmVersion ? ` · método ${data.algorithmVersion}` : ''}`);
  header.append(titleWrap, meta);
  shell.append(header);

  if (!data?.subject || !benchmarks.length) {
    shell.append(stateNode('Não há dados suficientes para montar as faixas desta comparação.', 'insufficient'));
    shell.append(disclaimerNode());
    target.replaceChildren(shell);
    return;
  }
  shell.append(renderTabs(data, benchmarks));
  const comparison = node('section', 'pmc-comparables');
  const heading = node('div', 'pmc-section-heading');
  heading.append(node('div', '', '03'), node('h3', '', 'Imóveis lado a lado'));
  comparison.append(heading);
  if (comparables.length < 3) comparison.append(stateNode(`Evidência limitada: somente ${comparables.length} comparável(is) selecionado(s). A leitura permanece indicativa.`, 'insufficient'));
  const grid = node('div', 'pmc-property-grid');
  grid.style.setProperty('--pmc-columns', String(1 + comparables.length));
  grid.append(propertyCard(data.subject, true, 0), ...comparables.map((item, index) => propertyCard(item, false, index + 1)));
  comparison.append(grid);
  shell.append(comparison);
  shell.append(disclaimerNode());
  target.replaceChildren(shell);
}

function disclaimerNode() {
  const disclaimer = node('aside', 'pmc-disclaimer');
  disclaimer.append(node('strong', '', 'Comparação de preços pedidos, não avaliação.'), node('p', '', 'Os valores refletem anúncios e podem diferir dos preços efetivamente negociados. Esta leitura não substitui laudo de avaliação, vistoria ou diligência documental.'));
  return disclaimer;
}

function stateNode(message, kind) {
  const box = node('div', `pmc-state pmc-${kind}`);
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.textContent = message;
  return box;
}

export function renderPropertyMarketComparisonLoading(target) {
  if (target) target.replaceChildren(stateShell('Consultando preços anunciados e comparáveis…', 'loading'));
}

export function renderPropertyMarketComparisonError(target, message = 'A comparação de mercado está indisponível no momento.') {
  if (target) target.replaceChildren(stateShell(message, 'error'));
}

function stateShell(message, kind) {
  const shell = node('div', 'pmc pmc-standalone-state');
  shell.append(stateNode(message, kind));
  return shell;
}
