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
