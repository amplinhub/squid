// Species - port of scr_creature_defs (03_species.gml). Numbers are the original ones (game units, per step).
// kind: 0 fish, 1 shrimp, 2 jellyfish, 3 manta, 4 squid (procedural), 5 whale, 6 turtle, 7 seahorse,
//       8 octopus (procedural), 9 scuba diver, 10 crab
// depth: usual depths in metres (dlo..dhi); the wide zone (a creature may turn up there, rarely) is
// dlo*0.4 .. dhi*1.8+120 like in the original.
const RAW = [
  // t  ru name               en name            len cruise flee chase pred det  lose dmg smin smax zmin zmax kind  g  dlo dhi  abund
  [0, 'Сардина', 'Sardine',                     12, 1.7, 3.8, 0, 0, 0, 0, 0, 5, 9, 40, 2000, 0,       1, 0, 150, 1.6],
  [1, 'Креветка', 'Shrimp',                      7, 0.8, 3.2, 0, 0, 0, 0, 0, 2, 4, 8, 40, 1,          1, 0, 500, 0.9],
  [2, 'Рыба-бабочка', 'Butterflyfish',          18, 1.3, 3.5, 0, 0, 0, 0, 0, 2, 5, 15, 170, 0,        1, 0, 140, 1.4],
  [3, 'Скумбрия', 'Mackerel',                   34, 2.4, 4.7, 0, 0, 0, 0, 0, 4, 8, 60, 2000, 0,       1, 0, 200, 1.2],
  [4, 'Групер', 'Grouper',                      72, 1.2, 3.8, 4.1, 1, 360, 650, 9, 1, 1, 20, 150, 0,  0, 10, 150, 0.8],
  [5, 'Барракуда', 'Barracuda',                 96, 2.0, 5.0, 5.7, 1, 520, 900, 15, 1, 2, 60, 2000, 0, 1, 0, 120, 0.8],
  [6, 'Акула', 'Shark',                        190, 2.4, 5.4, 6.1, 1, 720, 1150, 26, 1, 1, 60, 2000, 0, 1, 0, 500, 0.8],
  [7, 'Гигантский кальмар', 'Giant squid',     280, 2.2, 5.0, 6.7, 1, 650, 1050, 30, 1, 1, 50, 2000, 4, 0, 250, 500, 1.0],
  [8, 'Кашалот', 'Sperm whale',                620, 2.6, 5.0, 8.3, 1, 1000, 1500, 55, 1, 1, 120, 2000, 5, 0, 150, 500, 0.7],
  [9, 'Медуза', 'Jellyfish',                    26, 0.35, 0.6, 0, 0, 0, 0, 5, 1, 3, 80, 2000, 2,      1, 0, 500, 0.7],
  [10, 'Скат-манта', 'Manta ray',              170, 1.6, 4.2, 0, 0, 0, 0, 0, 1, 2, 80, 2000, 3,      0, 0, 400, 0.5],
  [11, 'Рыба-фугу', 'Pufferfish',               22, 0.9, 2.6, 0, 0, 0, 0, 0, 1, 2, 10, 140, 0,       1, 0, 170, 0.9],
  [12, 'Рыба-клоун', 'Clownfish',               10, 1.1, 3.2, 0, 0, 0, 0, 0, 2, 4, 6, 90, 0,         1, 0, 160, 1.3],
  [13, 'Морской конёк', 'Seahorse',             12, 0.4, 1.3, 0, 0, 0, 0, 0, 1, 3, 6, 70, 7,         0, 0, 160, 0.8],
  [14, 'Удильщик', 'Anglerfish',                42, 0.4, 2.0, 4.0, 1, 220, 320, 10, 1, 1, 10, 300, 0, 0, 250, 500, 1.1],
  [15, 'Рыба-гадюка', 'Viperfish',              30, 1.0, 3.6, 4.4, 1, 260, 400, 8, 1, 2, 30, 2000, 0, 1, 200, 500, 1.0],
  [16, 'Светящийся анчоус', 'Lanternfish',       9, 1.4, 3.6, 0, 0, 0, 0, 0, 4, 8, 30, 2000, 0,      0, 150, 500, 1.4],
  [17, 'Мурена', 'Moray eel',                  110, 0.8, 3.0, 5.6, 1, 240, 380, 16, 1, 1, 4, 60, 0,  1, 0, 170, 0.8],
  [18, 'Рыба-луна', 'Ocean sunfish',           240, 0.9, 2.2, 0, 0, 0, 0, 0, 1, 1, 80, 2000, 0,      1, 0, 400, 0.4],
  [19, 'Морская черепаха', 'Sea turtle',       110, 1.1, 3.0, 0, 0, 0, 0, 0, 1, 1, 20, 2000, 6,      1, 0, 150, 0.5],
  [20, 'Осьминог', 'Octopus',                   45, 0.6, 3.8, 0, 0, 0, 0, 0, 1, 1, 5, 45, 8,         0, 0, 200, 0.7],
  [21, 'Дайвер', 'Diver',                       90, 0.9, 2.5, 0, 0, 0, 0, 0, 1, 2, 14, 300, 9,       0, 0, 160, 1.4],
  [22, 'Краб', 'Crab',                          16, 0.45, 1.5, 0, 0, 0, 0, 0, 1, 2, 0, 6, 10,        0, 0, 600, 0.45],
];

export const SPECIES = RAW.map((r) => ({
  t: r[0], name: { ru: r[1], en: r[2] }, len: r[3], cruise: r[4], flee: r[5], chase: r[6], pred: !!r[7],
  detect: r[8], lose: r[9], dmg: r[10], smin: r[11], smax: r[12], zmin: r[13], zmax: r[14], kind: r[15],
  fem: r[16] === 1, dlo: r[17], dhi: r[18], dlw: r[17] * 0.4, dhw: r[18] * 1.8 + 120, abund: r[19],
  mouth: !!r[7], puffer: false, lure: false, glowfish: false, eel: false, upright: false,
}));
export const NTYPES = SPECIES.length;
SPECIES[9].mouth = false;
SPECIES[14].mouth = true; SPECIES[17].mouth = true; SPECIES[15].mouth = true;
SPECIES[21].mouth = true;            // diver: the "open mouth" frames are the struggle frames
SPECIES[11].puffer = true;
SPECIES[14].lure = true;
SPECIES[16].glowfish = true;
SPECIES[17].eel = true;
SPECIES[13].upright = true;
