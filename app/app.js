const PROGRESS_KEY = 'vice-atlas-progress-v2';
const PREFS_KEY = 'vice-atlas-preferences-v2';
const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const state = { view: 'tracker', focus: 28, kind: 'all', grade: 'all', query: '', remaining: false, hideStory: true, earned: new Set(), counts: {} };
const data = await fetch('data/trophies.json').then((response) => {
  if (!response.ok) throw new Error('Cannot load local trophy data. Serve app/ as a static site.');
  return response.json();
});
const trophies = data.trophies;
const byId = new Map(trophies.map((t) => [t.id, t]));
const sourceIndex = new Map(data.sources.map((s, i) => [s.id, { ...s, number: i + 1 }]));
const routePhases = [
  { title: 'Chapters 1–2', chapters: [1, 2], note: 'Save before the balcony' },
  { title: 'Chapter 3', chapters: [3], note: 'Side strands & collections' },
  { title: 'Chapter 4', chapters: [4], note: 'Vault route & range' },
  { title: 'Chapter 5', chapters: [5], note: 'Finish story, keep saves' },
  { title: 'Free roam & 100%', chapters: [0], note: 'Finish counts for platinum' },
];
const routePosition = (trophy) => routePhases.findIndex((phase) => phase.chapters.includes(trophy.chapter));
const routeOrder = (trophy) => trophy.id === 28 ? 3.5 : trophy.id;
function el(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function button(text, action, className = '') {
  const result = el('button', className, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}
function masked(t) { return state.hideStory && (t.kind === 'story' || t.hidden) && !state.earned.has(t.name); }
function sourceLink(id, compact = false) {
  const source = sourceIndex.get(id);
  if (!source) return el('span', '', '');
  const link = el('a', 'source-link', compact ? `[${String(source.number).padStart(2, '0')}]` : `[${String(source.number).padStart(2, '0')}] ${source.name}`);
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `${source.name} — ${source.title}\n${source.url}`;
  link.setAttribute('aria-label', `Source ${source.number}: ${source.name}, ${source.title}`);
  return link;
}
function cite(ids, compact = false) {
  const result = el('span', 'citations');
  for (const id of [...new Set(ids)]) result.append(sourceLink(id, compact));
  return result;
}
function grade(t) { return el('span', `grade grade-${t.grade}`, t.grade); }
function safeCounters(input) {
  const output = {};
  for (const t of trophies) {
    const value = Number(input?.[t.id]);
    if (t.target && Number.isFinite(value) && value >= 0) output[t.id] = Math.min(t.target, Math.floor(value));
  }
  return output;
}
function importPayload(payload) {
  const names = Array.isArray(payload) ? payload : payload?.earned;
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) throw new Error('Expected an earned-trophy array.');
  const valid = new Set(trophies.map((t) => t.name));
  const unknown = names.filter((name) => !valid.has(name));
  if (unknown.length) throw new Error(`Unrecognized trophy: ${unknown[0]}`);
  state.earned = new Set(names);
  state.counts = safeCounters(payload.counts);
  if (typeof payload.hideStory === 'boolean') state.hideStory = payload.hideStory;
  if (typeof payload.spoilerHidden === 'boolean') state.hideStory = payload.spoilerHidden;
}
function readProgress() {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (stored) importPayload(JSON.parse(stored));
    else {
      const older = localStorage.getItem('vice-atlas-progress-v1');
      if (older) importPayload(JSON.parse(older));
    }
  } catch { toast('Stored progress could not be read. Import your JSON backup to restore it.'); }
  try {
    const pref = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (typeof pref.hideStory === 'boolean') state.hideStory = pref.hideStory;
  } catch {}
}
function progressPayload() {
  return { format: 'vice-atlas-progress/v2', game: data.game, earned: [...state.earned], counts: state.counts, hideStory: state.hideStory };
}
function save() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressPayload()));
    localStorage.setItem(PREFS_KEY, JSON.stringify({ hideStory: state.hideStory }));
    $('#save-status').textContent = '✓ Saved on this device';
  } catch { $('#save-status').textContent = 'Storage unavailable · export a backup'; }
  stats();
}
function stats() {
  const count = state.earned.size;
  const totalTrophies = trophies.length;
  $('#earned-total').textContent = `${count} / ${totalTrophies}`;
  $('#earned-percent').textContent = `${Math.round(100 * count / totalTrophies)}% earned`;
  $('#earned-bar').max = totalTrophies;
  $('#earned-bar').value = count;
  const grades = ['platinum','gold','silver','bronze'].map((rank) => {
    const total = trophies.filter((t) => t.grade === rank);
    const earned = total.filter((t) => state.earned.has(t.name)).length;
    const item = el('span', `grade-total grade-${rank}`);
    const shortGrade = el('abbr', '', rank[0].toUpperCase());
    shortGrade.title = rank;
    item.append(shortGrade, el('b', '', `${earned}/${total.length}`));
    item.title = `${earned} of ${total.length} ${rank} trophies earned`;
    item.setAttribute('aria-label', item.title);
    return item;
  });
  $('#grade-progress').replaceChildren(...grades);
  const compact = $('#compact-progress');
  const total = el('div', 'compact-earned');
  total.append(el('b', '', `${count}/${totalTrophies}`), el('span', '', 'earned'));
  compact.replaceChildren(total, ...grades.map((item) => item.cloneNode(true)));
}
function selectTrophy(id, scroll = false) {
  state.focus = id;
  renderTracker();
  if (scroll) {
    const list = $('#trophy-list');
    const row = list.querySelector(`[data-id="${id}"]`);
    if (row) list.scrollTop = Math.max(0, row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 36);
  }
}
function earnedControl(t, compact = false) {
  const label = el('label', compact ? 'earned-control compact' : 'earned-control');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.earned.has(t.name);
  checkbox.setAttribute('aria-label', `Mark ${masked(t) ? 'hidden story trophy' : t.name} earned`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.earned.add(t.name);
    else state.earned.delete(t.name);
    save();
    renderTracker();
  });
  label.append(checkbox, el('span', 'check-box', '✓'));
  if (!compact) label.append(el('span', '', checkbox.checked ? 'Earned' : 'Mark earned'));
  return label;
}
const kinds = [
  ['all', 'All 55', () => true],
  ['story', 'Story', (t) => t.kind === 'story'],
  ['missable', 'Missable', (t) => t.missable === 'possible'],
  ['collectible', 'Collectibles', (t) => t.kind === 'collectible' || [23,35].includes(t.id)],
  ['activity', 'Activities', (t) => t.kind === 'activity' || t.id === 28],
  ['races', 'Races', (t) => [18,19].includes(t.id)],
    ['stunts', 'Stunts', (t) => t.id === 15],
  ['side', 'Side', (t) => t.kind === 'side'],
  ['misc', 'Crime & misc', (t) => t.kind === 'misc'],
  ['money', 'Money', (t) => [52,53,54].includes(t.id)],
  ['unresolved', 'Unresolved', (t) => t.evidence === 'unresolved'],
  ['online', 'Online', () => false]
];
function renderFilters() {
  const group = $('#kind-filters');
  group.replaceChildren();
  const more = el('details', 'more-filters');
  more.append(el('summary', '', 'More kinds'));
  const options = el('div', 'extra-kinds');
  more.append(options);
  for (const [index, [id, label, matches]] of kinds.entries()) {
    const count = trophies.filter(matches).length;
    const control = button(id === 'all' ? label : `${label} ${count}`, () => {
      state.kind = id;
      renderFilters();
      renderTracker();
    }, `filter ${state.kind === id ? 'active' : ''}`);
    control.setAttribute('aria-pressed', state.kind === id ? 'true' : 'false');
    (index < 5 ? group : options).append(control);
    if (index >= 5 && id === state.kind) more.classList.add('has-selection');
  }
  group.append(more);
}
function results() {
  const predicate = kinds.find(([id]) => id === state.kind)[2];
  return trophies.filter((t) => {
    if (!predicate(t) || (state.grade !== 'all' && t.grade !== state.grade)) return false;
    if (state.remaining && state.earned.has(t.name)) return false;
    if (!state.query) return true;
    if (masked(t)) return false;
    return `${t.name} ${t.description} ${t.guide} ${t.steps.map((s) => s.text).join(' ')}`.toLowerCase().includes(state.query);
  }).sort((a, b) => routePosition(a) - routePosition(b) || a.chapter - b.chapter || routeOrder(a) - routeOrder(b));
}
function trophyRow(t) {
  const concealed = masked(t);
  const row = el('article', `trophy-row ${t.id === state.focus ? 'selected' : ''} ${state.earned.has(t.name) ? 'earned' : ''} ${concealed ? 'trophy-masked' : ''}`);
  row.dataset.id = t.id;
  row.append(earnedControl(t, true));
  const text = button('', () => selectTrophy(t.id), 'trophy-open');
  text.append(el('strong', '', concealed ? 'Hidden story trophy' : t.name));
  text.append(grade(t));
  text.append(el('span', 'row-description', concealed ? 'Official name and description protected.' : t.description));
  const meta = el('span', 'row-meta');
  if (t.missable === 'possible') meta.append(el('b', 'risk-label', 'POSSIBLE MISSABLE'));
  else if (!t.target || masked(t)) meta.append(el('span', '', masked(t) ? 'STORY' : t.stage));
  if (t.target && !masked(t)) meta.append(el('span', 'row-count', `${state.counts[t.id] || 0}/${t.target}`));
  text.append(meta);
  row.append(text);
  return row;
}
function renderRows(list, visible) {
  const fragment = document.createDocumentFragment();
  let lastPhase = -1;
  let cards;
  for (const trophy of visible) {
    const phase = routePosition(trophy);
    if (phase !== lastPhase) {
      const matches = visible.filter((item) => routePosition(item) === phase);
      const earned = matches.filter((item) => state.earned.has(item.name)).length;
      const band = el('h3', 'checklist-phase');
      band.append(el('span', '', routePhases[phase].title), el('span', '', `${earned}/${matches.length} earned`));
      const group = el('section', 'checklist-phase-group');
      cards = el('div', 'phase-trophies');
      group.append(band, cards);
      fragment.append(group);
      lastPhase = phase;
    }
    cards.append(trophyRow(trophy));
  }
  list.replaceChildren(fragment);
}
function counterControl(t) {
  const counter = el('div', 'manual-counter');
  const label = el('label', '', 'YOUR COUNT');
  const field = el('input');
  field.type = 'number';
  field.min = '0';
  field.max = String(t.target);
  field.value = String(state.counts[t.id] || 0);
  field.setAttribute('aria-label', `Manual ${t.unit} count`);
  const update = (value) => {
    state.counts[t.id] = Math.min(t.target, Math.max(0, Math.floor(Number(value) || 0)));
    save();
    renderTracker();
  };
  field.addEventListener('change', () => update(field.value));
  counter.append(label, button('−', () => update((state.counts[t.id] || 0) - 1)), field, button('+', () => update((state.counts[t.id] || 0) + 1)), el('span', 'counter-unit', `/ ${t.target} ${t.unit}`));
  const meter = el('span', 'counter-track');
  const fill = el('i');
  fill.style.width = `${(state.counts[t.id] || 0) / t.target * 100}%`;
  meter.append(fill);
  counter.append(meter);
  return counter;
}
function callout(title, text, ids, type = '') {
  const box = el('aside', `callout ${type}`);
  const copy = el('p', '', text);
  if (ids?.length) copy.append(document.createTextNode(' '), cite(ids, true));
  box.append(el('b', '', title), copy);
  return box;
}
function renderDetail(t) {
  const detail = $('#guide-detail');
  detail.replaceChildren();
  const top = el('div', 'detail-top');
  top.append(el('span', 'eyebrow', `FIELD NOTE ${String(t.id).padStart(2,'0')} / 55`), earnedControl(t));
  detail.append(top);
  detail.append(el('h2', 'detail-title', masked(t) ? 'The story stays yours.' : t.name));
  const meta = el('div', 'detail-meta');
  meta.append(grade(t), el('span', 'tag', t.stage), el('span', 'tag', t.hidden ? 'HIDDEN ON PSN' : 'PUBLIC ON PSN'));
  if (t.missable === 'possible') meta.append(el('span', 'risk-label', 'POSSIBLE MISSABLE'));
  detail.append(meta);
  const official = el('blockquote', 'official');
  official.append(el('b', 'eyebrow', 'OFFICIAL DESCRIPTION · PLAYSTATION'));
  official.append(el('p', '', masked(t) ? 'This story trophy is protected until you earn it. Switch off Hide story spoilers if you want to read ahead.' : t.description));
  detail.append(official);
  if (masked(t)) {
    detail.append(callout('SPOILER SHIELD IS ON', 'The name, mission and guide are hidden. Mark this trophy earned or change the spoiler setting to reveal the route.', []));
    return;
  }
  if (t.id === 28) {
    detail.append(callout('Possible missable · Chapter 1', 'Save first: the balcony requirement is unconfirmed.', ['gtabase-list','keen'], 'dispute'));
  } else if (t.evidence === 'unresolved') {
    detail.append(callout('UNCONFIRMED TRIGGER · DO NOT GRIND A GUESS', t.guide, ['gtabase-list','keen'], 'dispute'));
  } else detail.append(el('p', 'guide-summary', t.guide));
  if (t.target) detail.append(counterControl(t));
  const heading = el('div', 'section-heading');
  heading.append(el('h3', 'eyebrow', 'How to earn it'), el('span', '', `${t.steps.length} cited steps`));
  detail.append(heading);
  const steps = el('ol', 'guide-steps');
  for (const step of t.steps) {
    const item = el('li');
    const copy = el('p', '', step.text);
    copy.append(document.createTextNode(' '), cite(step.sources, true));
    item.append(copy);
    steps.append(item);
  }
  detail.append(steps);
  const sourceKey = el('p', 'guide-source-key');
  sourceKey.append(el('b', '', 'Step sources: '));
  const linkedSources = new Set(t.steps.flatMap((step) => step.sources));
  for (const id of linkedSources) {
    sourceKey.append(sourceLink(id), document.createTextNode(' · '));
  }
  detail.append(sourceKey);
  const availability = el('div', `availability${t.id === 28 ? ' repeats-step-window' : ''}`);
  availability.append(el('b', '', 'WHEN TO DO IT'), el('p', '', t.availability));
  detail.append(availability);
  if (t.id === 14) {
    const more = el('details', 'completion-targets');
    more.append(el('summary', '', 'Compare trophy and 100% targets'), thresholdTable());
    detail.append(more);
  }
}
function renderRouteProgress() {
  const route = $('#route-progress');
  route.replaceChildren();
  for (const [index, { title: label, chapters, note }] of routePhases.entries()) {
    const members = trophies.filter((item) => chapters.includes(item.chapter));
    const earned = members.filter((item) => state.earned.has(item.name)).length;
    const line = button('', () => setView('roadmap'), index === 0 ? 'stage-line stage-precaution' : 'stage-line');
    line.append(el('span', 'stage-name', label), el('b', '', `${earned}/${members.length}`));
    line.append(el('span', 'stage-action', note));
    const meter = el('progress', 'stage-meter');
    meter.max = members.length;
    meter.value = earned;
    meter.setAttribute('aria-label', label);
    line.append(meter);
    route.append(line);
  }
}
function renderRail(t) {
  const rail = $('#evidence-rail');
  rail.replaceChildren();
  const top = el('div', 'panel-heading');
  top.append(el('b', '', 'Guide sources'), el('span', '', '20 Nov'));
  rail.append(top);
  if (masked(t)) {
    rail.append(el('p', 'rail-note', 'Citations hidden with the trophy guide.'));
    return;
  }
  if (t.id === 28) {
    const split = el('section', 'meditation-targets');
    split.append(el('h3', '', 'Meditation targets'));
    for (const [count, label, ids] of [
      ['18', 'Trophy', ['gtabase-list', 'keen']],
      ['15', '100% stat', ['gtabase-100']],
    ]) {
      const target = el('div', 'meditation-target');
      target.append(el('b', '', count), el('span', '', label), cite(ids, true));
      split.append(target);
    }
    const balcony = el('p', 'meditation-evidence', 'GTABase and KeenGamer leave the balcony requirement unconfirmed. ');
    balcony.append(cite(['gtabase-list', 'keen'], true));
    split.append(balcony);
    rail.append(split);
  }
  const linked = [...new Set(['playstation', 'exophase', ...t.steps.flatMap((s) => s.sources)])];
  const sourceGroups = new Map();
  for (const id of linked) {
    const name = sourceIndex.get(id).name;
    if (!sourceGroups.has(name)) sourceGroups.set(name, []);
    sourceGroups.get(name).push(id);
  }
  const pageLabels = { 'gtabase-list': 'Trophy guide', 'gtabase-missions': 'Mission order', 'gtabase-100': '100% targets' };
  for (const [name, ids] of sourceGroups) {
    const card = el('div', 'rail-source');
    if (ids.length === 1) {
      card.append(sourceLink(ids[0]), el('p', '', sourceIndex.get(ids[0]).role));
    } else {
      card.append(el('b', 'source-family', name));
      for (const id of ids) {
        const source = sourceIndex.get(id);
        const link = sourceLink(id);
        link.textContent = `[${String(source.number).padStart(2, '0')}] ${pageLabels[id] || source.role}`;
        card.append(link);
      }
    }
    rail.append(card);
  }
  const ledger = button('See all sources and disputes →', () => setView('sources'), 'rail-ledger');
  rail.append(ledger);
}
function renderTracker() {
  const list = $('#trophy-list');
  const oldScroll = list.scrollTop;
  const visible = results();
  if (!visible.some((t) => t.id === state.focus)) state.focus = visible[0]?.id ?? null;
  document.body.classList.toggle('risk-in-detail', state.focus === 28 && !masked(byId.get(28)));
  renderRows(list, visible);
  list.scrollTop = oldScroll;
  $('#shown-count').textContent = `${visible.length} / ${trophies.length}`;
  if (state.focus) {
    renderDetail(byId.get(state.focus));
    renderRail(byId.get(state.focus));
  } else {
    $('#guide-detail').replaceChildren(el('h2', 'empty', state.kind === 'online' ? 'The platinum is entirely offline.' : 'No trophies match this search.'));
    $('#evidence-rail').replaceChildren();
  }
  $('#spoiler').checked = state.hideStory;
  stats();
  renderRouteProgress();
}
function thresholdTable() {
  const table = el('table', 'thresholds');
  const caption = el('caption', '', 'TROPHY TARGET → 100% TARGET');
  table.append(caption);
  const head = el('thead');
  const hr = el('tr');
  for (const text of ['Category','Trophy','100%']) hr.append(el('th','',text));
  head.append(hr);
  table.append(head);
  const body = el('tbody');
  for (const entry of data.thresholds) {
    const row = el('tr');
    const label = el('th', '', entry.name);
    label.scope = 'row';
    label.append(document.createTextNode(' '), cite(entry.sources, true));
    row.append(label, el('td','',entry.trophy), el('td','',entry.completion));
    body.append(row);
  }
  table.append(body);
  return table;
}
function viewIntro(kicker, title, subtitle) {
  const header = el('header', 'view-intro');
  header.append(el('p','eyebrow',kicker),el('h1','',title),el('p','',subtitle));
  return header;
}
function evidenceMetrics(items) {
  const strip = el('section', 'evidence-metrics');
  for (const [number, label] of items) {
    const tile = el('div');
    tile.append(el('b', '', number), el('span', '', label));
    strip.append(tile);
  }
  return strip;
}
function renderRoadmap() {
  const view = $('#roadmap-view');
  view.replaceChildren(viewIntro('GTA VI · PlayStation 5', 'Platinum route', 'Five phases from Chapter 1 to 100%. Keep manual saves: the mission guide reports no mission replay.'));
  const layout = el('div','route-layout');
  const phases = el('div','phases');
  const phaseTitles = ['Save first', 'Build counters', 'Vice City strands', 'Vaults & story', 'Earn platinum'];
  const highlights = [
    ['Keep a Chapter 1 save and take Lucia’s balcony invitation. Its trophy requirement is unconfirmed.', 'Finish Gone Fishing, then advance to Chapter 2.'],
    ['Try all 9 activities for Master of None.', 'Finish Bret’s hunt, Cal’s fishing challenge and Billy’s dirt-bike strand.'],
    ['After Key Cloner, start Andy, Randy, Yasmani and Tyrone’s jobs.', 'Track 8 qualifying Stranger strands; verify each in the trophy counter.'],
    ['Escape 5 vaults for the trophy; clear all 8 for 100%.', 'Finish VCIA Takedown, Operation Savage Glory and The End of the Road.'],
    ['100%: 42 range golds, 42 drone trials, 39 gang operations and 15 Target Decks.', 'Confirm 100% and all 54 other PS5 trophies for Vice Got a Price!.'],
  ];
  for (const [index, phase] of data.roadmap.entries()) {
    const card = el('article',`phase phase-${phase.stage}`);
    const marker = el('span','phase-marker',phase.stage);
    const copy = el('div');
    const window = state.hideStory ? phase.window.split(' · ')[0] : phase.window;
    copy.append(el('p','eyebrow',window),el('h2','',phaseTitles[index]));
    const visibleSteps = index === 3 ? [0, 2] : index === 4 ? [1, 3] : [0, 1];
    const full = el('details', 'phase-full');
    full.append(el('summary', '', 'Full phase guide'));
    for (const [stepIndex, step] of phase.steps.entries()) {
      if (state.hideStory && step.storySpoiler) continue;
      const p=el('p','phase-copy',step.text);
      p.append(document.createTextNode(' '),cite(step.sources,true));
      if (visibleSteps.includes(stepIndex)) {
        p.firstChild.textContent = highlights[index][visibleSteps.indexOf(stepIndex)] + ' ';
        copy.append(p);
      }
      const complete = el('p', 'phase-copy', step.text);
      complete.append(document.createTextNode(' '), cite(step.sources, true));
      full.append(complete);
    }
    copy.append(full);
    card.append(marker,copy);
    phases.append(card);
  }
  layout.append(phases);
  const sidebar=el('aside','route-sidebar');
  const audit=el('section','route-audit');
  audit.id='missable-audit';
  audit.append(el('p','eyebrow','Missable audit · 0 confirmed'),el('h2','','1 possible: balcony meditation'));
  audit.append(el('p','',state.hideStory ? 'Accept the Chapter 1 invitation and keep a manual save. Sources report that the invitation disappears.' : 'Accept Lucia’s Chapter 1 balcony invitation after Down to Earth. Keep a save before the invitation disappears.'));
  audit.append(cite(['keen','gtabase-list']));
  audit.append(el('b','audit-line','Trophy dependency unconfirmed'));
  const auditDetails = el('details', 'phase-full');
  auditDetails.append(el('summary', '', 'Side jobs and trophy lockouts'));
  auditDetails.append(el('p','','The mission guide separates chapter-limited side jobs from trophies and 100% completion.'));
  auditDetails.append(cite(['gtabase-missions','gtabase-100']));
  audit.append(auditDetails);
  sidebar.append(audit,thresholdTable());
  layout.append(sidebar);
  view.append(layout);
}
function renderSources() {
  const view=$('#sources-view');
  const checked = new Date(`${data.audit.lastChecked}T12:00:00Z`);
  const checkedLabel = new Intl.DateTimeFormat('en-GB', {dateStyle:'long',timeZone:'UTC'}).format(checked);
  view.replaceChildren(viewIntro(`Evidence checked ${checkedLabel}`,'Source matrix', 'Exophase and GTABase agree on all 55 official names, descriptions and grades.'));
  view.append(evidenceMetrics([
    ['55/55', 'Trophies sourced'],
    [String(data.sources.length), 'Source pages'],
    [String(trophies.reduce((sum, trophy) => sum + trophy.steps.length, 0)), 'Cited steps'],
    [String(data.disputes.length), 'Evidence notes'],
  ]));
  const layout=el('div','sources-layout');
  const ledger=el('section','source-ledger');
  const table=el('table','source-table');
  const head=el('thead');
  const tr=el('tr');
  for(const label of ['Source page','Evidence used','Guides','Steps']) {
    const cell = el('th', '', label);
    cell.scope = 'col';
    tr.append(cell);
  }
  head.append(tr);table.append(head);
  const body=el('tbody');
  for(const source of data.sources) {
    const row=el('tr');const identity=el('td');
    identity.append(sourceLink(source.id));
    const coverage = el('td', 'source-coverage');
    const meter = el('progress');
    meter.max = trophies.length;
    meter.value = source.guidesCiting;
    meter.setAttribute('aria-label', `${source.name}: ${source.guidesCiting} guides`);
    coverage.append(el('span', '', String(source.guidesCiting)), meter);
    row.append(identity,el('td','',source.role),coverage,el('td','',String(source.stepsCiting)));
    body.append(row);
  }
  table.append(body);ledger.append(table);
  layout.append(ledger);
  const notes=el('section','disputes');
  notes.append(el('h2','','Notes & source disputes'));
  const featuredFirst = [...data.disputes].sort((a, b) => Number(Boolean(b.comparison)) - Number(Boolean(a.comparison)));
  for (const note of featuredFirst) {
    const card=el('article',`dispute-note${note.comparison ? ' featured-dispute' : ''}`);
    card.append(el('p','eyebrow',note.status),el('h3','',note.title));
    if (note.comparison) {
      const split = el('div', 'dispute-comparison');
      for (const [count, label, ids] of note.comparison) {
        const side = el('div');
        const [number, ...unit] = count.split(' ');
        side.append(el('b', '', number), el('span', '', unit.join(' ')), el('strong', '', label), cite(ids));
        split.append(side);
      }
      card.append(split);
    }
    if (note.comparison) {
      const details = el('details', 'dispute-full');
      details.append(el('summary', '', 'Read evidence & decision'), el('p', '', note.text), cite(note.sources));
      card.append(details);
    } else card.append(el('p','',note.text),cite(note.sources));
    notes.append(card);
  }
  layout.append(notes);view.append(layout);
}
function setView(view) {
  state.view=view;
  document.body.dataset.view=view;
  for(const name of ['tracker','roadmap','sources'])$('#'+name+'-view').classList.toggle('hidden',name!==view);
  document.querySelectorAll('nav button').forEach((control) => {
    const active = control.dataset.view === view;
    control.classList.toggle('active', active);
    if (active) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  });
  if(view==='roadmap')renderRoadmap();
  if(view==='sources')renderSources();
  const url = new URL(location.href);
  url.searchParams.set('view', view);
  history.replaceState(null, '', url.pathname + url.search);
  window.scrollTo(0, 0);
}
readProgress();
if (params.get('reveal') === '1') state.hideStory = false;
if(byId.has(Number(params.get('focus'))))state.focus=Number(params.get('focus'));
  if(kinds.some(([id])=>id===params.get('kind')))state.kind=params.get('kind');
