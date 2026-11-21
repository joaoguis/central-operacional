import { h, toast, run } from './ui.js';
import * as data from './data.js';
import { compressImage } from './image.js';

const STATUS = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_validacao: 'Aguardando validação',
  concluida: 'Concluída', cancelada: 'Cancelada' };
const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const RET = { comum: 'comum', nao_conformidade: 'não conformidade', critico: 'crítico' };
const OPEN = ['pendente', 'em_andamento', 'aguardando_validacao'];
export const HIST = { criacao: 'Tarefa criada', responsavel_alterado: 'Responsável alterado', prazo_alterado: 'Prazo alterado',
  prioridade_alterada: 'Prioridade alterada', status_alterado: 'Status alterado', conclusao: 'Tarefa concluída',
  cancelamento: 'Tarefa cancelada', foto_removida: 'Foto removida (prazo de retenção)', edicao: 'Título ou descrição editados', comentario: 'Comentário', foto: 'Foto enviada' };

const isLate = (t) => t.due_at && OPEN.includes(t.status) && new Date(t.due_at) < new Date();
export const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem prazo');
const toInput = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const fromInput = (v) => (v ? new Date(v).toISOString() : null);
const ms = (d) => (d ? new Date(d).getTime() : null);
const statusKey = (t) => (isLate(t) ? 'atrasada' : t.status);
const badge = (t) => h('span', { class: 'badge st-' + statusKey(t) }, isLate(t) ? 'Atrasada' : STATUS[t.status]);
const opts = (obj, sel) => Object.entries(obj).map(([v, l]) => h('option', { value: v, selected: v === sel }, l));

/* ---------- Lista (Tarefas / Minhas atividades) ---------- */
export async function viewTasks(ctx, { mine }) {
  const [all, rests] = await Promise.all([data.listTasks(), data.listRestaurants()]);
  const base = mine ? all.filter((t) => t.assigned_to === ctx.profile.id) : all;
  const createRests = rests.filter((r) => r.active && ctx.canIn(r.id, 'criar_tarefas'));
  const f = { rest: '', status: '', from: '', to: '' };
  const root = h('section');
  const reload = async () => root.replaceWith(await viewTasks(ctx, { mine }));

  const list = h('div');
  const card = (t) => h('button', { class: 'card task', onClick: async () => {
    root.replaceChildren(await taskDetail(t.id, ctx, reload)); window.scrollTo(0, 0); } },
    h('div', { class: 'row between' }, h('strong', {}, t.title), badge(t)),
    h('div', { class: 'muted' }, `${t.restaurant?.name || ''} · ${PRIORITY[t.priority]} · prazo: ${fmt(t.due_at)}`),
    h('div', { class: 'muted' }, 'Responsável: ' + (t.assignee?.full_name || 'ninguém')));
  const draw = () => {
    const items = base.filter((t) => (!f.rest || t.restaurant_id === f.rest)
      && (!f.status || (f.status === 'atrasada' ? isLate(t) : t.status === f.status))
      && (!f.from || t.created_at.slice(0, 10) >= f.from) && (!f.to || t.created_at.slice(0, 10) <= f.to));
    list.replaceChildren(...(items.length ? items.map(card)
      : [h('p', { class: 'muted' }, mine ? 'Nenhuma atividade para você.' : 'Nenhuma tarefa encontrada.')]));
  };
  const sel = (label, options, key) => h('select', { 'aria-label': label,
    onChange: (e) => { f[key] = e.target.value; draw(); } },
    h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v }, l)));
  const date = (label, key) => h('input', { type: 'date', 'aria-label': label, title: label,
    onChange: (e) => { f[key] = e.target.value; draw(); } });

  root.append(
    h('div', { class: 'row between' }, h('h2', {}, mine ? 'Minhas atividades' : 'Tarefas'),
      createRests.length > 0 && h('button', { class: 'btn small', onClick: () => {
        root.replaceChildren(taskForm(ctx, createRests, reload, reload)); window.scrollTo(0, 0); } }, 'Nova tarefa')),
    h('div', { class: 'row filters' },
      sel('Restaurante', rests.map((r) => [r.id, r.name]), 'rest'),
      sel('Status', [...Object.entries(STATUS), ['atrasada', 'Atrasada']], 'status'),
      date('Criadas a partir de', 'from'), date('Criadas até', 'to')),
    list);
  draw();
  return root;
}

