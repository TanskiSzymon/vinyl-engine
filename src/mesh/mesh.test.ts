import { describe, expect, it } from "vitest";
import { Mesh } from "./mesh";

describe("Mesh", () => {
  it("a tetrahedron is watertight", () => {
    const m = new Mesh();
    const a = m.v(0, 0, 0), b = m.v(1, 0, 0), c = m.v(0, 1, 0), d = m.v(0, 0, 1);
    m.t(a, c, b); m.t(a, b, d); m.t(b, c, d); m.t(c, a, d);
    expect(m.checkManifold()).toEqual([]);
    expect(m.triangleCount).toBe(4);
    expect(m.vertexCount).toBe(4);
  });

  it("brakujaca sciana psuje szczelnosc", () => {
    const m = new Mesh();
    const a = m.v(0, 0, 0), b = m.v(1, 0, 0), c = m.v(0, 1, 0), d = m.v(0, 0, 1);
    m.t(a, c, b); m.t(a, b, d); m.t(b, c, d);
    expect(m.checkManifold().length).toBeGreaterThan(0);
  });

  it("odwrocona sciana psuje szczelnosc", () => {
    const m = new Mesh();
    const a = m.v(0, 0, 0), b = m.v(1, 0, 0), c = m.v(0, 1, 0), d = m.v(0, 0, 1);
    m.t(a, c, b); m.t(a, b, d); m.t(b, c, d); m.t(a, c, d); // ostatnia w zlej kolejnosci
    expect(m.checkManifold().length).toBeGreaterThan(0);
  });
});
