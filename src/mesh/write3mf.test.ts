import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { Mesh } from "./mesh";
import { modelXml, write3mf } from "./write3mf";

function tetra(): Mesh {
  const m = new Mesh();
  const a = m.v(0, 0, 0), b = m.v(10, 0, 0), c = m.v(0, 10, 0), d = m.v(0, 0, 10);
  m.t(a, c, b); m.t(a, b, d); m.t(b, c, d); m.t(c, a, d);
  return m;
}

describe("3MF", () => {
  it("archiwum ma wymagane wpisy", () => {
    const z = unzipSync(write3mf(tetra(), "Test"));
    expect(Object.keys(z).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
    expect(strFromU8(z["_rels/.rels"])).toContain("/3D/3dmodel.model");
  });

  it("model podaje milimetry, wszystkie wierzcholki i trojkaty", () => {
    const xml = strFromU8(modelXml(tetra(), "Test"));
    expect(xml).toContain('unit="millimeter"');
    expect(xml.match(/<vertex /g)).toHaveLength(4);
    expect(xml.match(/<triangle /g)).toHaveLength(4);
    expect(xml).toContain('<vertex x="10" y="0" z="0"/>');
    expect(xml).toContain("<build>");
  });

  it("a large mesh loses no vertices when it is written in chunks", () => {
    const m = new Mesh();
    const n = 40000;
    for (let i = 0; i < n; i += 1) m.v(i * 0.001, i * 0.002, i * 0.003);
    for (let i = 0; i + 2 < n; i += 3) m.t(i, i + 1, i + 2);
    const xml = strFromU8(modelXml(m, "Big"));
    expect(xml.match(/<vertex /g)).toHaveLength(n);
    expect(xml.endsWith("</model>\n")).toBe(true);
  });
});
