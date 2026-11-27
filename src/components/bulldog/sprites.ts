/**
 * Pixel art for the Bulldog design: a fawn-and-white bulldog with a red
 * collar, the same chunky outlined style as the mara and alpaca. Each picture
 * is rows of letters, one per pixel, coloured by BULLDOG_PALETTE ("." is
 * see-through). Symmetric pictures are drawn as their left halves.
 */
import { mirror, patch, sprite } from "@/components/mara/sprites";

export const BULLDOG_PALETTE: Record<string, string> = {
  k: "#2b1a12", // outline
  f: "#d99a5b", // fawn
  F: "#ad723c", // fawn shade, wrinkles
  w: "#f8f2e6", // white
  W: "#d9ccb8", // white shade
  p: "#e7a091", // inside of the ears
  e: "#140b06", // eye
  h: "#ffffff", // shine in the eye
  n: "#3a261c", // nose
  N: "#7a5848", // shine on the nose
  t: "#e0616b", // tongue
  o: "#7a2a2a", // inside of the mouth
  r: "#c0392b", // collar
  R: "#8e2a1f", // collar shade
  g: "#f2c14e", // gold stud and tag
  G: "#b8862a", // gold shade
  // the ball and the scene
  b: "#e94b3c", // ball
  B: "#a8322a", // ball shade
  y: "#fff1a8", // ball shine
};

const FACE_HALF = [
  "............",
  ".kkk........",
  "kfFpk.......",
  "kFppkkkkkkkk",
  ".kkfffffffff",
  "..kffFFfffww",
  ".kffffffFFww",
  ".kfffffffffw",
  "kfffkkkffffw",
  "kffkehkffffw",
  "kffkeekfffww",
  "kfffkkffwwww",
  "kffffffwwkkk",
  "kfffffwwknNn",
  "kffffwwwwknn",
  "kfffwwwwwwwk",
  "kffwwwwkkkkk",
  "kfwwwwkoohoo",
  ".kwwwwkkkkkk",
  ".kwwwWWWWWWW",
  "..kkwwWWWWWW",
  "....kkkkkkkk",
];

/** The bulldog's face, front on (24 × 22). */
export const BULLDOG_FACE = sprite(mirror(FACE_HALF));

/** Eyes shut. */
export const BULLDOG_FACE_BLINK = sprite(patch(BULLDOG_FACE.rows, [
  [8, 4, "f"], [8, 5, "f"], [8, 6, "f"], [9, 4, "f"], [9, 5, "f"], [9, 3, "f"], [9, 6, "f"], [10, 3, "k"], [10, 4, "k"], [10, 5, "k"], [10, 6, "f"], [11, 4, "f"], [11, 5, "f"],
  [8, 17, "f"], [8, 18, "f"], [8, 19, "f"], [9, 17, "f"], [9, 18, "f"], [9, 20, "f"], [9, 19, "f"], [10, 18, "k"], [10, 19, "k"], [10, 20, "k"], [10, 17, "f"], [11, 18, "f"], [11, 19, "f"],
]));
/** Looking to our right (where the ball comes from): both eyes one pixel over. */
export const BULLDOG_FACE_LOOK = sprite(
  ((rows: string[]) => {
    const grid = rows.map((row) => [...row]);
    const eye = [
      ["f", "f", "k", "k", "k"],
      ["f", "k", "e", "h", "k"],
      ["f", "k", "e", "e", "k"],
      ["f", "f", "k", "k", "f"],
    ];
    for (const left of [3, 17]) eye.forEach((line, dy) => line.forEach((c, dx) => (grid[8 + dy][left + dx] = c)));
    return grid.map((row) => row.join(""));
  })(BULLDOG_FACE.rows),
);
/** "Woof!": mouth wide open, tongue showing. */
export const BULLDOG_FACE_WOOF = sprite(mirror([
  ...FACE_HALF.slice(0, 16),
  "kffwwwwkkkkk",
  "kfwwwwkooooo",
  ".kwwwwkoottt",
  ".kwwwwkkottt",
  "..kkwwWkkkkk",
  "....kkkkkkkk",
]));
/** Panting: tongue out over the lower lip. */
export const BULLDOG_FACE_PANT = sprite(mirror([
  ...FACE_HALF.slice(0, 16),
  "kffwwwwkkkkk",
  "kfwwwwkoohoo",
  ".kwwwwkkkktt",
  ".kwwwWWWWktt",
  "..kkwwWWWWkt",
  "....kkkkkkkk",
]));

/** Sitting, front on, under the face: white chest, red studded collar with a gold tag, front legs and paws (26 × 14). */
export const BULLDOG_BODY = sprite(mirror([
  "..krrgrrrgrrr",
  "..kRRRRRRRRRg",
  ".kfffwwwwwwwG",
  ".kffwwwwwwwww",
  "kfffwwwwwwwww",
  "kffffwwwwwwww",
  "kfffkwwwwwkWW",
  "kfffkwwwwwkWW",
  "kfffkwwwwwkWW",
  "kfffkwwwwwkWW",
  "kfffkwwwwwkWW",
  "kffkwwwwwwwkW",
  "kffkwkwkwwwkW",
  ".kkkkkkkkkkkk",
]));

/** A red ball, and the same ball a quarter turn on (so it seems to roll). */
export const BALL = sprite([".kkkk.", "kbbybk", "kbbbbk", "kBbbbk", "kBBbbk", ".kkkk."]);
export const BALL_TURN = sprite([".kkkk.", "kbbbbk", "kbbbyk", "kbbbbk", "kBBbbk", ".kkkk."]);

/** A red food bowl. */
export const BOWL = sprite(["..kkkkkkkk..", ".kWwwwwwwWk.", "kbbbbbbbbbbk", ".kBbbbbbbBk.", "..kkkkkkkk.."]);

/** Scene colours: the den's brick wall and wooden floor. */
export const DEN_PALETTE: Record<string, string> = {
  ".": "#a4503a", // brick
  m: "#5e2a1d", // mortar
  h: "#bf6649", // brick, lit
  l: "#8a4130", // brick, shaded
};
/** One tile of the brick wall (16 × 8). */
export const BRICK_TILE = sprite([
  "mmmmmmmmmmmmmmmm",
  "mhhhhhhhhhhhhhhh",
  "m.....l.........",
  "mlllllllllllllll",
  "mmmmmmmmmmmmmmmm",
  "hhhhhhhhmhhhhhhh",
  "...h....m...l...",
  "llllllllmlllllll",
]);
export const FLOOR_PALETTE: Record<string, string> = {
  ".": "#8a5a36", // plank
  d: "#5a3820", // gap between planks
  h: "#a36e44", // plank, lit
  g: "#744a2b", // grain
};
/** One tile of the wooden floor (16 × 6). */
export const FLOOR_TILE = sprite([
  "hhhhhhhhhhhhhhhh",
  "......g.........",
  "..........gg....",
  ".gg.............",
  "dddddddddddddddd",
  "hhhhhhhhdhhhhhhh",
]);
