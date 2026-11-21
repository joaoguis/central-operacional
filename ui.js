// Helpers de interface. Usa textContent (nunca innerHTML) para evitar XSS.
export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const mount = (...nodes) => $('#app').replaceChildren(...nodes);

let timer;
export function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(timer);
  timer = setTimeout(() => (t.className = ''), 3500);
}

// Executa uma ação com botão desabilitado (estado de carregamento) e erro tratado
export async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message || 'Algo deu errado. Tente de novo.', true); }
  finally { if (btn) btn.disabled = false; }
}
