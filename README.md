# Labirintul Comorii

Joc de programare pentru copii (7–10 ani), parte din Academia Eroilor Isteți: copilul scrie un program din blocuri care duce eroul la comoară.

Site static (HTML/CSS/JS, fără build). Progresul se salvează în browser (localStorage) și, dacă e configurat Supabase, se trimite online, ca profesorul să vadă rezultatele tuturor copiilor, de pe toate calculatoarele.

Panoul profesorului nu are buton pe ecranul copiilor: se deschide cu `#profesor` la finalul adresei (ex. https://cristofor-dev.github.io/labirintul-comorii/#profesor).

## Supabase (rezultate centralizate)

1. Creează un proiect pe supabase.com.
2. În SQL Editor, rulează tot fișierul `supabase/schema.sql`.
3. Tot acolo, setează parola profesorului (minim 8 caractere): `select public.set_teacher_password('parola-ta');`
4. Din Project Settings → API, copiază „Project URL” și cheia publică (Publishable / anon) în `js/config.js`.

Cheia publică nu are acces direct la tabele; site-ul folosește doar funcțiile din `schema.sql`. Pozele încărcate de copii rămân doar pe calculatorul lor. Fără configurare, jocul merge ca înainte, doar local.

- Rulare locală: `python3 -m http.server` în acest folder, apoi http://localhost:8000
- Verificare nivele: `node test/test-levels.js`; cod Python generat: `node test/test-python.js`
- La fiecare publicare, crește numărul `?v=` din `index.html`, ca browserele să ia fișierele noi.
