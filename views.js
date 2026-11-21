import { h, mount, toast, run } from './ui.js';
import * as auth from './auth.js';
import * as data from './data.js';

/* ---------- Login / cadastro / recuperação ---------- */
export function renderLogin({ onSession }) {
  let signup = false;
  const draw = () => {
    const name = h('input', { id: 'name', autocomplete: 'name', required: true });
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'email', required: true });
    const pass = h('input', { id: 'pass', type: 'password', minlength: 8, required: true,
      autocomplete: signup ? 'new-password' : 'current-password' });
    const form = h('form', { class: 'card', onSubmit: (e) => {
      e.preventDefault();
      run(form.querySelector('button[type=submit]'), async () => {
        if (signup) {
          const d = await auth.signUp(email.value.trim(), pass.value, name.value.trim());
          if (d.session) return onSession();
          toast('Conta criada. Confirme o e-mail e peça a liberação ao administrador.');
          signup = false; draw();
        } else {
          await auth.signIn(email.value.trim(), pass.value);
          onSession();
        }
      });
    } },
      signup && [h('label', { for: 'name' }, 'Nome completo'), name],
      h('label', { for: 'email' }, 'E-mail'), email,
      h('label', { for: 'pass' }, 'Senha (mínimo 8 caracteres)'), pass,
      h('button', { class: 'btn full', type: 'submit' }, signup ? 'Criar conta' : 'Entrar'),
      h('div', { class: 'row between' },
        h('button', { class: 'link', type: 'button', onClick: () => { signup = !signup; draw(); } },
          signup ? 'Já tenho conta' : 'Criar conta'),
        !signup && h('button', { class: 'link', type: 'button', onClick: (e) => {
          if (!email.value.trim()) return toast('Digite seu e-mail primeiro.', true);
          run(e.target, async () => {
            await auth.sendRecovery(email.value.trim());
            toast('Enviamos o link para redefinir a senha.');
          });
        } }, 'Esqueci a senha')));
    mount(h('div', { class: 'auth' }, h('h1', {}, 'Central Operacional'),
      h('p', { class: 'muted' }, 'Entre com seu login individual.'), form));
  };
  draw();
}

export function renderRecovery({ onDone }) {
  const pass = h('input', { id: 'np', type: 'password', minlength: 8, required: true, autocomplete: 'new-password' });
  const form = h('form', { class: 'card', onSubmit: (e) => {
    e.preventDefault();
    run(form.querySelector('button'), async () => {
      await auth.setNewPassword(pass.value);
      toast('Senha atualizada.');
      history.replaceState(null, '', location.pathname);
      onDone();
    });
  } },
    h('label', { for: 'np' }, 'Nova senha (mínimo 8 caracteres)'), pass,
    h('button', { class: 'btn full', type: 'submit' }, 'Salvar senha'));
  mount(h('div', { class: 'auth' }, h('h1', {}, 'Nova senha'), form));
}

export function renderPending(profile, { onRefresh, onLogout }) {
  const msg = profile?.status === 'inativo'
    ? 'Sua conta está inativa. Fale com o administrador.'
    : 'Seu cadastro aguarda liberação do administrador.';
  mount(h('div', { class: 'auth' }, h('h1', {}, 'Quase lá'),
    h('p', {}, msg),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onClick: (e) => run(e.target, onRefresh) }, 'Verificar de novo'),
      h('button', { class: 'btn ghost', onClick: onLogout }, 'Sair'))));
}

/* ---------- App ---------- */
export async function renderShell(profile, { onLogout }) {
  const access = await data.getMyAccess();
  const perms = new Set(access.flatMap((m) => (m.roles?.role_permissions || []).map((p) => p.permission_code)));
  const can = (p) => profile.is_admin || perms.has(p);

  const tabs = [
    { id: 'home', label: 'Início', view: viewHome },
    { id: 'rest', label: 'Ambientes', view: viewRestaurants },
    can('gerenciar_usuarios') && { id: 'users', label: 'Usuários', view: viewUsers },
  ].filter(Boolean);

  const content = h('main');
  const nav = h('nav', { class: 'nav' });
  const go = async (id) => {
    nav.querySelectorAll('button').forEach((b) => {
      if (b.dataset.id === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    content.replaceChildren(h('p', { class: 'muted' }, 'Carregando…'));
    try { content.replaceChildren(await tabs.find((t) => t.id === id).view({ profile, can })); }
    catch (e) { content.replaceChildren(h('p', {}, 'Não foi possível carregar: ' + e.message)); }
  };
  tabs.forEach((t) => nav.append(h('button', { 'data-id': t.id, onClick: () => go(t.id) }, t.label)));

  mount(
    h('header', { class: 'topbar' }, h('strong', {}, 'Central Operacional'),
      h('div', { class: 'row' }, h('span', {}, profile.full_name),
        h('button', { class: 'btn ghost small', onClick: onLogout }, 'Sair'))),
    content, nav);
  go('home');
}

async function viewHome({ profile }) {
  const [rests, access] = await Promise.all([data.listRestaurants(), data.getMyAccess()]);
  const rolesBy = (rid) => access.filter((a) => a.restaurant_id === rid).map((a) => a.roles?.name).filter(Boolean);
  return h('section', {},
    h('h2', {}, profile.is_admin ? 'Todas as unidades' : 'Meus ambientes'),
    rests.length === 0 && h('p', { class: 'muted' }, 'Você ainda não está vinculado a nenhum restaurante. Peça ao administrador.'),
    rests.map((r) => h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, r.name), !r.active && h('span', { class: 'badge inativo' }, 'inativo')),
      h('p', { class: 'muted' }, rolesBy(r.id).join(', ') || (profile.is_admin ? 'Administrador geral' : '')))),
    h('p', { class: 'muted' }, 'Tarefas e painel chegam nas próximas fases.'));
}

