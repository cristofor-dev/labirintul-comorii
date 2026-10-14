// Nivelele jocului. Hartă: '#' zid, '.' drum, 'S' start, 'T' comoară.
// dir = direcția de start (0 sus, 1 dreapta, 2 jos, 3 stânga).
// available: false = lumea e încă în lucru și nu apare pe hartă.
  // optimal = nr. de blocuri pentru 3 stele; maxBlocks = limita (null = fără limită).
// solution = soluția de referință (format compact, vezi Engine.fromCompact), verificată de test/test-levels.js.
(function (root) {
  'use strict';

  var WORLDS = [
    { id: 1, name: 'Primul program', color: '#6366f1', icon: '🧭', available: true,
      intro: 'Un program este o listă de comenzi pe care personajul le face, una după alta.' },
    { id: 2, name: 'Bucle', color: '#f59e0b', icon: '🔁', available: false,
      intro: 'Bucla „Repetă” face aceiași pași de mai multe ori, ca să scrii mai puțin.' },
    { id: 3, name: 'Condiții', color: '#10b981', icon: '❓', available: false,
      intro: 'Cu „Dacă” personajul se uită în jur și decide singur ce face.' }
  ];

  var MOVE_ABS = ['up', 'down', 'left', 'right'];
  var MOVE_REL = ['forward', 'turnLeft', 'turnRight'];

  var LEVELS = [
    // ---------------- Lumea 1: secvențe ----------------
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

    { id: 3, world: 1, name: 'Încotro privești?',
      hint: 'Acum personajul merge „Înainte” în direcția în care privește (vezi săgeata mică). Rotește-l ca să schimbe direcția.',
      blocks: MOVE_REL, optimal: 8, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S..###',
        '###.###',
        '###..T#',
        '#######'] }],
      solution: [['forward'], ['forward'], ['turnRight'], ['forward'], ['forward'], ['turnLeft'], ['forward'], ['forward']] },

    { id: 4, world: 1, name: 'Șarpele',
      hint: 'Un drum lung, cu multe întoarceri. Ai răbdare și verifică încotro privește personajul la fiecare colț.',
      blocks: MOVE_REL, optimal: 17, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '######',
        '#S...#',
        '####.#',
        '#....#',
        '#.####',
        '#...T#',
        '######'] }],
      solution: [['forward'], ['forward'], ['forward'], ['turnRight'], ['forward'], ['forward'], ['turnRight'],
        ['forward'], ['forward'], ['forward'], ['turnLeft'], ['forward'], ['forward'], ['turnLeft'],
        ['forward'], ['forward'], ['forward']] },

    { id: 5, world: 1, name: 'Fundături',
      hint: 'Atenție, unele drumuri nu duc nicăieri! Găsește întâi drumul cel mai scurt cu degetul pe ecran.',
      blocks: MOVE_REL, optimal: 10, maxBlocks: null,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S..#.#',
        '#.#...#',
        '#.#.#.#',
        '#...#T#',
        '#######'] }],
      solution: [['forward'], ['forward'], ['turnRight'], ['forward'], ['turnLeft'], ['forward'], ['forward'],
        ['turnRight'], ['forward'], ['forward']] },

    // ---------------- Lumea 2: bucle ----------------
    { id: 6, world: 2, name: 'Drumul lung',
      hint: 'Pune un bloc „Repetă”, schimbă numărul cu + și −, apoi pune „Înainte” înăuntrul lui.',
      blocks: MOVE_REL.concat(['repeat']), optimal: 2, maxBlocks: 3,
      maps: [{ dir: 1, grid: [
        '###########',
        '#S.......T#',
        '###########'] }],
      solution: [['repeat', 8, [['forward']]]] },

    { id: 7, world: 2, name: 'Scările',
      hint: 'Fiecare treaptă e la fel: un pas, o rotire, un pas, o rotire. Pune o treaptă într-un „Repetă”.',
      blocks: MOVE_REL.concat(['repeat']), optimal: 5, maxBlocks: 6,
      maps: [{ dir: 1, grid: [
        '#######',
        '#S.####',
        '##..###',
        '###..##',
        '####..#',
        '#####T#',
        '#######'] }],
      solution: [['repeat', 4, [['forward'], ['turnRight'], ['forward'], ['turnLeft']]]] },

    { id: 8, world: 2, name: 'Colțul cetății',
      hint: 'Poți folosi mai multe blocuri „Repetă”, unul după altul.',
      blocks: MOVE_REL.concat(['repeat']), optimal: 5, maxBlocks: 6,
      maps: [{ dir: 1, grid: [
        '########',
        '#S.....#',
        '######.#',
        '######.#',
        '######.#',
        '######T#',
        '########'] }],
      solution: [['repeat', 5, [['forward']]], ['turnRight'], ['repeat', 4, [['forward']]]] },

    { id: 9, world: 2, name: 'Muntele',
      hint: 'Urcarea are trei trepte la fel, coborârea tot trei. Două bucle și ești sus... apoi jos!',
      blocks: MOVE_REL.concat(['repeat']), optimal: 10, maxBlocks: 11,
      maps: [{ dir: 1, grid: [
        '#########',
        '###...###',
        '##..#..##',
        '#..###..#',
        '#S#####T#',
        '#########'] }],
      solution: [['repeat', 3, [['turnLeft'], ['forward'], ['turnRight'], ['forward']]],
        ['repeat', 3, [['forward'], ['turnRight'], ['forward'], ['turnLeft']]]] },

    { id: 10, world: 2, name: 'Turul cetății',
      hint: 'Provocare: un „Repetă” poate sta în alt „Repetă”! Ce se repetă de 3 ori?',
      blocks: MOVE_REL.concat(['repeat']), optimal: 4, maxBlocks: 5,
      maps: [{ dir: 1, grid: [
        '#########',
        '#S......#',
        '#######.#',
        '#######.#',
        '#######.#',
        '#######.#',
        '#######.#',
        '#T......#',
        '#########'] }],
      solution: [['repeat', 3, [['repeat', 6, [['forward']]], ['turnRight']]]] },

    // ---------------- Lumea 3: condiții ----------------
    { id: 11, world: 3, name: 'Până la comoară',
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

    { id: 12, world: 3, name: 'Spirala',
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

    { id: 13, world: 3, name: 'Dacă... altfel',
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

    { id: 14, world: 3, name: 'Stânga sau dreapta?',
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

    { id: 15, world: 3, name: 'Marele labirint',
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
