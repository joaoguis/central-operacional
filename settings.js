import { h, toast, run } from './ui.js';
import * as data from './data.js';
import * as auth from './auth.js';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

export async function viewConfig(ctx, { viewRestaurants }) {
  const root = h('section', {}, h('h2', {}, 'Configurações'), passwordCard());
  if (ctx.can('criar_tarefas')) root.append(await routinesCard(ctx));
  if (ctx.profile.is_admin) root.append(await retentionCard(), backupCard(), await viewRestaurants(ctx));
  return root;
}

function passwordCard() {
  const pass = h('input', { id: 'cp', type: 'password', minlength: 8, autocomplete: 'new-password' });
  return h('div', { class: 'card' }, h('h3', {}, 'Alterar minha senha'),
    h('label', { for: 'cp' }, 'Nova senha (mínimo 8 caracteres)'), pass,
    h('button', { class: 'btn small', style: 'margin-top:.75rem', onClick: (e) => run(e.target, async () => {
      if (pass.value.length < 8) return toast('Use pelo menos 8 caracteres.', true);
      await auth.setNewPassword(pass.value); pass.value = ''; toast('Senha atualizada.');
    }) }, 'Salvar senha'));
}

async function routinesCard(ctx) {
  const [rests, templates] = await Promise.all([data.listRestaurants(), data.listTemplates()]);
  const mine = rests.filter((r) => r.active && ctx.canIn(r.id, 'criar_tarefas'));
  const name = Object.fromEntries(rests.map((r) => [r.id, r.name]));
  const box = h('div', { class: 'card' }, h('h3', {}, 'Rotinas recorrentes'),
    h('p', { class: 'muted' }, 'Criam a tarefa sozinhas, todo dia ou nos dias escolhidos.'));
  const refresh = async () => box.replaceWith(await routinesCard(ctx));

  templates.forEach((t) => box.append(h('div', { class: 'row between gap' },
    h('div', {}, h('strong', {}, t.title), h('div', { class: 'muted' },
      `${name[t.restaurant_id] || ''} · ${t.frequency === 'diaria' ? 'todo dia' : t.weekdays.map((d) => DAYS[d]).join(', ')}`
      + `${t.due_time ? ' · até ' + t.due_time.slice(0, 5) : ''}${t.active ? '' : ' · pausada'}`)),
    h('button', { class: 'btn ghost small', onClick: (e) => run(e.target, async () => {
      await data.setTemplateActive(t.id, !t.active); refresh(); }) }, t.active ? 'Pausar' : 'Ativar'))));
  if (!mine.length) return box;

  const rSel = h('select', { 'aria-label': 'Restaurante' }, mine.map((r) => h('option', { value: r.id }, r.name)));
  const title = h('input', { 'aria-label': 'Título', maxlength: 200, placeholder: 'Ex.: Conferir câmaras frias' });
  const who = h('select', { 'aria-label': 'Responsável' });
  const whoWrap = h('div', {}, h('label', {}, 'Responsável'), who);
  const prio = h('select', { 'aria-label': 'Prioridade' },
    Object.entries(PRIORITY).map(([v, l]) => h('option', { value: v, selected: v === 'media' }, l)));
  const freq = h('select', { 'aria-label': 'Frequência' },
    h('option', { value: 'diaria' }, 'Todo dia'), h('option', { value: 'semanal' }, 'Dias da semana'));
  const days = DAYS.map((d, i) => h('input', { type: 'checkbox', value: i }));
  const daysWrap = h('div', { class: 'row', hidden: true }, DAYS.map((d, i) => h('label', { class: 'inline' }, days[i], d)));
  freq.addEventListener('change', () => { daysWrap.hidden = freq.value !== 'semanal'; });
  const time = h('input', { type: 'time', 'aria-label': 'Prazo (hora)' });

  const loadMembers = async () => {
    who.replaceChildren(h('option', { value: '' }, 'Sem responsável'));
    whoWrap.hidden = !ctx.canIn(rSel.value, 'atribuir_tarefas');
    if (whoWrap.hidden) return;
    (await data.restaurantMembers(rSel.value)).forEach((m) => who.append(h('option', { value: m.id }, m.full_name)));
  };
  rSel.addEventListener('change', () => run(null, loadMembers));
  run(null, loadMembers);

  box.append(h('details', { style: 'margin-top:.75rem' }, h('summary', {}, 'Nova rotina'),
    h('label', {}, 'Restaurante'), rSel, h('label', {}, 'Título'), title, whoWrap,
    h('label', {}, 'Prioridade'), prio, h('label', {}, 'Frequência'), freq, daysWrap,
    h('label', {}, 'Prazo (hora, opcional)'), time,
    h('button', { class: 'btn full', onClick: (e) => run(e.target, async () => {
      const wd = days.filter((c) => c.checked).map((c) => Number(c.value));
      if (!title.value.trim()) return toast('Informe o título.', true);
      if (freq.value === 'semanal' && !wd.length) return toast('Escolha ao menos um dia.', true);
      await data.createTemplate({ restaurant_id: rSel.value, title: title.value.trim(), priority: prio.value,
        assigned_to: whoWrap.hidden ? null : (who.value || null), frequency: freq.value,
        weekdays: freq.value === 'semanal' ? wd : [], due_time: time.value || null });
      toast('Rotina criada.'); refresh();
    }) }, 'Criar rotina')));
  return box;
}

