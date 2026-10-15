-- Labirintul Comorii: rezultatele copiilor, centralizate în Supabase.
-- Rulează tot fișierul o dată în Supabase → SQL Editor. Se poate rula din nou fără probleme.
--
-- Cheia publică din site (js/config.js) NU are acces direct la tabele (RLS fără politici).
-- Site-ul lucrează doar prin funcțiile de mai jos:
--   • copiii: sync_student (trimite progresul) și get_student (îl ia pe alt calculator);
--   • profesorul: funcțiile teacher_*, care cer parola profesorului.
--
-- După rulare, setează parola profesorului (minim 8 caractere) tot din SQL Editor:
--   select public.set_teacher_password('parola-ta-aici');

create extension if not exists pgcrypto with schema extensions;

-- ===================== Tabele =====================

create table if not exists public.students (
  name       text primary key
             check (length(name) <= 40 and name ~ '^[A-Za-zĂÂÎȘȚăâîșțŞŢşţ]+(-[A-Za-zĂÂÎȘȚăâîșțŞŢşţ]+)*\.[A-Za-zĂÂÎȘȚăâîșțŞŢşţ]$'),
  avatar     jsonb check (avatar is null or length(avatar::text) <= 200),
  worlds     int[] not null default '{1}',
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create table if not exists public.results (
  name       text not null references public.students (name) on delete cascade on update cascade,
  level_id   int  not null check (level_id between 1 and 500),
  stars      int  not null check (stars between 0 and 3),
  blocks     int  not null check (blocks between 0 and 1000),
  program    jsonb check (program is null or length(program::text) <= 20000),
  done_at    timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (name, level_id)
);

create table if not exists public.teacher (
  id            int primary key default 1 check (id = 1),
  password_hash text not null
);

alter table public.students enable row level security;
alter table public.results  enable row level security;
alter table public.teacher  enable row level security;
revoke all on public.students, public.results, public.teacher from anon, authenticated;

-- ===================== Copii =====================

-- Profilul unui copil în forma folosită de site: { name, avatar, worlds, lastSeen, progress: { "3": {stars, blocks, program, done} } }
create or replace function public.get_student(p_name text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'avatar', s.avatar, 'worlds', to_jsonb(s.worlds),
    'created', s.created_at, 'lastSeen', s.last_seen,
    'progress', coalesce((
      select jsonb_object_agg(r.level_id::text, jsonb_build_object(
        'stars', r.stars, 'blocks', r.blocks, 'program', r.program, 'done', r.done_at))
      from public.results r where r.name = s.name), '{}'::jsonb))
  from public.students s where s.name = p_name
$$;

-- Primește tot progresul copilului și îl unește cu ce e deja salvat:
-- păstrează cele mai multe stele, cel mai scurt program și prima dată când a terminat nivelul.
-- Lumile deschise nu se schimbă de aici; le deschide doar profesorul.
create or replace function public.sync_student(p_name text, p_avatar jsonb, p_progress jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then p_progress := '{}'; end if;
  if (select count(*) from jsonb_object_keys(p_progress)) > 500 then
    raise exception 'Prea multe nivele.';
  end if;

  insert into public.students as s (name, avatar) values (p_name, p_avatar)
  on conflict (name) do update set avatar = coalesce(excluded.avatar, s.avatar), last_seen = now();

  for k, v in select key, value from jsonb_each(p_progress) loop
    insert into public.results as r (name, level_id, stars, blocks, program, done_at)
    values (p_name, k::int, (v->>'stars')::int, (v->>'blocks')::int, v->'program',
            least(coalesce((v->>'done')::timestamptz, now()), now()))
    on conflict (name, level_id) do update set
      stars      = greatest(r.stars, excluded.stars),
      blocks     = least(r.blocks, excluded.blocks),
      program    = case when excluded.stars > r.stars or (excluded.stars = r.stars and excluded.blocks <= r.blocks)
                        then excluded.program else r.program end,
      done_at    = least(r.done_at, excluded.done_at),
      updated_at = case when excluded.stars > r.stars or excluded.blocks < r.blocks then now() else r.updated_at end;
  end loop;
end $$;

-- ===================== Profesor =====================

create or replace function public.teacher_check(p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.teacher t where t.password_hash = crypt(coalesce(p_password, ''), t.password_hash)) then
    perform pg_sleep(1); -- încetinește ghicitul parolei
    raise exception 'Parolă greșită.' using errcode = '28P01';
  end if;
end $$;

-- Doar din SQL Editor (nu e disponibilă din site).
create or replace function public.set_teacher_password(p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_new, '')) < 8 then raise exception 'Parola trebuie să aibă cel puțin 8 caractere.'; end if;
  insert into public.teacher (id, password_hash) values (1, crypt(p_new, gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
end $$;

create or replace function public.teacher_change_password(p_password text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.teacher_check(p_password);
  perform public.set_teacher_password(p_new);
end $$;

-- Toți copiii, ca obiect { "Ana.P": profil, ... }
create or replace function public.teacher_students(p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.teacher_check(p_password);
  return coalesce((select jsonb_object_agg(s.name, public.get_student(s.name)) from public.students s), '{}'::jsonb);
end $$;

create or replace function public.teacher_set_world(p_password text, p_name text, p_world int, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.teacher_check(p_password);
  update public.students set worlds = case
      when p_open then (select array_agg(distinct w order by w) from unnest(worlds || p_world) w)
      when p_world = 1 then worlds
      else array_remove(worlds, p_world) end
  where p_name is null or name = p_name;
end $$;

create or replace function public.teacher_delete_student(p_password text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.teacher_check(p_password);
  delete from public.students where name = p_name;
end $$;

-- ===================== Drepturi =====================

revoke all on function
  public.get_student(text), public.sync_student(text, jsonb, jsonb),
  public.teacher_check(text), public.set_teacher_password(text), public.teacher_change_password(text, text),
  public.teacher_students(text), public.teacher_set_world(text, text, int, boolean), public.teacher_delete_student(text, text)
from public, anon, authenticated;

grant execute on function
  public.get_student(text), public.sync_student(text, jsonb, jsonb),
  public.teacher_change_password(text, text), public.teacher_students(text),
  public.teacher_set_world(text, text, int, boolean), public.teacher_delete_student(text, text)
to anon, authenticated;
