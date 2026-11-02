'use strict';
// ============================================================
//  ПЕПЕЛЬНАЯ ЛИТАНИЯ — данные
// ============================================================
const TW = 64, TH = 32;          // размер изометрического тайла
const MW = 16, MH = 16;          // размер карты
const MAX_AP = 3;                // очки действий на юнита
const RES_MAX = 10;              // максимум ресурса фракции
const ALTAR_WIN = 4;             // очков алтаря для ритуальной победы
const MAX_ROUNDS = 20;
const GUARD_PER_AP = 8;          // защита за каждое несгоревшее ОД

// Верхняя половина карты. Нижняя — центральная симметрия (честно для обеих сторон).
// .  пол   # руины стены (полн.)  P колонна (полн.)  h надгробие (пол.)
// c  саркофаг (пол.)  t мёртвое древо (пол.)  B жаровня (пол., свет)  A алтарь
const MAP_TOP = [
  '..t...h..#......',
  '.##......#t.h...',
  '....c..B........',
  '.h........c..P..',
  '...P..##........',
  '.........h..B...',
  'B..h..........h.',
  '.....c.AA.P.....',
];

const OBJ = {
  '#': { name: 'Руины стены', cover: 40, los: true, hp: 8 },
  'P': { name: 'Колонна', cover: 40, los: true, hp: 12 },
  'h': { name: 'Надгробие', cover: 20, hp: 4 },
  'c': { name: 'Саркофаг', cover: 20, hp: 5 },
  't': { name: 'Мёртвое древо', cover: 20, hp: 3 },
  'B': { name: 'Жаровня', cover: 20, hp: 3 },
};

const FACTIONS = {
  order: {
    id: 'order', foe: 'coven', name: 'Орден Пепельного Света', short: 'Орден', gen: 'Ордена',
    res: 'Вера', motto: 'Свет — это клинок, а пепел — молитва.',
    passive: 'Свет веры: +8 к меткости, когда боец стоит на свету.',
    ult: { name: 'Рассвет', cost: 7, desc: 'До вашего следующего хода тьма рассеяна по всему полю, сокрытые враги раскрыты, все союзники исцеляются на 2.' },
    pal: { cloth: '#d8ccb0', cloth2: '#8e1c26', metal: '#c8b27a', metal2: '#6f5f3b', skin: '#c99c7c', dark: '#2a2016',
      glow: '#ffc45e', glow2: '#ff7a2e', eye: '#ffeab0', ui: '#e9c178' },
  },
  coven: {
    id: 'coven', foe: 'order', name: 'Ковен Пустой Луны', short: 'Ковен', gen: 'Ковена',
    res: 'Скверна', motto: 'Мы — тени, что остаются, когда гаснут свечи.',
    passive: 'Дети ночи: нет штрафа меткости при стрельбе во тьму, +10 к защите во тьме.',
    ult: { name: 'Затмение', cost: 7, desc: 'До вашего следующего хода гаснут все жаровни и огни, враги охвачены ужасом (−10 к меткости), союзники исцеляются на 2.' },
    pal: { cloth: '#2c2337', cloth2: '#4c3569', metal: '#a9a797', metal2: '#57564d', skin: '#ddd5bf', dark: '#0f0b14',
      glow: '#a77bff', glow2: '#4fe3b0', eye: '#d6fbff', ui: '#b597ff' },
  },
};

const CLASSES = {
  bastion: { hp: 17, mov: 4, aim: 65, def: 5, crit: 5, role: 'Страж',
    names: { order: 'Храмовник', coven: 'Костяной страж' },
    abil: ['cleave', 'bulwark', 'taunt'],
    desc: 'Живая стена. Стоящие рядом союзники получают за ним полное укрытие.' },
  marksman: { hp: 11, mov: 4, aim: 75, def: 0, crit: 10, role: 'Стрелок',
    names: { order: 'Арбалетчица', coven: 'Костяной лучник' },
    abil: ['shot', 'pierce', 'watch'],
    desc: 'Дальний бой и единственный, кто умеет держать Бдение.' },
  mystic: { hp: 10, hpCoven: 12, mov: 4, aim: 70, def: 0, crit: 5, role: 'Мистик',
    names: { order: 'Пиромант', coven: 'Гексер' },
    abil: ['bolt', 'inferno'],
    desc: 'Разрушает укрытия, поджигает землю. Огонь Ордена светит, пламя Ковена пожирает свет.' },
  shade: { hp: 10, mov: 6, aim: 70, def: 10, crit: 15, role: 'Тень',
    names: { order: 'Клинок покаяния', coven: 'Тень' },
    abil: ['backstab', 'knife', 'vanish'],
    desc: 'Быстрый убийца. Во тьме может стать невидимым для врага.' },
  priest: { hp: 12, mov: 4, aim: 60, def: 0, crit: 5, role: 'Жрец',
    names: { order: 'Капеллан', coven: 'Костяная ведьма' },
    abil: ['smite', 'heal', 'hex'],
    desc: 'Лечит, благословляет или проклинает. Тратит ресурс фракции.' },
};

