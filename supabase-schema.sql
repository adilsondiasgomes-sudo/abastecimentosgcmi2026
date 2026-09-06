-- Aplicar uma vez no projeto rattnvysckapxyenhbfu.
begin;
create table public.frota_acessos (
  email text primary key,
  ativo boolean not null default true
);
insert into public.frota_acessos(email) values ('recursoshumanosgcmi@gmail.com');
alter table public.frota_acessos enable row level security;
revoke all on public.frota_acessos from anon, authenticated;
create function public.frota_autorizado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.frota_acessos a
    join auth.users u on lower(u.email)=a.email
    where u.id=auth.uid() and u.email_confirmed_at is not null and a.ativo);
$$;
revoke all on function public.frota_autorizado() from public;
grant execute on function public.frota_autorizado() to authenticated;

create table public.frota_estado (
  id integer primary key check(id=1),
  dados jsonb not null,
  revisao bigint not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
alter table public.frota_estado enable row level security;
revoke all on public.frota_estado from anon, authenticated;
grant select on public.frota_estado to authenticated;
create policy frota_ler_estado on public.frota_estado for select to authenticated using (public.frota_autorizado());
create table public.frota_historico (
  revisao bigint primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null,
  atualizado_por uuid
);
alter table public.frota_historico enable row level security;
revoke all on public.frota_historico from anon, authenticated;

create function public.frota_salvar(p_dados jsonb, p_revisao bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare atual bigint;
begin
  if not public.frota_autorizado() then raise exception 'Acesso não autorizado'; end if;
  if jsonb_typeof(p_dados->'veiculos') is distinct from 'array'
    or jsonb_typeof(p_dados->'abastecimentos') is distinct from 'array'
    or p_dados ? '_comprovantes' then raise exception 'Dados inválidos'; end if;
  perform pg_advisory_xact_lock(20260906,1);
  select revisao into atual from public.frota_estado where id=1;
  if coalesce(atual,0)<>p_revisao then
    raise exception 'CONFLITO: outra sessão alterou os dados. Recarregue antes de continuar.';
  end if;
  insert into public.frota_historico select revisao,dados,atualizado_em,atualizado_por from public.frota_estado where id=1;
  insert into public.frota_estado(id,dados,revisao,atualizado_por)
    values(1,p_dados,coalesce(atual,0)+1,auth.uid())
    on conflict(id) do update set dados=excluded.dados,revisao=excluded.revisao,
      atualizado_em=now(),atualizado_por=excluded.atualizado_por;
  return coalesce(atual,0)+1;
end; $$;
revoke all on function public.frota_salvar(jsonb,bigint) from public;
grant execute on function public.frota_salvar(jsonb,bigint) to authenticated;

create table public.frota_comprovantes (
  id bigint generated always as identity primary key,
  abastecimento_id bigint,
  troca_oleo_id bigint,
  nome text not null,
  tipo text not null,
  tamanho bigint not null,
  data timestamptz not null default now(),
  caminho text not null unique,
  excluido boolean not null default false,
  criado_por uuid not null default auth.uid() references auth.users(id)
);
alter table public.frota_comprovantes enable row level security;
revoke all on public.frota_comprovantes from anon, authenticated;
grant select,insert on public.frota_comprovantes to authenticated;
grant update(excluido) on public.frota_comprovantes to authenticated;
grant usage on sequence public.frota_comprovantes_id_seq to authenticated;
create policy frota_ler_comprovantes on public.frota_comprovantes for select to authenticated using(public.frota_autorizado());
create policy frota_inserir_comprovantes on public.frota_comprovantes for insert to authenticated with check(public.frota_autorizado() and criado_por=auth.uid());
create policy frota_arquivar_comprovantes on public.frota_comprovantes for update to authenticated using(public.frota_autorizado()) with check(public.frota_autorizado());
insert into storage.buckets(id,name,public,file_size_limit)
  values('frota-comprovantes','frota-comprovantes',false,52428800);
create policy frota_arquivos_leitura on storage.objects for select to authenticated
  using(bucket_id='frota-comprovantes' and public.frota_autorizado());
create policy frota_arquivos_envio on storage.objects for insert to authenticated
  with check(bucket_id='frota-comprovantes' and public.frota_autorizado());
commit;
