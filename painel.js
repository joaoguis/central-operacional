import { h, run } from './ui.js';
import * as data from './data.js';
import { fmt, HIST } from './tasks.js';

const table = (heads, rows) => h('div', { class: 'scroll' }, h('table', {},
  h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))),
  h('tbody', {}, rows)));

export async function viewPainel(ctx) {
  const rests = (await data.listRestaurants()).filter((r) => r.active && ctx.canIn(r.id, 'ver_indicadores'));
  const body = h('div');
  const sel = h('select', { 'aria-label': 'Unidade', onChange: (e) => run(null, () => draw(e.target.value)) },
    h('option', { value: '' }, 'Todas as unidades'), rests.map((r) => h('option', { value: r.id }, r.name)));
  const kpi = (n, label, cls) => h('div', { class: 'kpi ' + (cls || '') }, h('strong', {}, n), h('span', { class: 'muted' }, label));

  async function draw(rid) {
    const d = await data.dashboard(rid);
    body.replaceChildren(
      h('div', { class: 'kpis' },
        kpi(d.total, 'Total'), kpi(d.pendente, 'Pendentes'), kpi(d.em_andamento, 'Em andamento'),
        kpi(d.aguardando_validacao, 'Aguardando validação'), kpi(d.concluida, 'Concluídas', 'ok'),
        kpi(d.atrasada, 'Atrasadas', d.atrasada > 0 ? 'bad' : '')),
      h('div', { class: 'card' }, h('h3', {}, 'Por restaurante'),
        table(['Restaurante', 'Abertas', 'Atrasadas', 'Concluídas'], d.por_restaurante.map((r) =>
          h('tr', { class: 'click', onClick: () => { sel.value = r.id; run(null, () => draw(r.id)); } },
            h('td', {}, r.nome), h('td', {}, r.abertas), h('td', { class: r.atrasadas > 0 ? 'late' : '' }, r.atrasadas),
            h('td', {}, r.concluidas)))),
        h('p', { class: 'muted' }, 'Toque em um restaurante para ver só ele.')),
      h('div', { class: 'card' }, h('h3', {}, 'Por responsável'),
        d.por_responsavel.length ? table(['Responsável', 'Abertas', 'Atrasadas', 'Concluídas'], d.por_responsavel.map((r) =>
          h('tr', {}, h('td', {}, r.nome), h('td', {}, r.abertas),
            h('td', { class: r.atrasadas > 0 ? 'late' : '' }, r.atrasadas), h('td', {}, r.concluidas))))
          : h('p', { class: 'muted' }, 'Sem tarefas.')),
      h('div', { class: 'card' }, h('h3', {}, 'Movimentações recentes'),
        d.recentes.length ? d.recentes.map((e) => h('p', { class: 'muted' },
          `${fmt(e.quando)} · ${e.quem || 'Administrador'} · ${HIST[e.acao] || e.acao} — ${e.tarefa} (${e.restaurante})`))
          : h('p', { class: 'muted' }, 'Nada ainda.')));
  }
  await draw('');
  return h('section', {}, h('h2', {}, 'Painel geral'), h('div', { class: 'row' }, sel), body);
}