const UNIT_NAMES = {
  order: { bastion: 'Брат Ансельм', marksman: 'Сестра Ивета', mystic: 'Магистр Орвин', shade: 'Кающийся Тэйн', priest: 'Отец Мирон' },
  coven: { bastion: 'Мортис', marksman: 'Вейла Без Глаз', mystic: 'Хоргот', shade: 'Сиф', priest: 'Матушка Грель' },
};

// Расстановка Ковена (верх-право). Орден — зеркально.
const SPAWN_COVEN = [
  ['bastion', 12, 2], ['marksman', 14, 1], ['mystic', 13, 0], ['shade', 15, 3], ['priest', 11, 0],
];

// type: attack | aoe | self | ally | enemy | brazier
const ABIL = {
  cleave: { name: { order: 'Удар клинком', coven: 'Удар булавой' }, ap: 2, type: 'attack', melee: true, range: 1.5,
    dmg: [4, 6], aim: 20, crit: 10, icon: 'sword', desc: 'Ближняя атака. Укрытия не помогают цели.' },
  bulwark: { name: 'Бастион', ap: 1, type: 'self', icon: 'shield',
    desc: 'До вашего следующего хода: +20 к защите, а союзники рядом получают полное укрытие с вашей стороны.' },
  taunt: { name: 'Вызов', ap: 1, res: 2, type: 'self', icon: 'horn',
    desc: 'Раз за ход. Враги в радиусе 4 (в прямой видимости) в свой ход получают −20 к меткости по всем, кроме вас.' },
  shot: { name: { order: 'Арбалетный болт', coven: 'Костяная стрела' }, ap: 2, type: 'attack', range: 11,
    dmg: [3, 5], aim: 0, crit: 0, icon: 'bow', proj: 'arrow', desc: 'Дальний выстрел. Дальше 7 клеток: −4 за клетку.' },
  pierce: { name: 'Пронзающий выстрел', ap: 3, type: 'attack', range: 11, dmg: [4, 6], aim: 15, crit: 10, pierce: true,
    icon: 'pierce', proj: 'arrow', desc: '+15 к меткости. Укрытие цели ослаблено на ступень (полное → половинное → нет).' },
  watch: { name: 'Бдение', ap: 1, apAll: true, type: 'self', icon: 'eye',
    desc: 'Тратит все ОД. Выстрел (−10) по врагу, что двигается в зоне видимости. При 3 ОД — два выстрела.' },
  bolt: { name: { order: 'Искра', coven: 'Теневой разряд' }, ap: 2, type: 'attack', range: 8, dmg: [3, 4], aim: 5,
    magic: true, ignoreDark: true, icon: 'bolt', proj: 'orb', desc: 'Магический снаряд. Не страдает от тьмы.' },
  inferno: { name: { order: 'Огненный вал', coven: 'Чёрное пламя' }, ap: 3, res: 3, type: 'aoe', range: 7, radius: 1.5,
    dmg: [3, 5], icon: 'fire', desc: 'Площадь. Бьёт всех (и своих!), крушит укрытия, поджигает землю на 2 раунда. Пламя Ордена даёт свет; пламя Ковена гасит свет, а враги Ковена, стреляющие из него, получают −10 к меткости.' },
  backstab: { name: 'Удар из тени', ap: 2, type: 'attack', melee: true, range: 1.5, dmg: [4, 6], aim: 20, crit: 10,
    flankCrit: 25, icon: 'dagger', desc: 'Удар в спину: +25 к криту, если у цели нет укрытий рядом или вы бьёте с противоположной укрытию стороны (сбоку и со стороны укрытия — без бонуса). Из сокрытия: +20 к меткости.' },
  knife: { name: 'Метательный нож', ap: 1, type: 'attack', range: 5, dmg: [2, 3], aim: 0, crit: 10, icon: 'knife',
    proj: 'knife', desc: 'Дешёвый бросок на 1 ОД.' },
  vanish: { name: { order: 'Покаяние', coven: 'Сокрытие' }, ap: 1, type: 'self', icon: 'hood',
    desc: { order: '2 ОД. Покаянная пелена: работает и на свету, свет её не срывает. Нельзя, если враг ближе 2 клеток. Враг не может выбрать вас целью. Можно подкрасться вплотную и ударить из тени (+20). Раскрывает: ваша атака, враг, сам подошедший вплотную, или конец хода рядом с врагом.', coven: '1 ОД. Только во тьме и если врагов нет ближе 2 клеток. Враг не может выбрать вас целью. Можно подкрасться вплотную и ударить из тени (+20). Раскрывает: ваша атака, шаг на свет, враг, сам подошедший вплотную, или конец хода рядом с врагом.' } },
  smite: { name: { order: 'Кара', coven: 'Порча' }, ap: 2, type: 'attack', range: 7, dmg: [2, 4], aim: 5, magic: true,
    icon: 'smite', proj: 'beam', desc: 'Священный (или нечестивый) луч.' },
  heal: { name: { order: 'Исцеление', coven: 'Сращивание костей' }, ap: 2, res: 2, type: 'ally', range: 5, heal: 5,
    icon: 'heal', desc: 'Восстанавливает союзнику 5 ОЗ и гасит на нём огонь. Молитве не нужна прямая видимость — только дальность 5.' },
  hex: { name: { order: 'Благословение', coven: 'Проклятие' }, ap: 1, res: 2, type: { order: 'ally', coven: 'enemy' }, range: 7,
    icon: 'star', desc: { order: 'Союзник: +15 к меткости и защите на 2 хода.', coven: 'Враг: −15 к меткости и защите на 2 хода.' } },
  blood: { name: 'Кровавая цена', ap: 0, type: 'self', icon: 'blood', desc: 'Раз за ход: пожертвовать 3 ОЗ ради +1 ОД.' },
  brazier: { name: 'Жаровня', ap: 1, type: 'brazier', icon: 'brazier', desc: 'Зажечь или погасить соседнюю жаровню. Свет и тьма — оружие.' },
};