async function viewRestaurants({ profile }) {
  const root = h('section', {}, h('h2', {}, 'Ambientes'));
  const list = h('div');
  const draw = (items) => list.replaceChildren(...items.map((r) => h('div', { class: 'card row between' },
    h('div', {}, h('h3', {}, r.name), !r.active && h('span', { class: 'badge inativo' }, 'inativo')),
    profile.is_admin && h('button', { class: 'btn ghost small', onClick: (e) => run(e.target, async () => {
      await data.setRestaurantActive(r.id, !r.active);
      draw(await data.listRestaurants());
    }) }, r.active ? 'Desativar' : 'Reativar'))));
  draw(await data.listRestaurants());
  root.append(list);
  if (profile.is_admin) {
    const name = h('input', { id: 'rn', required: true, placeholder: 'Ex.: Restaurante 06', 'aria-label': 'Nome do ambiente' });
    const form = h('form', { class: 'card', onSubmit: (e) => {
      e.preventDefault();
      run(form.querySelector('button'), async () => {
        await data.createRestaurant(name.value.trim());
        name.value = '';
        draw(await data.listRestaurants());
        toast('Ambiente criado.');
      });
    } }, h('h3', {}, 'Novo ambiente'), name, h('button', { class: 'btn full', type: 'submit' }, 'Criar ambiente'));
    root.append(form);
  }
  return root;
}

async function viewUsers({ profile }) {
  const [profiles, rests, roles, ships] = await Promise.all([
    data.listProfiles(), data.listRestaurants(), data.listRoles(), data.listMemberships()]);
  const restName = Object.fromEntries(rests.map((r) => [r.id, r.name]));
  const roleName = Object.fromEntries(roles.map((r) => [r.id, r.name]));
  const root = h('section', {}, h('h2', {}, 'Usuários e permissões'));
  const refresh = async () => { root.replaceWith(await viewUsers({ profile })); };

  for (const p of profiles) {
    const mine = ships.filter((s) => s.user_id === p.id);
    const rSel = h('select', { 'aria-label': 'Restaurante' }, rests.map((r) => h('option', { value: r.id }, r.name)));
    const pSel = h('select', { 'aria-label': 'Perfil' }, roles.map((r) => h('option', { value: r.id }, r.name)));
    const edit = (field, label) => (e) => {
      const v = prompt(label, p[field] || '');
      if (v === null) return;
      run(e.target, async () => { await data.updateProfile(p.id, { [field]: v.trim() || null }); refresh(); });
    };
    const setStatus = (status) => (e) => run(e.target, async () => { await data.updateProfile(p.id, { status }); refresh(); });

    root.append(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, p.full_name || '(sem nome)'),
        h('span', { class: 'badge ' + p.status }, p.status)),
      h('p', { class: 'muted' }, [p.job_title || 'sem cargo', p.employee_id && ('ID ' + p.employee_id), p.is_admin && 'administrador geral']
        .filter(Boolean).join(' · ')),
      h('div', {}, mine.length === 0 && h('span', { class: 'muted' }, 'Sem vínculos'),
        mine.map((s) => h('span', { class: 'chip' }, `${restName[s.restaurant_id] || '?'}: ${roleName[s.role_id] || '?'}`,
          h('button', { 'aria-label': 'Remover vínculo', onClick: (e) => {
            if (confirm('Remover este vínculo?')) run(e.target, async () => { await data.removeMembership(s.id); refresh(); });
          } }, '×')))),
      rests.length > 0 && h('div', { class: 'row gap' }, rSel, pSel,
        h('button', { class: 'btn small', onClick: (e) => run(e.target, async () => {
          await data.addMembership(p.id, rSel.value, pSel.value); refresh();
        }) }, 'Vincular')),
      profile.is_admin && h('div', { class: 'row gap' },
        p.status !== 'ativo' && h('button', { class: 'btn small', onClick: setStatus('ativo') }, 'Ativar'),
        p.status === 'ativo' && p.id !== profile.id && h('button', { class: 'btn ghost small', onClick: setStatus('inativo') }, 'Desativar'),
        h('button', { class: 'btn ghost small', onClick: edit('job_title', 'Cargo') }, 'Cargo'),
        h('button', { class: 'btn ghost small', onClick: edit('employee_id', 'Identificação profissional') }, 'Identificação'),
        p.id !== profile.id && h('button', { class: 'btn ghost small', onClick: (e) =>
          run(e.target, async () => { await data.updateProfile(p.id, { is_admin: !p.is_admin }); refresh(); }) },
          p.is_admin ? 'Remover admin' : 'Tornar admin'))));
  }
  return root;
}
