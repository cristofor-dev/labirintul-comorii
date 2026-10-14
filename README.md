# Labirintul Comorii

Joc de programare pentru copii (7–10 ani), parte din Academia Eroilor Isteți: copilul scrie un program din blocuri care duce eroul la comoară.

Site static (HTML/CSS/JS, fără build). Progresul se salvează doar în browser (localStorage).

- Rulare locală: `python3 -m http.server` în acest folder, apoi http://localhost:8000
- Verificare nivele: `node test/test-levels.js`; cod Python generat: `node test/test-python.js`
- La fiecare publicare, crește numărul `?v=` din `index.html`, ca browserele să ia fișierele noi.
