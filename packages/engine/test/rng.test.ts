import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";

describe("createRng", () => {
  it("is deterministic per seed", () => {
    const a = createRng(7), b = createRng(7), c = createRng(8);
    const seq = (r: ReturnType<typeof createRng>) => Array.from({ length: 5 }, () => r.next());
    const sa = seq(a);
    expect(seq(b)).toEqual(sa);
    expect(seq(c)).not.toEqual(sa);
  });

  it("int stays in bounds, pick/shuffle/hex behave", () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(["x"]).toContain(r.pick(["x"]));
    expect(() => r.pick([])).toThrow();
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(r.hex(40)).toMatch(/^[0-9a-f]{40}$/);
  });
});