async function retentionCard() {
  const cfg = Object.fromEntries((await data.listSettings()).map((s) => [s.key, s.value]));
  const comum = h('input', { type: 'number', min: 1, max: 3650, value: cfg.retencao_comum_dias || 15, 'aria-label': 'Dias fotos comuns' });
  const nc = h('input', { type: 'number', min: 1, max: 3650, value: cfg.retencao_nc_dias || 90, 'aria-label': 'Dias não conformidade' });
  return h('div', { class: 'card' }, h('h3', {}, 'Retenção das fotos'),
    h('p', { class: 'muted' }, 'Vale para as próximas fotos. Fotos críticas nunca expiram sozinhas. '
      + 'O registro e o histórico da tarefa permanecem depois que a foto é apagada.'),
    h('label', {}, 'Fotos comuns (dias)'), comum, h('label', {}, 'Não conformidades (dias)'), nc,
    h('div', { class: 'row gap' },
      h('button', { class: 'btn small', onClick: (e) => run(e.target, async () => {
        const a = Math.round(Number(comum.value)), b = Math.round(Number(nc.value));
        if (!(a >= 1 && a <= 3650 && b >= 1 && b <= 3650)) return toast('Use valores entre 1 e 3650.', true);
        await data.setSetting('retencao_comum_dias', a); await data.setSetting('retencao_nc_dias', b);
        toast('Retenção salva.');
      }) }, 'Salvar'),
      h('button', { class: 'btn ghost small', onClick: (e) => run(e.target, async () => {
        const rows = await data.expiredEvidences();
        if (!rows.length) return toast('Nenhuma foto vencida.');
        if (!confirm(`Apagar ${rows.length} foto(s) vencida(s)?`)) return;
        await data.purgeEvidences(rows); toast('Fotos vencidas apagadas.');
      }) }, 'Apagar fotos vencidas agora')),
    h('p', { class: 'muted' }, 'A limpeza também roda sozinha quando um administrador abre o app (a cada 12 h).'));
}

function backupCard() {
  return h('div', { class: 'card' }, h('h3', {}, 'Backup'),
    h('p', { class: 'muted' }, 'O plano gratuito não faz backup diário. Baixe uma cópia dos dados de tempos em tempos.'),
    h('button', { class: 'btn small', onClick: (e) => run(e.target, async () => {
      const dump = await data.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
      const a = h('a', { href: url, download: `backup-central-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }) }, 'Baixar backup (JSON)'));
}
