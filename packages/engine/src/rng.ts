// Seeded PRNG (mulberry32). The simulator must never use Math.random.
export interface Rng {
  next(): number;                            // [0, 1)
  int(min: number, max: number): number;     // inclusive
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];               // in place
  hex(chars: number): string;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j]!, items[i]!];
      }
      return items;
    },
    hex: (chars) => {
      let out = "";
      while (out.length < chars) out += Math.floor(next() * 0x100000000).toString(16).padStart(8, "0");
      return out.slice(0, chars);
    },
  };
}
