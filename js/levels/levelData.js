window.BS = window.BS || {};
(function (BS) {
"use strict";
const BIOMES = {
  rainforest: {
    name: 'Emerald Rainforest',
    sky: ['#0e2416', '#173621', '#0b1a10'],
    accent: '#57a05a',
    ambient: 'rainforest',
    music: { base: 220, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], barSec: 4.2, wave: 'triangle' }
  },
  oasis: {
    name: 'Golden Oasis',
    sky: ['#241a0c', '#3d2f16', '#1c1408'],
    accent: '#d9a95f',
    ambient: 'oasis',
    music: { base: 196, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 5, 9]], barSec: 3.8, wave: 'triangle' }
  },
  cavern: {
    name: 'Bioluminescent Cavern',
    sky: ['#08081a', '#141432', '#050510'],
    accent: '#6ee7f0',
    ambient: 'cavern',
    music: { base: 174.6, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [-2, 3, 7]], barSec: 5, wave: 'sine' }
  },
  reef: {
    name: 'Abyssal Reef',
    sky: ['#04141f', '#0a3040', '#030d14'],
    accent: '#54c2d8',
    ambient: 'reef',
    music: { base: 233.1, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 9], [2, 5, 9], [-3, 2, 7], [0, 5, 9]], barSec: 3.6, wave: 'triangle' }
  }
};

const E = '....................';