$('#audit-coverage').textContent=`${trophies.length}/55 official trophies`;
$('#audit-sources').textContent=`${data.sources.length} source pages`;
$('#audit-steps').textContent=`${data.audit.guideSteps}/${data.audit.guideSteps} steps cited`;
renderFilters();
renderTracker();
setView(['tracker','roadmap','sources'].includes(params.get('view'))?params.get('view'):'tracker');
if(params.has('focus'))selectTrophy(state.focus,true);
$('#search').addEventListener('input',(e)=>{state.query=e.target.value.trim().toLowerCase();renderTracker();});
$('#grade').addEventListener('change',(e)=>{state.grade=e.target.value;renderTracker();});
$('#remaining').addEventListener('change',(e)=>{state.remaining=e.target.checked;renderTracker();});
$('#spoiler').addEventListener('change',(e)=>{state.hideStory=e.target.checked;save();renderTracker();});
$('#show-risk').addEventListener('click',()=>{state.kind='all';state.grade='all';state.remaining=false;state.query='';$('#search').value='';$('#grade').value='all';$('#remaining').checked=false;setView('tracker');renderFilters();selectTrophy(28,true);});
document.querySelectorAll('nav button').forEach((b)=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('.brand').addEventListener('click',(e)=>{e.preventDefault();setView('tracker');});
$('#export').addEventListener('click',()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify({...progressPayload(),exportedAt:new Date().toISOString()},null,2)+'\n'],{type:'application/json'}));
 const link=el('a');link.href=url;link.download='vice-atlas-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Checklist and manual counts exported.');
});
$('#import').addEventListener('change',async(e)=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>200000)throw new Error('Backup is too large.');importPayload(JSON.parse(await file.text()));save();renderTracker();toast(`Imported ${state.earned.size} earned trophies and their counts.`);}
 catch(error){toast('Import failed: '+error.message);}
 e.target.value='';
});
$('#clear').addEventListener('click',()=>{
 if(!state.earned.size && !Object.values(state.counts).some(Boolean))return toast('Your field log is already clear.');
 if(!confirm('Clear all trophy ticks and manual counts on this device? Export a JSON backup first to preserve them.'))return;
 state.earned.clear();state.counts={};save();renderTracker();toast('Field log cleared.');
});
document.addEventListener('keydown',(e)=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setView('tracker');$('#search').focus();}
 if(e.key==='Escape'&&document.activeElement===$('#search')){$('#search').value='';state.query='';renderTracker();}
});
