// L'Archipel des Brumes — données de base
(function (root) {
'use strict';

const GOODS = [
  { id: 'cereales',     name: 'Céréales',          tier: 0, base: 8,   perish: 0.002, icon: '🌾' },
  { id: 'poisson',      name: 'Poisson frais',     tier: 0, base: 6,   perish: 0.05,  icon: '🐟' },
  { id: 'bois',         name: 'Bois',              tier: 0, base: 7,   perish: 0,     icon: '🪵' },
  { id: 'minerai',      name: 'Minerai de fer',    tier: 0, base: 9,   perish: 0,     icon: '⛏' },
  { id: 'houille',      name: 'Houille',           tier: 0, base: 8,   perish: 0,     icon: '⚫' },
  { id: 'sel',          name: 'Sel',               tier: 0, base: 5,   perish: 0,     icon: '🧂' },
  { id: 'cristal',      name: "Cristal d'éclat",   tier: 0, base: 20,  perish: 0,     icon: '💎' },
  { id: 'champignon',   name: 'Champignon de brume', tier: 0, base: 12, perish: 0.03, icon: '🍄' },
  { id: 'farine',       name: 'Farine',            tier: 1, base: 15,  perish: 0.003, icon: '' },
  { id: 'poisson_sale', name: 'Poisson salé',      tier: 1, base: 12,  perish: 0.004, icon: '' },
  { id: 'planches',     name: 'Planches',          tier: 1, base: 18,  perish: 0,     icon: '' },
  { id: 'fonte',        name: 'Fonte',             tier: 1, base: 34,  perish: 0,     icon: '' },
  { id: 'eclat',        name: 'Éclat taillé',      tier: 1, base: 52,  perish: 0,     icon: '' },
  { id: 'essence',      name: 'Essence de brume',  tier: 1, base: 48,  perish: 0.002, icon: '' },
  { id: 'rations',      name: 'Rations',           tier: 2, base: 17,  perish: 0.01,  icon: '' },
  { id: 'outils',       name: 'Outils',            tier: 2, base: 68,  perish: 0,     icon: '' },
  { id: 'accu',         name: "Accumulateurs d'éclat", tier: 2, base: 110, perish: 0, icon: '' },
  { id: 'lanterne',     name: 'Lanternes à éclat', tier: 3, base: 230, perish: 0,     icon: '' },
];
const G = {};
GOODS.forEach(g => { G[g.id] = g; });

// Recette indexée par le bien produit
const RECIPES = {
  farine:       { name: 'Moulin',            in: { cereales: 3 },              out: 2, perDay: 30, workers: 6, cost: 600 },
  poisson_sale: { name: 'Saloir',            in: { poisson: 2, sel: 1 },       out: 2, perDay: 30, workers: 6, cost: 600 },
  rations:      { name: 'Biscuiterie',       in: { farine: 1, poisson_sale: 1 }, out: 2, perDay: 40, workers: 6, cost: 900 },
  planches:     { name: 'Scierie',           in: { bois: 2 },                  out: 1, perDay: 20, workers: 5, cost: 600 },
  fonte:        { name: 'Haut-fourneau',     in: { minerai: 2, houille: 1 },   out: 1, perDay: 15, workers: 8, cost: 1200 },
  eclat:        { name: 'Taillerie',         in: { cristal: 2 },               out: 1, perDay: 10, workers: 6, cost: 1400 },
  essence:      { name: 'Alambic',           in: { champignon: 3 },            out: 1, perDay: 10, workers: 4, cost: 1000 },
  outils:       { name: 'Forge',             in: { fonte: 1, planches: 1 },    out: 1, perDay: 8,  workers: 6, cost: 1600 },
  accu:         { name: "Atelier d'accumulateurs", in: { eclat: 1, fonte: 1 }, out: 1, perDay: 5,  workers: 6, cost: 2400 },
  lanterne:     { name: 'Lanternerie',       in: { accu: 1, outils: 1 },       out: 1, perDay: 4,  workers: 6, cost: 3200 },
};

const STRATA = ['manouvriers', 'artisans', 'bourgeois', 'patriciens'];
const STRATA_NAMES = { manouvriers: 'Manouvriers', artisans: 'Artisans', bourgeois: 'Bourgeois', patriciens: 'Patriciens' };
// q = unités pour 100 habitants par jour ; u = urgence
const NEEDS = {
  manouvriers: [{ g: 'rations', q: 2, u: 1 }, { g: 'poisson_sale', q: 0.5, u: 0.7 }, { g: 'outils', q: 0.05, u: 0.3 }],
  artisans:    [{ g: 'rations', q: 1.5, u: 1 }, { g: 'poisson_sale', q: 1, u: 0.7 }, { g: 'outils', q: 0.2, u: 0.5 }, { g: 'planches', q: 0.3, u: 0.4 }, { g: 'lanterne', q: 0.03, u: 0.2 }],
  bourgeois:   [{ g: 'rations', q: 1.5, u: 1 }, { g: 'poisson_sale', q: 1, u: 0.6 }, { g: 'outils', q: 0.1, u: 0.3 }, { g: 'lanterne', q: 0.1, u: 0.3 }, { g: 'essence', q: 0.15, u: 0.1 }],
  patriciens:  [{ g: 'rations', q: 1.5, u: 1 }, { g: 'lanterne', q: 0.3, u: 0.4 }, { g: 'essence', q: 0.3, u: 0.2 }, { g: 'accu', q: 0.1, u: 0.2 }],
};
const INCOME = { manouvriers: 0.62, artisans: 0.85, bourgeois: 1.05, patriciens: 1.6 };

const ISLANDS = [
  { id: 'port',  name: 'Port-Sablier', x: 500, y: 372, pop: [1200, 900, 700, 200], raw: {},
    factions: { guilde: .35, armateurs: .2, terriens: .1, ouvriers: .2, arcanistes: .15 }, tax: 0.01,
    desc: "Capitale financière de l'archipel, siège de la Grande Bourse et de la Banque. Elle importe tout ce qu'elle mange." },
  { id: 'ferre', name: 'Ferrecrête', x: 235, y: 190, pop: [800, 450, 200, 50], raw: { minerai: 35, houille: 18 },
    factions: { guilde: .15, armateurs: .1, terriens: .15, ouvriers: .45, arcanistes: .15 }, tax: 0.012,
    desc: 'Mines de fer et de houille, hauts-fourneaux. Les ouvriers y sont nombreux et prompts à la grève.' },
  { id: 'verd',  name: 'Les Verdanes', x: 775, y: 180, pop: [850, 350, 170, 30], raw: { cereales: 210 },
    factions: { guilde: .15, armateurs: .1, terriens: .5, ouvriers: .2, arcanistes: .05 }, tax: 0.01,
    desc: "Le grenier de l'archipel. Ses récoltes, et donc le prix du pain partout, dépendent de la météo." },
  { id: 'cora',  name: 'Corallie', x: 835, y: 520, pop: [700, 300, 160, 40], raw: { poisson: 260, sel: 125 },
    factions: { guilde: .2, armateurs: .35, terriens: .1, ouvriers: .3, arcanistes: .05 }, tax: 0.01,
    desc: 'Pêcheries et salines. Les tempêtes d’automne y vident les filets.' },
  { id: 'bois',  name: 'Boisnoir', x: 170, y: 485, pop: [600, 250, 120, 30], raw: { bois: 45 },
    factions: { guilde: .2, armateurs: .4, terriens: .2, ouvriers: .15, arcanistes: .05 }, tax: 0.008,
    desc: 'Forêts sombres et chantiers navals. On y achète les meilleurs navires.' },
  { id: 'eclat', name: 'Haute-Éclat', x: 500, y: 105, pop: [400, 300, 150, 50], raw: { cristal: 12 },
    factions: { guilde: .15, armateurs: .05, terriens: .1, ouvriers: .2, arcanistes: .5 }, tax: 0.015, banned: ['essence'],
    desc: "Cité des arcanistes, où l'on taille le cristal d'éclat. L'essence de brume y est interdite." },
  { id: 'brum',  name: 'Brumaille', x: 560, y: 612, pop: [400, 180, 90, 30], raw: { champignon: 12 },
    factions: { guilde: .3, armateurs: .25, terriens: .1, ouvriers: .3, arcanistes: .05 }, tax: 0.005,
    desc: 'Marais noyés de brume. Alchimie, contrebande et rumeurs : la loi y est souple.' },
];
const I = {};
ISLANDS.forEach(i => { I[i.id] = i; });

// [a, b, danger pirates, brume]
const ROUTES = [
  ['port', 'ferre', 0.2, 0.2], ['port', 'verd', 0.15, 0.2], ['port', 'cora', 0.2, 0.3], ['port', 'bois', 0.2, 0.3],
  ['port', 'eclat', 0.1, 0.2], ['port', 'brum', 0.5, 0.8], ['ferre', 'eclat', 0.15, 0.2], ['eclat', 'verd', 0.15, 0.2],
  ['verd', 'cora', 0.2, 0.3], ['cora', 'brum', 0.6, 0.8], ['brum', 'bois', 0.7, 0.9], ['bois', 'ferre', 0.2, 0.3],
];

const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
const SEASON_LEN = 90;
const RAW_SEASON = { cereales: [0.8, 1.45, 1.0, 0.5], poisson: [1.0, 1.15, 0.8, 0.85] };
const STORM_SEASON = [0.6, 0.4, 2.6, 1.6];

const FACTIONS = { guilde: 'Guilde marchande', armateurs: 'Armateurs', terriens: 'Propriétaires terriens', ouvriers: 'Corporations ouvrières', arcanistes: 'Ordre des Arcanistes' };

const OPTION_GOODS = ['cereales', 'rations', 'fonte', 'eclat', 'outils', 'lanterne'];
const OPTION_VOL = { cereales: 0.5, rations: 0.4, fonte: 0.35, eclat: 0.5, outils: 0.3, lanterne: 0.4 };
const OPTION_SIZE = 10;

const STAGES = [
  { n: 1, name: 'Colporteur',    need: 'Départ' },
  { n: 2, name: 'Négociant',     need: 'Valeur nette de 5 000 §' },
  { n: 3, name: 'Manufacturier', need: 'Valeur nette de 12 000 §' },
  { n: 4, name: 'Spéculateur',   need: 'Acheter un siège à la Grande Bourse (2 500 §)' },
  { n: 5, name: 'Notable',       need: 'Prestige de 50' },
];

const NPC_DEFS = [
  // notables
  { id: 'isaure', name: 'Dame Isaure Vanterre', role: 'notable', home: 'port', title: 'Banquière, conseillère de Port-Sablier' },
  { id: 'hugues', name: 'Maître Hugues Fondaret', role: 'notable', home: 'ferre', title: 'Doyen des maîtres de forge' },
  { id: 'elvire', name: 'Comtesse Elvire des Blés', role: 'notable', home: 'verd', title: 'Première propriétaire des Verdanes' },
  { id: 'yann', name: 'Yann Kerbrume', role: 'notable', home: 'cora', title: 'Capitaine-maire de Corallie' },
  { id: 'anselme', name: 'Prévôt Anselme Écorce', role: 'notable', home: 'bois', title: 'Prévôt des chantiers navals' },
  { id: 'thessaly', name: 'Archimage Thessaly Prisme', role: 'notable', home: 'eclat', title: "Grande maîtresse de l'Ordre" },
  { id: 'morgaine', name: 'La Veuve Morgaine', role: 'notable', home: 'brum', title: 'Reine officieuse des marais' },
  // industriels
  { id: 'aldric', name: 'Aldric Moissonneur', role: 'industriel', home: 'verd', recipe: 'farine', level: 2 },
  { id: 'maelle', name: 'Maëlle Salvagne', role: 'industriel', home: 'cora', recipe: 'poisson_sale', level: 4 },
  { id: 'othon', name: 'Othon Bréville', role: 'industriel', home: 'port', recipe: 'rations', level: 2 },
  { id: 'jory', name: 'Jory Grainsel', role: 'industriel', home: 'cora', recipe: 'rations', level: 2 },
  { id: 'gaspard', name: 'Gaspard Fendebois', role: 'industriel', home: 'bois', recipe: 'planches', level: 1 },
  { id: 'ilse', name: 'Ilse Marteau-Noir', role: 'industriel', home: 'ferre', recipe: 'fonte', level: 1 },
  { id: 'bertrand', name: 'Bertrand Clou', role: 'industriel', home: 'ferre', recipe: 'outils', level: 2 },
  { id: 'seraphine', name: 'Séraphine Vitrail', role: 'industriel', home: 'eclat', recipe: 'eclat', level: 1 },
  { id: 'corwin', name: 'Corwin Ampoule', role: 'industriel', home: 'eclat', recipe: 'accu', level: 1 },
  { id: 'lucan', name: 'Lucan Lumen', role: 'industriel', home: 'port', recipe: 'lanterne', level: 1 },
  { id: 'nyx', name: 'Nyx Fangemousse', role: 'industriel', home: 'brum', recipe: 'essence', level: 1 },
  // capitaines
  { id: 'rosalind', name: 'Capitaine Rosalind Vire', role: 'capitaine', home: 'port' },
  { id: 'ewen', name: 'Ewen Cabestan', role: 'capitaine', home: 'verd' },
  { id: 'tibor', name: 'Tibor Grand-Largue', role: 'capitaine', home: 'cora' },
  { id: 'margot', name: 'Margot Amarre', role: 'capitaine', home: 'ferre' },
  { id: 'silas', name: 'Silas Écume', role: 'capitaine', home: 'bois' },
  { id: 'ondine', name: 'Ondine Bâbord', role: 'capitaine', home: 'eclat' },
  { id: 'rufus', name: 'Rufus Tribord', role: 'capitaine', home: 'port' },
  { id: 'leonce', name: 'Léonce Hune', role: 'capitaine', home: 'verd' },
  { id: 'perrine', name: 'Perrine Foc', role: 'capitaine', home: 'cora' },
  { id: 'bastien', name: 'Bastien Drisse', role: 'capitaine', home: 'port' },
  { id: 'fennec', name: 'Fennec le Rat', role: 'capitaine', home: 'brum', smuggler: true },
  { id: 'gwenola', name: 'Gwenola Carène', role: 'capitaine', home: 'bois' },
  { id: 'ambroise', name: 'Ambroise Misaine', role: 'capitaine', home: 'ferre' },
  { id: 'clemence', name: 'Clémence Beaupré', role: 'capitaine', home: 'eclat' },
  { id: 'octave', name: 'Octave Saumâtre', role: 'capitaine', home: 'brum' },
  { id: 'isolde', name: 'Isolde Vent-Debout', role: 'capitaine', home: 'port' },
  { id: 'mathurin', name: 'Mathurin Calfat', role: 'capitaine', home: 'cora' },
  { id: 'zelie', name: 'Zélie Grand-Mât', role: 'capitaine', home: 'verd' },
  // spéculateurs
  { id: 'valerian', name: 'Valérian Cours', role: 'speculateur', home: 'port', style: 'tendance' },
  { id: 'heloise', name: 'Héloïse Prudence', role: 'speculateur', home: 'port', style: 'valeur' },
  { id: 'barnabe', name: 'Barnabé Grippe', role: 'speculateur', home: 'port', style: 'accapareur' },
];

const ROLE_NAMES = { notable: 'Notable', industriel: 'Industriel', capitaine: 'Capitaine marchand', speculateur: 'Spéculateur' };
const STYLE_NAMES = { tendance: 'Suiveur de tendance', valeur: 'Investisseur de valeur', accapareur: 'Accapareur' };
const TRAITS = { audace: 'Audace', avidite: 'Avidité', credulite: 'Crédulité', loyaute: 'Loyauté', rancune: 'Rancune' };

const DATA = { GOODS, G, RECIPES, STRATA, STRATA_NAMES, NEEDS, INCOME, ISLANDS, I, ROUTES, SEASONS, SEASON_LEN, RAW_SEASON, STORM_SEASON,
  FACTIONS, OPTION_GOODS, OPTION_VOL, OPTION_SIZE, STAGES, NPC_DEFS, ROLE_NAMES, STYLE_NAMES, TRAITS };
if (typeof module !== 'undefined' && module.exports) module.exports = DATA; else root.ARCHIPEL_DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
