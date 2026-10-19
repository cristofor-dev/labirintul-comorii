// Nivelele jocului, grupate pe misiuni. Hartă: '#' zid, '.' drum, 'S' start, 'T' comoară,
// 'P' bolovan (te lovești de el), 'L' lavă și 'A' apă (cazi în ele), 'B' pod.
// 'D' = linia unui desen-model (Misiunea 1, robotul desenator): în loc de comoară, eroul trebuie să
// treacă pe toate pătrățelele desenului fără să iasă din el.
// dir = direcția de start (0 sus, 1 dreapta, 2 jos, 3 stânga).
// Misiuni: în cod se numesc „world” (așa sunt salvate și online); number = numărul misiunii din
// parcursul Academiei. Ordinea din WORLDS / LEVELS e ordinea de pe hartă; numărul afișat al nivelului
// e poziția lui în LEVELS (id-urile rămân fixe, fiindcă progresul copiilor e salvat după id).
// available: false = misiunea e încă în lucru și nu apare pe hartă.
  // optimal = nr. de blocuri pentru 3 stele; maxBlocks = limita (null = fără limită).
// solution = soluția de referință (format compact, vezi Engine.fromCompact), verificată de test/test-levels.js.
(function (root) {
  'use strict';

  var WORLDS = [
    { id: 4, number: 1, name: 'Inginerul de instrucțiuni', color: '#ec4899', icon: '🤖', available: true,
      intro: 'Robotul desenator face exact ce îi spui, nu ce ai vrut să spui. Dă-i instrucțiuni clare, pas cu pas.' },
    { id: 1, number: 2, name: 'Navigatorul', color: '#6366f1', icon: '🧭', available: true,
      intro: 'Un program este o listă de comenzi pe care personajul le face, una după alta.' },
    { id: 2, number: 3, name: 'Arhitectul', color: '#f59e0b', icon: '🏗️', available: true,
      intro: 'Un arhitect vede ce se repetă. Blocul „Repetă” face aceiași pași de mai multe ori, ca să scrii mai puțin.' },
    { id: 3, number: 4, name: 'Condiții', color: '#10b981', icon: '❓', available: false,
      intro: 'Cu „Dacă” personajul se uită în jur și decide singur ce face.' }
  ];

  var MOVE_ABS = ['up', 'down', 'left', 'right'];
  var MOVE_REL = ['forward', 'turnLeft', 'turnRight'];

  var LEVELS = [
    // ---------------- Misiunea 1 (Inginerul de instrucțiuni): robotul desenator ----------------
    // Ca „Robotul desenator” și „Desenul dictat” de la prima întâlnire: eroul desenează pe unde trece.
    { id: 26, world: 4, name: 'Linia',
      hint: 'Robotul are creionul pe hârtie. Atinge săgețile ca să le pui în program, apoi apasă „Pornește”. Desenează linia punctată, fără să ieși din ea.',
      blocks: MOVE_ABS, optimal: 4, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#.....#',
        '#SDDDD#',
        '#.....#',
        '#######'] }],
      solution: [['right'], ['right'], ['right'], ['right']] },

    { id: 27, world: 4, name: 'Litera L',
      hint: 'Robotul desenează o literă. Dacă iese din linia punctată, desenul e stricat!',
      blocks: MOVE_ABS, optimal: 6, maxBlocks: null,
      maps: [{ dir: 2, grid: [
        '#######',
        '#S....#',
        '#D....#',
        '#D....#',
        '#DDDD.#',
        '#######'] }],
      solution: [['down'], ['down'], ['down'], ['right'], ['right'], ['right']] },

    { id: 28, world: 4, name: 'Pătratul',
      hint: '„Desenează un pătrat” e prea puțin pentru un robot. Spune-i exact pe unde să meargă creionul.',
      blocks: MOVE_ABS, optimal: 7, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#.....#',
        '#.SDD.#',
        '#.D.D.#',
        '#.DDD.#',
        '#.....#',
        '#######'] }],
      solution: [['down'], ['down'], ['right'], ['right'], ['up'], ['up'], ['left']] },

    { id: 29, world: 4, name: 'Casa',
      hint: 'Casa din desenul secret al Bufniței! 🏠 Robotul nu știe ce e un acoperiș, știe doar săgețile.',
      blocks: MOVE_ABS, optimal: 8, maxBlocks: null,
      maps: [{ dir: 2, grid: [
        '#######',
        '#..S..#',
        '#.DDD.#',
        '#.D.D.#',
        '#.DDD.#',
        '#######'] }],
      solution: [['down'], ['left'], ['down'], ['down'], ['right'], ['right'], ['up'], ['up']] },

    { id: 30, world: 4, name: 'Bradul',
      hint: 'Provocare! 🎄 Un brad cu ramuri. Robotul poate trece și pe unde a desenat deja, dacă rămâne pe linie.',
      blocks: MOVE_ABS, optimal: 15, maxBlocks: null,
      maps: [{ dir: 2, grid: [
        '#########',
        '#...S...#',
        '#..DDD..#',
        '#...D...#',
        '#.DDDDD.#',
        '#...D...#',
        '#########'] }],
      solution: [['down'], ['left'], ['right'], ['right'], ['left'], ['down'], ['down'], ['down'], ['up'],
        ['left'], ['left'], ['right'], ['right'], ['right'], ['right']] },

    // ---------------- Misiunea 2 (Navigatorul): secvențe ----------------
    { id: 1, world: 1, name: 'Primii pași',
      hint: 'Atinge săgețile ca să le pui în program, apoi apasă „Pornește”.',
      blocks: MOVE_ABS, optimal: 4, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S...T#',
        '#######'] }],
      solution: [['right'], ['right'], ['right'], ['right']] },


    { id: 3, world: 1, name: 'Drumul cotit',
      hint: 'Drumul are două cotituri. Numără pătrățelele dintre ele și pune săgețile în ordine.',
      blocks: MOVE_ABS, optimal: 6, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S..###',
        '###.###',
        '###..T#',
        '#######'] }],
      solution: [['right'], ['right'], ['down'], ['down'], ['right'], ['right']] },


    { id: 5, world: 1, name: 'Fundături',
      hint: 'Atenție, unele drumuri nu duc nicăieri! Găsește întâi drumul cel mai scurt cu degetul pe ecran.',
      blocks: MOVE_ABS, optimal: 7, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S..#.#',
        '#.#...#',
        '#.#.#.#',
        '#...#T#',
        '#######'] }],
      solution: [['right'], ['right'], ['down'], ['right'], ['right'], ['down'], ['down']] },


    { id: 7, world: 1, name: 'Podul peste lac',
      hint: 'Lacul taie câmpul în două și eroul nu știe să înoate! 🌊 Găsește podul de lemn și treci pe el.',
      blocks: MOVE_ABS, optimal: 8, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '########',
        '#S..A..#',
        '#...A..#',
        '#...B..#',
        '#...A.T#',
        '########'] }],
      solution: [['right'], ['right'], ['down'], ['down'], ['right'], ['right'], ['right'], ['down']] },



    { id: 10, world: 1, name: 'Vulcanul',
      hint: 'Marea provocare: vulcanul! 🌋 Lava arde, în apă cazi, iar bolovanii nu se mișcă din loc. Urmărește întâi drumul cu degetul pe ecran, apoi scrie programul.',
      blocks: MOVE_ABS, optimal: 13, maxBlocks: null,
      maps: [{ dir: 2, grid: [
        '#########',
        '#S#..L..#',
        '#.#.P.A.#',
        '#...#.A.#',
        '#LL.#...#',
        '#...LLL.#',
        '#.P....P#',
        '#..AA...#',
        '#P.....T#',
        '#########'] }],
      solution: [['down'], ['down'], ['right'], ['right'], ['down'], ['down'], ['down'], ['right'], ['right'], ['right'], ['down'], ['right'], ['down']] },

    // ---------------- Misiunea 3 (Arhitectul): bucle ----------------
    // Toate nivelele folosesc doar cele 4 săgeți (ca pe podea); 13 e provocarea primelor nivele.
    { id: 11, world: 2, name: 'Drumul lung',
      hint: 'Ai un bloc nou: „Repetă”. Ce pui înăuntrul lui se face de câte ori arată numărul, pe care îl schimbi cu + și −.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 2, maxBlocks: 3,
      maps: [{ dir: 1, grid: [
        '###########',
        '#S.......T#',
        '###########'] }],
      solution: [['repeat', 8, [['right']]]] },

    { id: 12, world: 2, name: 'Scările',
      hint: 'O scară până la comoară. Ai la dispoziție bucla „Repetă”, care face aceleași instrucțiuni de mai multe ori.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 3, maxBlocks: 4,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S.####',
        '##..###',
        '###..##',
        '####..#',
        '#####T#',
        '#######'] }],
      solution: [['repeat', 4, [['right'], ['down']]]] },

    { id: 13, world: 2, name: 'Muntele',
      hint: 'Provocare! Un munte de urcat și de coborât. Poți folosi câte bucle „Repetă” ai nevoie.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 6, maxBlocks: 7,
      maps: [{ dir: 1, grid: [
        '#########',
        '###...###',
        '##..#..##',
        '#..###..#',
        '#S#####T#',
        '#########'] }],
      solution: [['repeat', 3, [['up'], ['right']]], ['repeat', 3, [['right'], ['down']]]] },

    // 17 și 20: bucle una în alta.



    { id: 17, world: 2, name: 'Scara lată',
      hint: 'O scară cu trepte late. Știai că un „Repetă” poate sta în interiorul altui „Repetă”?',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '############',
        '#S...#######',
        '####....####',
        '#######....#',
        '##########T#',
        '############'] }],
      solution: [['repeat', 3, [['repeat', 3, [['right']]], ['down']]]] },



    { id: 20, world: 2, name: 'Munții gemeni',
      hint: 'Marea provocare a arhitectului: doi munți gemeni! ⛰️ Ai la dispoziție bucle „Repetă”, chiar și una în alta.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 7, maxBlocks: 8,
      maps: [{ dir: 1, grid: [
        '###############',
        '###...###...###',
        '##..#..#..#..##',
        '#..###...###..#',
        '#S#####.#####T#',
        '###############'] }],
      solution: [['repeat', 2, [['repeat', 3, [['up'], ['right']]], ['repeat', 3, [['right'], ['down']]]]]] },

    // ---------------- Misiunea 4: condiții (în lucru, ascunsă) ----------------
    { id: 21, world: 3, name: 'Până la comoară',
      hint: '„Repetă până la comoară” merge oricât e nevoie. Același program trebuie să meargă pe două drumuri de lungimi diferite!',
      blocks: MOVE_REL.concat(['repeatUntil']), optimal: 2, maxBlocks: 2,
      maps: [
        { dir: 1, grid: [
          '#########',
          '#S......T',
          '#########'] },
        { dir: 1, grid: [
          '#############',
          '#S..........T',
          '#############'] }],
      solution: [['repeatUntil', [['forward']]]] },

    { id: 22, world: 3, name: 'Spirala',
      hint: 'Blocul „Dacă” verifică ceva. Dacă e drum la stânga, rotește-te la stânga. Apoi fă un pas. Și tot așa, până la comoară.',
      blocks: MOVE_REL.concat(['repeatUntil', 'if']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '#######',
        '#.....#',
        '#.###.#',
        '#..T#.#',
        '#####.#',
        '#S....#',
        '#######'] }],
      solution: [['repeatUntil', [['if', 'left', [['turnLeft']]], ['forward']]]] },

    { id: 23, world: 3, name: 'Dacă... altfel',
      hint: '„Dacă e drum în față”, mergi înainte. „Altfel” (când ai zid în față), rotește-te. Programul trebuie să meargă pe ambele hărți!',
      blocks: MOVE_REL.concat(['repeatUntil', 'ifElse']), optimal: 4, maxBlocks: 5,
      maps: [
        { dir: 1, grid: [
          '#######',
          '#S....#',
          '#####.#',
          '#..T#.#',
          '#.###.#',
          '#.....#',
          '#######'] },
        { dir: 1, grid: [
          '#########',
          '#S......#',
          '#######.#',
          '#.....#.#',
          '#.###.#.#',
          '#.#T..#.#',
          '#.#####.#',
          '#.......#',
          '#########'] }],
      solution: [['repeatUntil', [['ifElse', 'front', [['forward']], [['turnRight']]]]]] },

    { id: 24, world: 3, name: 'Stânga sau dreapta?',
      hint: 'Când ai zid în față, uită-te: dacă e drum la stânga, mergi la stânga, altfel la dreapta. Poți pune un „Dacă” în alt „Dacă”!',
      blocks: MOVE_REL.concat(['repeatUntil', 'ifElse']), optimal: 6, maxBlocks: 7,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S...####',
        '####.####',
        '####....#',
        '#######.#',
        '###.....#',
        '###T#####',
        '#########'] }],
      solution: [['repeatUntil', [['ifElse', 'front', [['forward']],
        [['ifElse', 'left', [['turnLeft']], [['turnRight']]]]]]]] },

    { id: 25, world: 3, name: 'Marele labirint',
      hint: 'Secretul exploratorilor: ține mereu „mâna stângă” pe zid. Dacă e drum la stânga, ia-o la stânga; altfel, dacă e drum în față, mergi înainte; altfel rotește-te la dreapta.',
      blocks: MOVE_REL.concat(['repeatUntil', 'if', 'ifElse']), optimal: 7, maxBlocks: 9,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S..#...#',
        '###.#.#.#',
        '#...#.#.#',
        '#.###.#.#',
        '#.#...#.#',
        '#.#.###.#',
        '#...#..T#',
        '#########'] }],
      solution: [['repeatUntil', [['ifElse', 'left', [['turnLeft'], ['forward']],
        [['ifElse', 'front', [['forward']], [['turnRight']]]]]]]] }
  ];

  var api = { WORLDS: WORLDS, LEVELS: LEVELS };
  root.Levels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
