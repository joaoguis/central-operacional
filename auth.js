import { sb } from './supabase.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export const signIn = (email, password) =>
  sb.auth.signInWithPassword({ email, password }).then(must);

export const signUp = (email, password, fullName) =>
  sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } }).then(must);

export const signOut = () => sb.auth.signOut();

export const sendRecovery = (email) =>
  sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(must);

export const setNewPassword = async (password) => {
  await sb.auth.getSession();
  return sb.auth.updateUser({ password }).then(must);
};

export const getSession = () => sb.auth.getSession().then(must).then((d) => d.session);
