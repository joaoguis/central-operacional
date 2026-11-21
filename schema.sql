-- CENTRAL OPERACIONAL — Fase 1 (fundação)
-- Rode inteiro no Supabase > SQL Editor. Pode rodar de novo sem quebrar o seed.

-- ============ TABELAS ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  employee_id text,
  job_title text,
  is_admin boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','ativo','inativo')),
  created_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  code text primary key,
  description text not null
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

-- Uma pessoa pode ter vários perfis no mesmo restaurante (permissões se acumulam)
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, restaurant_id, role_id)
);
create index if not exists memberships_restaurant_idx on public.memberships(restaurant_id);

-- ============ FUNÇÕES AUXILIARES (security definer evita recursão de RLS) ============
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and status = 'ativo' from profiles where id = auth.uid()), false)
$$;

create or replace function public.my_restaurants() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.restaurant_id from memberships m
  join profiles p on p.id = m.user_id
  where m.user_id = auth.uid() and p.status = 'ativo'
$$;

create or replace function public.my_colleagues() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct user_id from memberships
  where restaurant_id in (select public.my_restaurants())
$$;

create or replace function public.has_perm(rid uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from memberships m
    join profiles p on p.id = m.user_id and p.status = 'ativo'
    join role_permissions rp on rp.role_id = m.role_id
    where m.user_id = auth.uid() and m.restaurant_id = rid and rp.permission_code = perm
  )
$$;

-- ============ TRIGGERS ============
-- Cria o perfil (status "pendente") quando alguém se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuário comum não altera status, admin, cargo ou identificação (nem os próprios)
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.id is distinct from old.id
    or new.is_admin is distinct from old.is_admin
    or new.status is distinct from old.status
    or new.job_title is distinct from old.job_title
    or new.employee_id is distinct from old.employee_id
  ) then
    raise exception 'Sem permissão para alterar esses campos';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============ RLS ============
alter table public.profiles         enable row level security;
alter table public.restaurants      enable row level security;
alter table public.permissions      enable row level security;
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships      enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or id in (select public.my_colleagues()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- restaurants
drop policy if exists restaurants_select on public.restaurants;
create policy restaurants_select on public.restaurants for select to authenticated
  using (public.is_admin() or id in (select public.my_restaurants()));
drop policy if exists restaurants_insert on public.restaurants;
create policy restaurants_insert on public.restaurants for insert to authenticated
  with check (public.is_admin());
drop policy if exists restaurants_update on public.restaurants;
create policy restaurants_update on public.restaurants for update to authenticated
  using (public.has_perm(id, 'gerenciar_ambientes'))
  with check (public.has_perm(id, 'gerenciar_ambientes'));
drop policy if exists restaurants_delete on public.restaurants;
create policy restaurants_delete on public.restaurants for delete to authenticated
  using (public.is_admin());

-- permissions / roles / role_permissions: todos leem, só admin altera
do $$
declare t text;
begin
  foreach t in array array['permissions','roles','role_permissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_write', t);
  end loop;
end $$;

-- memberships
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.has_perm(restaurant_id, 'gerenciar_usuarios'));
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_perm(restaurant_id, 'gerenciar_usuarios'));
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_perm(restaurant_id, 'gerenciar_usuarios'))
  with check (public.has_perm(restaurant_id, 'gerenciar_usuarios'));
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_perm(restaurant_id, 'gerenciar_usuarios'));

-- ============ SEED (dados de referência, editáveis depois) ============
insert into public.permissions (code, description) values
  ('ver_tarefas','Visualizar tarefas'),
  ('criar_tarefas','Criar tarefas'),
  ('atribuir_tarefas','Atribuir tarefas'),
  ('editar_tarefas','Editar tarefas'),
  ('cancelar_tarefas','Excluir ou cancelar tarefas'),
  ('concluir_tarefas','Concluir tarefas'),
  ('anexar_fotos','Anexar fotografias'),
  ('ver_historico','Visualizar histórico'),
  ('gerenciar_usuarios','Gerenciar usuários'),
  ('gerenciar_ambientes','Gerenciar ambientes'),
  ('ver_indicadores','Visualizar indicadores')
on conflict (code) do nothing;

insert into public.roles (name, description) values
  ('Administrador geral','Acesso completo ao ambiente'),
  ('Gestor de unidade','Cria, distribui e acompanha tarefas da unidade'),
  ('Criador de tarefas','Cria e atribui tarefas'),
  ('Executor','Recebe, executa e conclui tarefas')
on conflict (name) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.name = 'Administrador geral'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.p from public.roles r
join (values
  ('Gestor de unidade','ver_tarefas'), ('Gestor de unidade','criar_tarefas'),
  ('Gestor de unidade','atribuir_tarefas'), ('Gestor de unidade','editar_tarefas'),
  ('Gestor de unidade','cancelar_tarefas'), ('Gestor de unidade','concluir_tarefas'),
  ('Gestor de unidade','anexar_fotos'), ('Gestor de unidade','ver_historico'),
  ('Gestor de unidade','ver_indicadores'),
  ('Criador de tarefas','ver_tarefas'), ('Criador de tarefas','criar_tarefas'),
  ('Criador de tarefas','atribuir_tarefas'),
  ('Executor','ver_tarefas'), ('Executor','concluir_tarefas'), ('Executor','anexar_fotos')
) as x(rn, p) on x.rn = r.name
on conflict do nothing;

insert into public.restaurants (name) values
  ('Restaurante 01'), ('Restaurante 02'), ('Restaurante 03'),
  ('Restaurante 04'), ('Restaurante 05')
on conflict (name) do nothing;

-- ============ PRIMEIRO ADMIN ============
-- 1) Crie sua conta pelo app. 2) Rode (trocando o e-mail):
--
-- update public.profiles set is_admin = true, status = 'ativo'
-- where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');