const LEVELS = [
  {
    name: 'First Canopy', biome: 'rainforest', goalApples: 8, stepMs: 150,
    insects: { firefly: 1 }, stars: [90, 140, 200],
    blurb: 'Learn to slither',
    map: [
      E, E, E,
      '..........##........',
      E, E, E, E, E, E,
      '.....S..............',
      E, E,
      '.........##.........',
      E, E, E, E,
      '......##......##....',
      E
    ]
  },
  {
    name: 'Vine Corridor', biome: 'rainforest', goalApples: 10, stepMs: 145,
    insects: { firefly: 1, beetle: 1 }, stars: [120, 180, 260],
    blurb: 'Thread the hanging vines',
    map: [
      E,
      '....#..........#....',
      '....#..........#....',
      '....#..........#....',
      '....#..........#....',
      '....#.....##...#....',
      '....#..........#....',
      '....#..........#....',
      '....#..........#....',
      '.....S..............',
      E,
      '....#..........#....',
      '....#..........#....',
      '....#...##.....#....',
      '....#..........#....',
      '....#..........#....',
      '....#..........#....',
      '....#..........#....',
      E, E
    ]
  },
  {
    name: 'Thicket Run', biome: 'rainforest', goalApples: 10, stepMs: 142,
    insects: { firefly: 1 }, stars: [130, 190, 270],
    blurb: 'Mind the thorns',
    map: [
      E, E,
      '...^^........^^.....',
      E, E,
      '.........^^.........',
      '.........^^.........',
      E, E,
      '.....S..............',
      E,
      '...............^^...',
      E, E,
      '...^^........^^^....',
      E, E,
      '.........##.........',
      E, E
    ]
  },
  {
    name: 'Dune Garden', biome: 'oasis', goalApples: 11, stepMs: 140,
    insects: { beetle: 2 }, stars: [140, 210, 300],
    blurb: 'Beetles roam the sands',
    map: [
      E, E,
      '..##..........##....',
      E, E,
      '........####........',
      E, E, E,
      '.....S..............',
      E, E, E,
      '..............###...',
      E, E,
      '...###..............',
      E,
      '..........##........',
      E
    ]
  },
  {
    name: 'Oasis Rings', biome: 'oasis', goalApples: 12, stepMs: 138,
    insects: { beetle: 1, firefly: 1 }, stars: [160, 230, 320],
    blurb: 'Circumnavigate the wells',
    map: [
      E, E,
      '.......####.........',
      '.......#..#.........',
      '.......#..#.........',
      '.......#..#.........',
      '.......#.##.........',
      E,
      '.....S..............',
      E, E, E, E,
      '...........####.....',
      '...........#..#.....',
      '...........#..#.....',
      '...........#.##.....',
      E, E, E
    ]
  },
  {
    name: 'Mirage Maze', biome: 'oasis', goalApples: 12, stepMs: 135,
    insects: { beetle: 1 }, stars: [170, 250, 340],
    blurb: 'Walls shift like heat haze',
    map: [
      E, E,
      '..#####....#####....',
      E, E,
      '..........#.........',
      '..........#.........',
      '..........#.........',
      '..........#.........',
      '.....S....#.........',
      '..........#.........',
      '..........#.........',
      '..........#.........',
      '..........#.........',
      E, E,
      '....#####....#####..',
      E, E, E
    ]
  },
  {
    name: 'Glow Hollow', biome: 'cavern', goalApples: 12, stepMs: 135,
    insects: { firefly: 2 }, stars: [180, 260, 350],
    blurb: 'Ancient paired portals hum',
    map: [
      E, E,
      '....##..........##..',
      E, E,
      '............A.......',
      '........**..........',
      E, E, E,
      '.....S..............',
      E, E,
      '........**..........',
      '............A.......',
      E, E,
      '..##............##..',
      E, E
    ]
  },
  {
    name: 'Crystal Warp', biome: 'cavern', goalApples: 13, stepMs: 132,
    insects: { firefly: 1, beetle: 1 }, stars: [200, 280, 380],
    blurb: 'Two warp pairs, toxic spores',
    map: [
      E,
      '..A.............B...',
      E,
      '.......****.........',
      E, E,
      '...##..........##...',
      E, E,
      '.....S..............',
      E, E,
      '...##..........##...',
      E, E,
      '.......****.........',
      E,
      '..B.............A...',
      E, E
    ]
  },
  {
    name: 'Sunken Maze', biome: 'cavern', goalApples: 14, stepMs: 130,
    insects: { beetle: 1, firefly: 1 }, stars: [220, 310, 420],
    blurb: 'The deep labyrinth',
    map: [
      E,
      '.####.####..####.#..',
      E, E,
      '..########..######..',
      E, E,
      '.....A..........##..',
      E,
      '.....S..............',
      E,
      '..######....######..',
      E, E,
      '.....A..............',
      E,
      '..####..######..##..',
      E, E, E
    ]
  },
  {
    name: 'Coral Alley', biome: 'reef', goalApples: 13, stepMs: 128,
    insects: { beetle: 2 }, stars: [210, 290, 400],
    blurb: 'Weave through the reef',
    map: [
      E, E,
      '..###....###....###.',
      E, E,
      '......###....###....',
      E, E,
      '.....S..............',
      E, E,
      '......###....###....',
      E, E,
      '..###....###....###.',
      E, E, E, E, E
    ]
  },
  {
    name: 'Tidal Spores', biome: 'reef', goalApples: 14, stepMs: 126,
    insects: { beetle: 1, firefly: 1 }, stars: [230, 320, 430],
    blurb: 'Poison drifts on the current',
    map: [
      E, E,
      '...*....*....*....*.',
      E, E,
      '.*....*....*....*...',
      E, E, E,
      '.....S..............',
      E, E, E, E,
      '.*....*....*....*...',
      E, E,
      '...*....*....*....*.',
      E, E
    ]
  },
  {
    name: 'Abyss Throne', biome: 'reef', goalApples: 16, stepMs: 118,
    insects: { beetle: 2, firefly: 1 }, stars: [260, 360, 480],
    blurb: 'The final trial of the deep',
    map: [
      E,
      '..#....##....#..A...',
      E,
      '......^^^^^^........',
      E,
      '..##............##..',
      E,
      '........***.........',
      E,
      '.....S..............',
      E,
      '........***.........',
      E,
      '..##............##..',
      E,
      '......^^^^^^........',
      E,
      '..#....##....#..A...',
      E, E
    ]
  }
];

Object.assign(BS, { BIOMES, LEVELS });

})(window.BS);
