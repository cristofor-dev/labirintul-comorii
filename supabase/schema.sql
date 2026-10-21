-- Labirintul Comorii: rezultatele copiilor, centralizate în Supabase.
-- Rulează tot fișierul o dată în Supabase → SQL Editor. Se poate rula din nou fără probleme.
--
-- Cheia publică din site (js/config.js) NU are acces direct la tabele (RLS fără politici).
-- Site-ul lucrează doar prin funcțiile de mai jos:
--   • copiii: sync_student (trimite progresul) și get_student (îl ia pe alt calculator);
--   • personalul: funcțiile teacher_* și admin_*, care cer utilizator + parolă.
--
-- Doi tipuri de conturi:
--   • administratorul (utilizator „admin”): vede toate clasele, creează clase și profesori,
--     pune copiii în clase. Parola lui se setează din SQL Editor, după rulare (minim 8 caractere):
--       select public.set_teacher_password('parola-ta-aici');
--   • profesorii (creați de administrator din site): văd rezultatele doar pentru clasele lor.

create extension if not exists pgcrypto with schema extensions;

-- ===================== Tabele =====================

create table if not exists public.classes (
  id   serial primary key,
  name text not null check (length(btrim(name)) between 1 and 40)
);
create unique index if not exists classes_name_key on public.classes (lower(name));

create table if not exists public.teachers (
  id            serial primary key,
  name          text not null check (length(btrim(name)) between 1 and 40),
  password_hash text not null
);
create unique index if not exists teachers_name_key on public.teachers (lower(name));

create table if not exists public.class_teachers (
  class_id   int not null references public.classes (id)  on delete cascade,
  teacher_id int not null references public.teachers (id) on delete cascade,
  primary key (class_id, teacher_id)
);

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

-- clasa copilului (una singură; fără clasă = null). Dacă se șterge clasa, copilul rămâne fără clasă.
alter table public.students add column if not exists class_id int references public.classes (id) on delete set null;

alter table public.students       enable row level security;
alter table public.results        enable row level security;
alter table public.teacher        enable row level security;
alter table public.classes        enable row level security;
alter table public.teachers       enable row level security;
alter table public.class_teachers enable row level security;
revoke all on public.students, public.results, public.teacher,
              public.classes, public.teachers, public.class_teachers from anon, authenticated;

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

-- ===================== Personal (administrator + profesori) =====================

-- Funcțiile vechi, cu o singură parolă, sunt înlocuite de cele de mai jos.
drop function if exists public.teacher_check(text);
drop function if exists public.teacher_change_password(text, text);
drop function if exists public.teacher_students(text);
drop function if exists public.teacher_set_world(text, text, int, boolean);
drop function if exists public.teacher_delete_student(text, text);

