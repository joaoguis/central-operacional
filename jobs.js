// Rotinas em segundo plano (grátis: rodam quando alguém abre o app)
import * as data from './data.js';

const due = (key, hours) => {
  try {
    if (Date.now() - Number(localStorage.getItem(key) || 0) < hours * 3600e3) return false;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* sem localStorage: roda sempre */ }
  return true;
};

export async function runBackgroundJobs(profile) {
  try { if (due('job-rotinas', 1)) await data.runRecurring(); } catch { /* ignora */ }
  try {
    if (profile.is_admin && due('job-retencao', 12)) {
      const rows = await data.expiredEvidences();
      if (rows.length) await data.purgeEvidences(rows);
    }
  } catch { /* ignora */ }
}