/* ---------- Nova tarefa ---------- */
function taskForm(ctx, rests, onDone, onCancel) {
  const rSel = h('select', { id: 't-rest' }, rests.map((r) => h('option', { value: r.id }, r.name)));
  const title = h('input', { id: 't-title', required: true, maxlength: 200 });
  const desc = h('textarea', { id: 't-desc', rows: 4 });
  const due = h('input', { id: 't-due', type: 'datetime-local' });
  const prio = h('select', { id: 't-prio' }, opts(PRIORITY, 'media'));
  const who = h('select', { id: 't-who' });
  const whoWrap = h('div', {}, h('label', { for: 't-who' }, 'Responsável'), who);
  const loadMembers = async () => {
    who.replaceChildren(h('option', { value: '' }, 'Sem responsável'));
    whoWrap.hidden = !ctx.canIn(rSel.value, 'atribuir_tarefas');
    if (whoWrap.hidden) return;
    (await data.restaurantMembers(rSel.value)).forEach((m) =>
      who.append(h('option', { value: m.id }, m.full_name + (m.job_title ? ' — ' + m.job_title : ''))));
  };
  rSel.addEventListener('change', () => run(null, loadMembers));
  run(null, loadMembers);

  const form = h('form', { class: 'card', onSubmit: (e) => {
    e.preventDefault();
    run(form.querySelector('button[type=submit]'), async () => {
      await data.createTask({ restaurant_id: rSel.value, title: title.value.trim(),
        description: desc.value.trim() || null, due_at: fromInput(due.value), priority: prio.value,
        assigned_to: whoWrap.hidden ? null : (who.value || null) });
      toast('Tarefa criada.');
      onDone();
    });
  } },
    h('h2', {}, 'Nova tarefa'),
    h('label', { for: 't-rest' }, 'Restaurante'), rSel,
    h('label', { for: 't-title' }, 'Título'), title,
    h('label', { for: 't-desc' }, 'Descrição'), desc,
    whoWrap,
    h('label', { for: 't-due' }, 'Prazo'), due,
    h('label', { for: 't-prio' }, 'Prioridade'), prio,
    h('button', { class: 'btn full', type: 'submit' }, 'Criar tarefa'),
    h('button', { class: 'btn ghost full', type: 'button', onClick: onCancel }, 'Voltar'));
  return form;
}

