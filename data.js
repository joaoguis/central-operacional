// Acesso aos dados. Toda segurança real está nas políticas RLS do banco.
import { sb } from './supabase.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export const getMyProfile = async () => {
  const { data: { user } } = await sb.auth.getUser();
  return must(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
};

// Vínculos do usuário logado, com as permissões de cada perfil
export const getMyAccess = async () =>
  must(await sb.from('memberships')
    .select('restaurant_id, user_id, roles(name, role_permissions(permission_code))')
    .eq('user_id', (await sb.auth.getUser()).data.user.id));

export const listRestaurants = async () =>
  must(await sb.from('restaurants').select('*').order('name'));

export const createRestaurant = async (name) =>
  must(await sb.from('restaurants').insert({ name }).select().single());

export const setRestaurantActive = async (id, active) =>
  must(await sb.from('restaurants').update({ active }).eq('id', id));

export const listProfiles = async () =>
  must(await sb.from('profiles').select('*').order('full_name'));

export const updateProfile = async (id, fields) =>
  must(await sb.from('profiles').update(fields).eq('id', id));

export const listRoles = async () =>
  must(await sb.from('roles').select('*').order('name'));

export const listMemberships = async () =>
  must(await sb.from('memberships').select('id, user_id, restaurant_id, role_id'));

export const addMembership = async (user_id, restaurant_id, role_id) =>
  must(await sb.from('memberships').insert({ user_id, restaurant_id, role_id }));

export const removeMembership = async (id) =>
  must(await sb.from('memberships').delete().eq('id', id));

/* ---------- Fase 2: tarefas ---------- */
const TASK_SELECT = '*, restaurant:restaurants(name), creator:profiles!created_by(full_name), assignee:profiles!assigned_to(full_name)';

export const listTasks = async () =>
  must(await sb.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false }).limit(300));

export const getTask = async (id) =>
  must(await sb.from('tasks').select(TASK_SELECT).eq('id', id).single());

export const createTask = async (fields) =>
  must(await sb.from('tasks').insert(fields).select().single());

export const updateTask = async (id, fields) =>
  must(await sb.from('tasks').update(fields).eq('id', id));

export const restaurantMembers = async (rid) =>
  must(await sb.rpc('restaurant_members', { rid }));

export const listComments = async (id) =>
  must(await sb.from('task_comments').select('*, author:profiles!user_id(full_name)')
    .eq('task_id', id).order('created_at'));

export const addComment = async (task_id, body) =>
  must(await sb.from('task_comments').insert({ task_id, body }));

export const listEvidences = async (id) =>
  must(await sb.from('task_evidences').select('*, author:profiles!uploaded_by(full_name)')
    .eq('task_id', id).order('created_at'));

export const uploadEvidence = async (task, blob, retention_class, file_name) => {
  const path = `${task.restaurant_id}/${task.id}/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from('evidencias').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  must(await sb.from('task_evidences').insert({
    task_id: task.id, storage_path: path, file_name: (file_name || '').slice(0, 120),
    mime_type: 'image/jpeg', size_bytes: blob.size, retention_class }));
};

export const signedUrl = async (path) => {
  const { data, error } = await sb.storage.from('evidencias').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
};

export const listHistory = async (id) =>
  must(await sb.from('task_history').select('*, author:profiles!user_id(full_name)')
    .eq('task_id', id).order('created_at', { ascending: false }));

/* ---------- Fases 3 e 4: painel, configurações, rotinas, retenção ---------- */
export const dashboard = async (rid) => must(await sb.rpc('dashboard', { rid: rid || null }));

export const countMyOpen = async (uid) => {
  const { count, error } = await sb.from('tasks').select('id', { count: 'exact', head: true })
    .eq('assigned_to', uid).in('status', ['pendente', 'em_andamento', 'aguardando_validacao']);
  if (error) throw error;
  return count || 0;
};

export const listSettings = async () => must(await sb.from('app_settings').select('*'));
export const setSetting = async (key, value) =>
  must(await sb.from('app_settings').upsert({ key, value: String(value) }));

export const listTemplates = async () =>
  must(await sb.from('task_templates').select('*').order('created_at', { ascending: false }));
export const createTemplate = async (fields) => must(await sb.from('task_templates').insert(fields));
export const setTemplateActive = async (id, active) =>
  must(await sb.from('task_templates').update({ active }).eq('id', id));
export const runRecurring = async () => must(await sb.rpc('generate_recurring_tasks'));

export const expiredEvidences = async () =>
  must(await sb.from('task_evidences').select('id, storage_path')
    .not('expires_at', 'is', null).lt('expires_at', new Date().toISOString()).limit(500));

export const purgeEvidences = async (rows) => {
  const r = await sb.storage.from('evidencias').remove(rows.map((x) => x.storage_path));
  if (r.error) throw r.error;
  must(await sb.from('task_evidences').delete().in('id', rows.map((x) => x.id)));
};

const pages = async (table) => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const part = must(await sb.from(table).select('*').order('id').range(from, from + 999));
    rows.push(...part);
    if (part.length < 1000) return rows;
  }
};
export const exportAll = async () => {
  const out = { exportado_em: new Date().toISOString() };
  for (const t of ['restaurants', 'profiles', 'roles', 'permissions', 'role_permissions', 'memberships',
    'task_templates', 'app_settings']) out[t] = must(await sb.from(t).select('*'));
  for (const t of ['tasks', 'task_comments', 'task_evidences', 'task_history']) out[t] = await pages(t);
  return out;
};
