/**
 * Small pixel props for the design scenes (LandscapeScene.tsx): rows of
 * letters, one per pixel, coloured by PROP_PALETTE ("." is see-through). The
 * same chunky outlined style as the mara and the bulldog.
 */
import { sprite } from "@/components/mara/sprites";

export const PROP_PALETTE: Record<string, string> = {
  k: "#1d1410", // outline
  w: "#ffffff", // white
  W: "#cfdcea", // snow shade
  e: "#111111", // eye
  o: "#f08a2a", // orange (carrot, pumpkin)
  O: "#b85a14", // orange shade
  r: "#d63a3a", // red
  R: "#8e2424", // red shade
  y: "#ffd23f", // yellow
  Y: "#d99a12", // yellow shade
  g: "#4f9a3a", // green
  G: "#2f6a24", // green shade
  b: "#6a4428", // brown
  B: "#3f2816", // brown shade
  s: "#5a6470", // steel
  S: "#2c333b", // steel shade
  l: "#fff3b0", // lamp light
  c: "#f26a4b", // crab
  C: "#a83a24", // crab shade
  u: "#3a7bd5", // blue
  U: "#1f4f99", // blue shade
  p: "#f28bb0", // pink
  P: "#c2557f", // pink shade
  n: "#3a3a3a", // noir coat
  N: "#6e6e6e", // noir coat, lit
  t: "#ffe680", // taxi light
};

export const SNOWMAN = sprite([
  "....kkk....",
  "...kwwwk...",
  "..kwekewk..",
  "..kwwoowk..",
  "...kwwwk...",
  "..krrrrrk..",
  ".kwwRrwwwk.",
  "kwwwwkwwwWk",
  "kwwwwwwwwWk",
  "kwwwwkwwwWk",
  ".kwwwwwwWk.",
  "kwwwwwwwwWk",
  "kwwwwwwwwWk",
  "kWwwwwwwWWk",
  ".kWWWWWWWk.",
  "..kkkkkkk..",
]);

export const PUMPKIN = sprite([
  ".....kk....",
  "....kGk....",
  "..kkkbkkk..",
  ".koOooOook.",
  "kooOooOooOk",
  "kooOooOooOk",
  "kooOooOooOk",
  ".koOooOook.",
  "..kkkkkkk..",
]);

export const SUNFLOWER = sprite([
  "...yyyy...",
  "..yYyyYy..",
  ".yybbbbyy.",
  ".YybBBbyY.",
  ".yybBBbyy.",
  ".yybbbbyy.",
  "..yYyyYy..",
  "...yyyy...",
  "....gG....",
  "..ggGG....",
  "..gGgG....",
  "....gGgg..",
  "....gGgG..",
  "....gG....",
  "....gG....",
  "....gG....",
]);

export const BUTTERFLY = sprite(["pk.kp", "PpkpP", ".pkp."]);
export const BUTTERFLY_UP = sprite([".pkp.", "ppkpp", "..k.."]);

export const BEE = sprite([".ww..", "kyky.", "ykyke", ".kk.."]);

export const GULL = sprite(["kk...kk", "..k.k..", "...k..."]);
export const BIRD = sprite(["k...k", ".k.k.", "..k.."]);

export const CRAB = sprite([
  "k.......k",
  "kc.....ck",
  ".kc.e.ck.",
  "..cccccc.",
  ".kcCCCCck",
  "k.k.k.k.k",
]);

export const UMBRELLA = sprite([
  ".....kkkkkk.....",
  "...kkrrwwrrkk...",
  "..krrrwwwwrrrk..",
  ".krrrwwwwwwrrrk.",
  "krrrrwwwwwwrrrrk",
  "kRkkRkkRkkRkkRkk",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
  ".......bk.......",
]);

/** A streetlamp (7 × 30): post and lantern. */
export const LAMP = sprite([
  "..kkk..",
  ".kSSSk.",
  "kslllsk",
  "kslllsk",
  ".kSSSk.",
  "...s...",
  "...s...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "...s...",
  "...S...",
  "..sSs..",
  ".sSSSs.",
  ".kkkkk.",
]);

/** A figure in a trench coat and hat, from behind (7 × 16). */
export const DETECTIVE = sprite([
  "..kkk..",
  ".knnnk.",
  "kkkkkkk",
  "..knk..",
  ".knNnk.",
  "knnNnnk",
  "knnNnnk",
  "knnNnnk",
  "knnNnnk",
  ".knNnk.",
  ".knnnk.",
  ".knknk.",
  ".kn.nk.",
  ".kn.nk.",
  ".kk.kk.",
  "kk...kk",
]);

/** A taxi from the side (16 × 7), with headlights. */
export const TAXI = sprite([
  "....kkkkkk......",
  "...kyuuyuuyk....",
  "..kyuuuyuuuyk...",
  "kkyyyyyyyyyyykkk",
  "kyyyyyyyyyyyyyyt",
  "kkkSSkkkkkkSSkkk",
  "...SS......SS...",
]);

/** A pine tree with snow on its branches (11 × 16). */
export const SNOWY_PINE = sprite([
  ".....k.....",
  "....kwk....",
  "...kgGgk...",
  "...kwwwk...",
  "..kgGgGgk..",
  "..kgwwwgk..",
  ".kgGgGgGgk.",
  ".kwwwgwwwk.",
  "kgGgGgGgGgk",
  "kgGgGgGgGgk",
  "kwwwwwwwwwk",
  "....kbk....",
  "....kBk....",
  "....kbk....",
  "...kkkkk...",
  "...........",
]);

/** An autumn tree: round orange and red crown on a trunk (13 × 16). */
export const AUTUMN_TREE = sprite([
  "....kkkkk....",
  "..kkoOrOokk..",
  ".kooOrroOook.",
  "kooOoorOoOook",
  "korOooOrroOok",
  "kooOrooOooOrk",
  ".korOooOrOok.",
  "..kkOooOokk..",
  "....kkbkk....",
  ".....kbk.....",
  ".....kbk.....",
  ".....kBk.....",
  ".....kbk.....",
  ".....kBk.....",
  "....kbbbk....",
  "....kkkkk....",
]);