-- Verifică utilizatorul și parola. Întoarce 0 pentru administrator, altfel id-ul profesorului.
-- Utilizator gol sau „admin” = administratorul.
create or replace function public.staff_check(p_user text, p_password text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  tid int;
begin
  if lower(btrim(coalesce(p_user, ''))) in ('', 'admin') then
    if exists (select 1 from public.teacher t where t.password_hash = crypt(coalesce(p_password, ''), t.password_hash)) then
      return 0;
    end if;
  else
    select t.id into tid from public.teachers t
    where lower(t.name) = lower(btrim(p_user)) and t.password_hash = crypt(coalesce(p_password, ''), t.password_hash);
    if tid is not null then return tid; end if;
  end if;
  perform pg_sleep(1); -- încetinește ghicitul parolei
  raise exception 'Utilizator sau parolă greșită.' using errcode = '28P01';
end $$;

create or replace function public.admin_check(p_user text, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.staff_check(p_user, p_password) <> 0 then
    raise exception 'Doar administratorul poate face asta.' using errcode = '42501';
  end if;
end $$;

-- Administratorul vede totul; profesorul doar clasele lui (clasa null = fără clasă, vizibilă doar administratorului).
create or replace function public.staff_can_see(p_tid int, p_class int)
returns boolean language sql stable security definer set search_path = public as $$
  select p_tid = 0 or exists (select 1 from public.class_teachers ct where ct.teacher_id = p_tid and ct.class_id = p_class)
$$;

-- Doar din SQL Editor (nu e disponibilă din site): parola administratorului.
create or replace function public.set_teacher_password(p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_new, '')) < 8 then raise exception 'Parola trebuie să aibă cel puțin 8 caractere.'; end if;
  insert into public.teacher (id, password_hash) values (1, crypt(p_new, gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
end $$;

create or replace function public.staff_change_password(p_user text, p_password text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  tid int := public.staff_check(p_user, p_password);
begin
  if length(coalesce(p_new, '')) < 8 then raise exception 'Parola trebuie să aibă cel puțin 8 caractere.'; end if;
  if tid = 0 then
    perform public.set_teacher_password(p_new);
  else
    update public.teachers set password_hash = crypt(p_new, gen_salt('bf')) where id = tid;
  end if;
end $$;

-- Tot ce trebuie panoului: rolul, clasele vizibile, profesorii (doar administrator) și copiii vizibili.
create or replace function public.staff_overview(p_user text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tid int := public.staff_check(p_user, p_password);
begin
  return jsonb_build_object(
    'role', case when tid = 0 then 'admin' else 'teacher' end,
    'name', case when tid = 0 then 'admin' else (select t.name from public.teachers t where t.id = tid) end,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'teacherIds', coalesce((select jsonb_agg(ct.teacher_id order by ct.teacher_id) from public.class_teachers ct where ct.class_id = c.id), '[]'::jsonb),
        'teachers', coalesce((select jsonb_agg(t.name order by t.name) from public.class_teachers ct
                              join public.teachers t on t.id = ct.teacher_id where ct.class_id = c.id), '[]'::jsonb))
        order by c.name)
      from public.classes c where public.staff_can_see(tid, c.id)), '[]'::jsonb),
    'teachers', case when tid = 0 then coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name) from public.teachers t), '[]'::jsonb)
      else '[]'::jsonb end,
    'students', coalesce((
      select jsonb_object_agg(s.name, public.get_student(s.name) || jsonb_build_object('classId', s.class_id))
      from public.students s where public.staff_can_see(tid, s.class_id)), '{}'::jsonb));
end $$;

-- Deschide/închide o misiune. p_name = un copil; p_class = o clasă (-1 = copiii fără clasă, null = toate clasele vizibile).
create or replace function public.teacher_set_world(p_user text, p_password text, p_name text, p_world int, p_open boolean, p_class int)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid int := public.staff_check(p_user, p_password);
begin
  update public.students set worlds = case
      when p_open then (select array_agg(distinct w order by w) from unnest(worlds || p_world) w)
      when p_world = 1 then worlds
      else array_remove(worlds, p_world) end
  where (p_name is null or name = p_name)
    and (p_class is null or (p_class = -1 and class_id is null) or class_id = p_class)
    and public.staff_can_see(tid, class_id);
end $$;

create or replace function public.teacher_delete_student(p_user text, p_password text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_user, p_password);
  delete from public.students where name = p_name;
end $$;

-- ===================== Administrator: clase, profesori, copii =====================

create or replace function public.admin_save_class(p_user text, p_password text, p_id int, p_name text)
returns int language plpgsql security definer set search_path = public as $$
declare
  cid int;
begin
  perform public.admin_check(p_user, p_password);
  if p_id is null then
    insert into public.classes (name) values (btrim(p_name)) returning id into cid;
  else
    update public.classes set name = btrim(p_name) where id = p_id returning id into cid;
  end if;
  return cid;
exception when unique_violation then
  raise exception 'Există deja o clasă cu numele acesta.';
end $$;

create or replace function public.admin_delete_class(p_user text, p_password text, p_id int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_user, p_password);
  delete from public.classes where id = p_id;
end $$;

