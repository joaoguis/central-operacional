import { sb } from './supabase.js';
import * as auth from './auth.js';
import * as data from './data.js';
import { toast } from './ui.js';
import { runBackgroundJobs } from './jobs.js';
import { renderLogin, renderRecovery, renderPending, renderShell } from './views.js';

const logout = async () => { await auth.signOut(); renderLogin({ onSession: enter }); };

async function enter() {
  try {
    const profile = await data.getMyProfile();
    if (!profile || profile.status !== 'ativo') {
      return renderPending(profile, { onRefresh: enter, onLogout: logout });
    }
    await renderShell(profile, { onLogout: logout });
    runBackgroundJobs(profile);
  } catch (e) {
    toast(e.message || 'Erro ao carregar.', true);
    renderLogin({ onSession: enter });
  }
}

async function boot() {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') renderLogin({ onSession: enter });
  });
  if (location.hash.includes('type=recovery')) return renderRecovery({ onDone: enter });
  const session = await auth.getSession();
  if (!session) return renderLogin({ onSession: enter });
  await enter();
}

boot();