/* ---------- Detalhe da tarefa ---------- */
async function taskDetail(id, ctx, back) {
  const t = await data.getTask(id);
  const me = ctx.profile.id;
  const canIn = (p) => ctx.canIn(t.restaurant_id, p);
  const open = OPEN.includes(t.status);
  const touch = t.assigned_to === me || t.created_by === me || canIn('editar_tarefas');
  const [comments, evidences, history] = await Promise.all([
    data.listComments(id), data.listEvidences(id), canIn('ver_historico') ? data.listHistory(id) : []]);
  const root = h('section');
  const reload = async () => root.replaceWith(await taskDetail(id, ctx, back));
  const sec = (title, ...kids) => h('div', { class: 'card' }, h('h3', {}, title), ...kids);

  const setStatus = (status, label, ghost) => h('button', { class: 'btn small' + (ghost ? ' ghost' : ''),
    onClick: (e) => run(e.target, async () => { await data.updateTask(id, { status }); reload(); }) }, label);
  const actions = [];
  if (touch && t.status === 'pendente') actions.push(setStatus('em_andamento', 'Iniciar'));
  if (touch && t.status === 'em_andamento') actions.push(setStatus('aguardando_validacao', 'Enviar para validação'));
  if (touch && open && canIn('concluir_tarefas')) actions.push(setStatus('concluida', 'Concluir'));
  if (open && canIn('cancelar_tarefas')) actions.push(h('button', { class: 'btn ghost small', onClick: (e) => {
    if (confirm('Cancelar esta tarefa?')) run(e.target, async () => { await data.updateTask(id, { status: 'cancelada' }); reload(); });
  } }, 'Cancelar tarefa'));
  if (!open && canIn('editar_tarefas')) actions.push(setStatus('pendente', 'Reabrir', true));

  // Alterar prazo, prioridade e responsável
  let editBox = null;
  if (open && (canIn('editar_tarefas') || t.created_by === me)) {
    const due = h('input', { type: 'datetime-local', value: toInput(t.due_at), 'aria-label': 'Prazo' });
    const prio = h('select', { 'aria-label': 'Prioridade' }, opts(PRIORITY, t.priority));
    const who = h('select', { 'aria-label': 'Responsável' }, h('option', { value: '' }, 'Sem responsável'));
    const canAssign = canIn('atribuir_tarefas');
    if (canAssign) data.restaurantMembers(t.restaurant_id).then((list) => list.forEach((m) =>
      who.append(h('option', { value: m.id, selected: m.id === t.assigned_to }, m.full_name)))).catch(() => {});
    editBox = h('details', { class: 'card' }, h('summary', {}, 'Alterar prazo, prioridade ou responsável'),
      h('label', {}, 'Prazo'), due, h('label', {}, 'Prioridade'), prio,
      canAssign && [h('label', {}, 'Responsável'), who],
      h('button', { class: 'btn full', onClick: (e) => run(e.target, async () => {
        const fields = {};
        if (ms(fromInput(due.value)) !== ms(t.due_at)) fields.due_at = fromInput(due.value);
        if (prio.value !== t.priority) fields.priority = prio.value;
        if (canAssign && (who.value || null) !== t.assigned_to) fields.assigned_to = who.value || null;
        if (!Object.keys(fields).length) return toast('Nada para salvar.');
        await data.updateTask(id, fields); toast('Tarefa atualizada.'); reload();
      }) }, 'Salvar alterações'));
  }

  // Fotos
  const photos = h('div', { class: 'photos' });
  for (const ev of evidences) {
    const img = h('img', { alt: 'Foto da tarefa', loading: 'lazy' });
    photos.append(h('figure', { class: 'photo' }, img, h('figcaption', { class: 'muted' },
      `${ev.author?.full_name || '—'} · ${fmt(ev.created_at)}${ev.retention_class !== 'comum' ? ' · ' + RET[ev.retention_class] : ''}`)));
    data.signedUrl(ev.storage_path).then((u) => { img.src = u; img.onclick = () => window.open(u, '_blank'); })
      .catch(() => { img.alt = 'Foto removida ou indisponível'; });
  }
  let upload = null;
  if (open && canIn('anexar_fotos')) {
    const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Foto' });
    const nc = h('select', { 'aria-label': 'Tipo de registro' },
      h('option', { value: 'comum' }, 'Foto comum'),
      h('option', { value: 'nao_conformidade' }, 'Não conformidade (guarda por mais tempo)'),
      ctx.profile.is_admin && h('option', { value: 'critico' }, 'Registro crítico (não expira)'));
    upload = h('div', {}, file,
      nc,
      h('button', { class: 'btn small', onClick: (e) => run(e.target, async () => {
        if (!file.files[0]) return toast('Escolha uma foto.', true);
        const blob = await compressImage(file.files[0]);
        await data.uploadEvidence(t, blob, nc.value, file.files[0].name);
        toast('Foto enviada.'); reload();
      }) }, 'Enviar foto'));
  }

  // Comentários
  const text = h('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'Comentário', placeholder: 'Escreva um comentário' });
  const commentForm = h('div', {}, text, h('button', { class: 'btn small', onClick: (e) => run(e.target, async () => {
    if (!text.value.trim()) return;
    await data.addComment(id, text.value.trim()); reload();
  }) }, 'Comentar'));

  const histDetail = (e) => {
    const d = e.details || {};
    if (e.action === 'status_alterado') return `${STATUS[d.de]} → ${STATUS[d.para]}`;
    if (e.action === 'responsavel_alterado') return `${d.de || 'ninguém'} → ${d.para || 'ninguém'}`;
    if (e.action === 'prazo_alterado') return `${fmt(d.de)} → ${fmt(d.para)}`;
    if (e.action === 'prioridade_alterada') return `${PRIORITY[d.de]} → ${PRIORITY[d.para]}`;
    return '';
  };

  root.append(
    h('button', { class: 'link', onClick: back }, '← Voltar'),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, t.title), badge(t)),
      t.description && h('p', {}, t.description),
      h('p', { class: 'muted' }, `${t.restaurant?.name || ''} · Prioridade ${PRIORITY[t.priority].toLowerCase()}`),
      h('p', { class: 'muted' }, `Criada por ${t.creator?.full_name || 'administrador'} em ${fmt(t.created_at)}`),
      h('p', { class: 'muted' }, `Responsável: ${t.assignee?.full_name || 'ninguém'} · Prazo: ${fmt(t.due_at)}`),
      t.completed_at && h('p', { class: 'muted' }, 'Concluída em ' + fmt(t.completed_at)),
      actions.length > 0 && h('div', { class: 'row gap' }, actions)),
    editBox,
    sec('Fotos', evidences.length ? photos : h('p', { class: 'muted' }, 'Nenhuma foto ainda.'), upload),
    sec('Comentários',
      comments.length ? comments.map((c) => h('p', {}, h('strong', {}, (c.author?.full_name || 'Administrador') + ' '),
        h('span', { class: 'muted' }, fmt(c.created_at)), h('br'), c.body)) : h('p', { class: 'muted' }, 'Nenhum comentário.'),
      commentForm),
    canIn('ver_historico') && sec('Histórico', history.map((e) => h('p', { class: 'muted' },
      `${fmt(e.created_at)} · ${e.author?.full_name || 'Administrador'} · ${HIST[e.action] || e.action}`,
      histDetail(e) && ' (' + histDetail(e) + ')'))));
  return root;
}