function abName(id, side) { const n = ABIL[id].name; return typeof n === 'string' ? n : n[side]; }
function abDesc(id, side) { const d = ABIL[id].desc; return typeof d === 'string' ? d : d[side]; }
function abType(id, side) { const t = ABIL[id].type; return typeof t === 'string' ? t : t[side]; }

// Простые SVG-иконки (24x24)
const ICONS = {
  sword: '<path d="M19 3l-9 9-2-2-1.5 1.5 2 2-3.5 3.5 1.5 1.5 3.5-3.5 2 2L14 15.5l-2-2 9-9V3z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zm0 3l-5 2v4c0 3.5 2.2 6.3 5 7.8V5z"/>',
  horn: '<path d="M3 15c5 0 9-3 12-8l2 1-1 3 5 1-6 4c-3 3-7 4-12 4z"/><circle cx="5" cy="16.5" r="1.4"/>',
  bow: '<path d="M5 3c8 3 11 9 11 18h-2c0-8-3-12-9-15z"/><path d="M5 3l11 18" stroke-width="1" stroke="currentColor"/><path d="M3 13h15l-3-3m3 3l-3 3" stroke-width="1.8" stroke="currentColor" fill="none"/>',
  pierce: '<path d="M2 12h16" stroke="currentColor" stroke-width="2"/><path d="M22 12l-6-5v10z"/><path d="M5 7v10M9 8v8" stroke="currentColor" stroke-width="1.5"/>',
  eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/><circle cx="12" cy="12" r="2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  fire: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z"/>',
  dagger: '<path d="M20 2l-2 6-8 8-2-2 8-8zM7 15l2 2-3 3-1.5-.5L4 18z"/><path d="M5 12l7 7" stroke="currentColor" stroke-width="2"/>',
  knife: '<path d="M21 3L9 13l2 2L21 3z"/><path d="M8 14l2 2-5 5-2-2z"/><path d="M2 8h5M3 11h3" stroke="currentColor" stroke-width="1.5"/>',
  hood: '<path d="M12 2C7 2 4 7 4 13c0 4 2 8 2 8h12s2-4 2-8c0-6-3-11-8-11zm0 6c2.5 0 4 2.5 4 6H8c0-3.5 1.5-6 4-6z"/><circle cx="10.5" cy="12" r=".9"/><circle cx="13.5" cy="12" r=".9"/>',
  smite: '<path d="M11 1h2v6h-2zM11 17h2v6h-2zM1 11h6v2H1zM17 11h6v2h-6z"/><circle cx="12" cy="12" r="3.2"/><path d="M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5" stroke="currentColor" stroke-width="1.5"/>',
  heal: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  star: '<path d="M12 2l2.6 7H22l-6 4.5 2.3 7.5L12 16.5 5.7 21 8 13.5 2 9h7.4z"/>',
  blood: '<path d="M12 2s7 8 7 13a7 7 0 01-14 0c0-5 7-13 7-13z"/>',
  brazier: '<path d="M5 11h14l-2 4H7z"/><path d="M8 15l-2 7M16 15l2 7M12 15v7" stroke="currentColor" stroke-width="1.6"/><path d="M12 2c1 3 4 4 4 7H8c0-2 2-3 2-5 1 1 1.5 1.5 2 2z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M4.2 19.8L7 17M17 7l2.8-2.8" stroke="currentColor" stroke-width="1.8"/>',
  moon: '<path d="M15 3a9 9 0 1 0 6 15.5A7.5 7.5 0 0 1 15 3z"/>',
};
function svgIcon(name, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor">${ICONS[name] || ''}</svg>`;
}
