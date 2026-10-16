// Nivelele jocului, grupate pe misiuni. Hartă: '#' zid, '.' drum, 'S' start, 'T' comoară,
// 'P' bolovan (te lovești de el), 'L' lavă și 'A' apă (cazi în ele), 'B' pod.
// dir = direcția de start (0 sus, 1 dreapta, 2 jos, 3 stânga).
// Misiuni: în cod se numesc „world” (așa sunt salvate și online); number = numărul misiunii din
// parcursul Academiei (prima misiune din joc e Misiunea #2, Navigatorul).
// available: false = misiunea e încă în lucru și nu apare pe hartă.
  // optimal = nr. de blocuri pentru 3 stele; maxBlocks = limita (null = fără limită).
// solution = soluția de referință (format compact, vezi Engine.fromCompact), verificată de test/test-levels.js.
(function (root) {
  'use strict';

  var WORLDS = [
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
    // ---------------- Misiunea 2 (Navigatorul): secvențe ----------------
    { id: 1, world: 1, name: 'Primii pași',
      hint: 'Apasă pe săgeata ➡ de 4 ori ca să pui comenzile în program, apoi apasă „Pornește”.',
      blocks: MOVE_ABS, optimal: 4, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S...T#',
        '#######'] }],
      solution: [['right'], ['right'], ['right'], ['right']] },

    { id: 2, world: 1, name: 'Colțul',
      hint: 'Drumul face colțuri. Numără pătrățelele și pune săgețile în ordinea bună.',
      blocks: MOVE_ABS, optimal: 6, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '######',
        '#S..##',
        '###.##',
        '###..#',
        '####T#',
        '######'] }],
      solution: [['right'], ['right'], ['down'], ['down'], ['right'], ['down']] },

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

    { id: 4, world: 1, name: 'Șarpele',
      hint: 'Un drum lung, cu multe cotituri. Ai răbdare și numără bine pătrățelele de pe fiecare bucată de drum.',
      blocks: MOVE_ABS, optimal: 13, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '######',
        '#S...#',
        '####.#',
        '#....#',
        '#.####',
        '#...T#',
        '######'] }],
      solution: [['right'], ['right'], ['right'], ['down'], ['down'], ['left'], ['left'], ['left'], ['down'], ['down'], ['right'], ['right'], ['right']] },

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

    // Nivelele 6–10: câmp deschis cu obstacole de ocolit.
    { id: 6, world: 1, name: 'Lava fierbinte',
      hint: 'Atenție, lavă! 🔥 Dacă eroul calcă pe ea, programul are un bug. Ocolește lava pe lângă ea.',
      blocks: MOVE_ABS, optimal: 6, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#.....#',
        '#S.L.T#',
        '#.....#',
        '#######'] }],
      solution: [['up'], ['right'], ['right'], ['right'], ['right'], ['down']] },

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

    { id: 8, world: 1, name: 'Bolovani și lavă',
      hint: 'Bolovanii nu se mișcă din loc, iar lava arde! Caută un drum printre ele și numără bine pătrățelele.',
      blocks: MOVE_ABS, optimal: 9, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '########',
        '#S..L..#',
        '#.P.L.P#',
        '#...P..#',
        '#LL...L#',
        '#..P..T#',
        '########'] }],
      solution: [['right'], ['right'], ['down'], ['down'], ['down'], ['right'], ['right'], ['down'], ['right']] },

    { id: 9, world: 1, name: 'Râul de foc',
      hint: 'Un râu de lavă taie drumul! Singura trecere e podul din mijloc. Ocolește bolovanii ca să ajungi la el.',
      blocks: MOVE_ABS, optimal: 10, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S..P...#',
        '#.P...P.#',
        '#LLLBLLL#',
        '#.P...P.#',
        '#...P..T#',
        '#########'] }],
      solution: [['right'], ['right'], ['down'], ['right'], ['down'], ['down'], ['right'], ['down'], ['right'], ['right']] },

    { id: 10, world: 1, name: 'Vulcanul',
      hint: 'Marea provocare: vulcanul! 🌋 Ziduri, lavă, bolovani și apă. Urmărește întâi drumul cu degetul pe ecran, apoi scrie programul.',
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
      hint: 'Pune un bloc „Repetă”, schimbă numărul cu + și −, apoi pune săgeata ➡ înăuntrul lui. Un singur cartonaș face munca a opt!',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 2, maxBlocks: 3,
      maps: [{ dir: 1, grid: [
        '###########',
        '#S.......T#',
        '###########'] }],
      solution: [['repeat', 8, [['right']]]] },

    { id: 12, world: 2, name: 'Scările',
      hint: 'Fiecare treaptă e la fel: un pas la dreapta, un pas în jos. Pune o treaptă într-un „Repetă” și numără câte trepte sunt.',
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
      hint: 'Provocare! Urcarea are trei trepte la fel (sus, dreapta), coborârea tot trei (dreapta, jos). Două bucle și ești sus... apoi jos!',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 6, maxBlocks: 7,
      maps: [{ dir: 1, grid: [
        '#########',
        '###...###',
        '##..#..##',
        '#..###..#',
        '#S#####T#',
        '#########'] }],
      solution: [['repeat', 3, [['up'], ['right']]], ['repeat', 3, [['right'], ['down']]]] },

    // 14–20: nivele în plus pentru cei rapizi, tot mai grele; de la 17 încolo, bucle una în alta.
    { id: 14, world: 2, name: 'Insulele de lavă',
      hint: 'Lava e peste tot, doar insulele sunt sigure! Uită-te ce pași se repetă de la o insulă la alta și pune-i într-un „Repetă”.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S..LLLL#',
        '#LL...LL#',
        '#LLLL...#',
        '#LLLLLLT#',
        '#########'] }],
      solution: [['repeat', 3, [['right'], ['right'], ['down']]]] },

    { id: 15, world: 2, name: 'Colțul cetății',
      hint: 'Poți pune mai multe blocuri „Repetă” unul după altul: unul pentru drumul spre dreapta, altul pentru drumul în jos.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '########',
        '#S.....#',
        '######.#',
        '######.#',
        '######.#',
        '######T#',
        '########'] }],
      solution: [['repeat', 5, [['right']]], ['repeat', 4, [['down']]]] },

    { id: 16, world: 2, name: 'Ocolul lacului',
      hint: 'Trei maluri, trei bucle: una spre dreapta, una în jos și una spre stânga.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 6, maxBlocks: 7,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S....#',
        '#AAAA.#',
        '#AAAA.#',
        '#AAAA.#',
        '#T....#',
        '#######'] }],
      solution: [['repeat', 4, [['right']]], ['repeat', 4, [['down']]], ['repeat', 4, [['left']]]] },

    { id: 17, world: 2, name: 'Scara lată',
      hint: 'Secretul arhitecților: un „Repetă” poate sta în alt „Repetă”! Fiecare treaptă are trei pași la dreapta și unul în jos.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '############',
        '#S...#######',
        '####....####',
        '#######....#',
        '##########T#',
        '############'] }],
      solution: [['repeat', 3, [['repeat', 3, [['right']]], ['down']]]] },

    { id: 18, world: 2, name: 'Scara uriașului',
      hint: 'O scară cu trepte uriașe: trei pași la dreapta, trei în jos. Pune câte o buclă pentru fiecare, apoi pe amândouă într-o buclă mare.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 5, maxBlocks: 6,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S...####',
        '####.####',
        '####.####',
        '####....#',
        '#######.#',
        '#######.#',
        '#######T#',
        '#########'] }],
      solution: [['repeat', 2, [['repeat', 3, [['right']]], ['repeat', 3, [['down']]]]]] },

    { id: 19, world: 2, name: 'Zidul cu creneluri',
      hint: 'Zidul cetății are creneluri: sus, trei pași, jos, trei pași. Scrie un singur crenel, apoi repetă-l.',
      blocks: MOVE_ABS.concat(['repeat']), optimal: 7, maxBlocks: 8,
      maps: [{ dir: 1, grid: [
        '###############',
        '#....##....####',
        '#S##....##...T#',
        '###############'] }],
      solution: [['repeat', 2, [['up'], ['repeat', 3, [['right']]], ['down'], ['repeat', 3, [['right']]]]]] },

    { id: 20, world: 2, name: 'Munții gemeni',
      hint: 'Marea provocare a arhitectului: doi munți la fel! Ții minte Muntele? Pune-l pe tot într-un „Repetă” care se face de două ori.',
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