-- Profesor nou (fără id, cu parolă) sau schimbat (cu id; parola se schimbă doar dacă e completată).
create or replace function public.admin_save_teacher(p_user text, p_password text, p_id int, p_name text, p_new_password text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  tid int;
begin
  perform public.admin_check(p_user, p_password);
  if lower(btrim(coalesce(p_name, ''))) in ('', 'admin') then raise exception 'Numele profesorului nu este valid.'; end if;
  if p_id is null or coalesce(p_new_password, '') <> '' then
    if length(coalesce(p_new_password, '')) < 8 then raise exception 'Parola trebuie să aibă cel puțin 8 caractere.'; end if;
  end if;
  if p_id is null then
    insert into public.teachers (name, password_hash) values (btrim(p_name), crypt(p_new_password, gen_salt('bf'))) returning id into tid;
  else
    update public.teachers set name = btrim(p_name),
        password_hash = case when coalesce(p_new_password, '') <> '' then crypt(p_new_password, gen_salt('bf')) else password_hash end
    where id = p_id returning id into tid;
  end if;
  return tid;
exception when unique_violation then
  raise exception 'Există deja un profesor cu numele acesta.';
end $$;

create or replace function public.admin_delete_teacher(p_user text, p_password text, p_id int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_user, p_password);
  delete from public.teachers where id = p_id;
end $$;

-- Profesorii unei clase (înlocuiește lista de până acum).
create or replace function public.admin_set_class_teachers(p_user text, p_password text, p_class int, p_teachers int[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_user, p_password);
  delete from public.class_teachers where class_id = p_class;
  insert into public.class_teachers (class_id, teacher_id)
  select p_class, t.id from public.teachers t where t.id = any(coalesce(p_teachers, '{}'));
end $$;

-- Pune copiii în clasă (p_class null = îi scoate din clasă).
-- Misiunile deschise pentru toți colegii din clasă (în afară de p_except); fără colegi, doar prima.
create or replace function public.class_worlds(p_class int, p_except text[])
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.w order by x.w), '{1}') from (
    select distinct unnest(s.worlds) as w from public.students s
    where s.class_id = p_class and not s.name = any(coalesce(p_except, '{}'))) x
  where not exists (
    select 1 from public.students s2
    where s2.class_id = p_class and not s2.name = any(coalesce(p_except, '{}')) and not x.w = any(s2.worlds))
$$;

-- Copiii mutați sau adăugați într-o clasă primesc misiunile deschise deja colegilor.
create or replace function public.join_class_worlds(p_names text[], p_class int)
returns void language plpgsql security definer set search_path = public as $$
declare
  cw int[];
begin
  if p_class is null then return; end if;
  cw := public.class_worlds(p_class, p_names);
  update public.students set worlds = (select array_agg(distinct w order by w) from unnest(worlds || cw) w)
  where name = any(coalesce(p_names, '{}'));
end $$;

create or replace function public.admin_set_student_class(p_user text, p_password text, p_names text[], p_class int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_user, p_password);
  update public.students set class_id = p_class where name = any(coalesce(p_names, '{}'));
  perform public.join_class_worlds(p_names, p_class);
end $$;

-- Adaugă copii înainte să intre în joc (apar în clasă; când intră, își găsesc profilul).
create or replace function public.admin_add_students(p_user text, p_password text, p_names text[], p_class int)
returns int language plpgsql security definer set search_path = public as $$
declare
  n text;
  cnt int := 0;
begin
  perform public.admin_check(p_user, p_password);
  if coalesce(array_length(p_names, 1), 0) > 200 then raise exception 'Prea mulți copii deodată.'; end if;
  foreach n in array coalesce(p_names, '{}') loop
    insert into public.students as s (name, class_id) values (n, p_class)
    on conflict (name) do update set class_id = coalesce(excluded.class_id, s.class_id);
    cnt := cnt + 1;
  end loop;
  perform public.join_class_worlds(p_names, p_class);
  return cnt;
end $$;

-- ===================== Drepturi =====================

revoke all on function
  public.get_student(text), public.sync_student(text, jsonb, jsonb),
  public.staff_check(text, text), public.admin_check(text, text), public.staff_can_see(int, int),
  public.set_teacher_password(text), public.staff_change_password(text, text, text),
  public.staff_overview(text, text), public.teacher_set_world(text, text, text, int, boolean, int),
  public.teacher_delete_student(text, text, text),
  public.admin_save_class(text, text, int, text), public.admin_delete_class(text, text, int),
  public.admin_save_teacher(text, text, int, text, text), public.admin_delete_teacher(text, text, int),
  public.admin_set_class_teachers(text, text, int, int[]), public.admin_set_student_class(text, text, text[], int),
  public.admin_add_students(text, text, text[], int),
  public.class_worlds(int, text[]), public.join_class_worlds(text[], int)
from public, anon, authenticated;

grant execute on function
  public.get_student(text), public.sync_student(text, jsonb, jsonb),
  public.staff_change_password(text, text, text), public.staff_overview(text, text),
  public.teacher_set_world(text, text, text, int, boolean, int), public.teacher_delete_student(text, text, text),
  public.admin_save_class(text, text, int, text), public.admin_delete_class(text, text, int),
  public.admin_save_teacher(text, text, int, text, text), public.admin_delete_teacher(text, text, int),
  public.admin_set_class_teachers(text, text, int, int[]), public.admin_set_student_class(text, text, text[], int),
  public.admin_add_students(text, text, text[], int)
to anon, authenticated;
