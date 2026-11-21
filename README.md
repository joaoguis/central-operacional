# Central Operacional — Fase 1

Front: HTML/CSS/JS puro (GitHub Pages). Backend: Supabase Free.

## Passo a passo
1. **Supabase**: crie um projeto em supabase.com (sem cartão).
2. **Banco**: SQL Editor → cole `supabase/schema.sql` → Run.
3. **Auth**: Authentication → URL Configuration → *Site URL* = endereço do seu GitHub Pages
   (ex.: `https://usuario.github.io/central-operacional/`). Opcional nesta fase: desligar
   "Confirm email" para agilizar testes.
4. **Chaves**: Project Settings → API → copie *Project URL* e a chave **anon public** para `js/config.js`.
   Nunca use a `service_role` no front.
5. **GitHub**: crie o repositório, envie estes arquivos, Settings → Pages → branch `main` / root.
6. **Primeiro admin**: crie sua conta no app e rode no SQL Editor o `update` do fim do `schema.sql`.
7. Novos usuários se cadastram, ficam "pendente" e você ativa e vincula aos restaurantes em *Usuários*.

## Limites do plano gratuito (verificados em nov/2026)
Banco 500 MB · arquivos 1 GB · egress 5 GB · 50 mil MAU · projeto pausa após 7 dias sem uso.
Sem backup diário: exporte o banco de tempos em tempos.

## Segurança
Toda regra de acesso está nas políticas RLS (`schema.sql`); a interface só esconde botões.
Usuário comum não consegue mudar o próprio status, cargo ou flag de admin (trigger `guard_profile`).
