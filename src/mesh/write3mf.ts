// Writing a mesh to 3MF. The format is an ordinary ZIP with the model as XML, so it is assembled
// by hand: no extra dependency, and the size has to be controlled anyway, since a disc is hundreds
// of thousands of triangles.
//
// The XML is built in chunks into a byte array instead of one huge string: at 300 thousand
// wierzcholkow konkatenacja stringow potrafi wywalic pamiec przegladarki.
import { zipSync, strToU8 } from "fflate";
import type { Mesh } from "./mesh";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** A number to three decimals with no trailing zeros, which halves the file size. */
function num(v: number): string {
  const s = v.toFixed(3);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function modelXml(mesh: Mesh, name: string): Uint8Array {
  const v = mesh.vertices, t = mesh.triangles;
  const chunks: Uint8Array[] = [];
  let buf = "";
  const push = (s: string) => {
    buf += s;
    if (buf.length > 1 << 20) { chunks.push(strToU8(buf)); buf = ""; }
  };
  push(`<?xml version="1.0" encoding="UTF-8"?>\n`);
  push(`<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`);
  push(` <metadata name="Title">${name}</metadata>\n`);
  push(` <metadata name="Application">vinyl-engine</metadata>\n`);
  push(` <resources>\n  <object id="1" type="model">\n   <mesh>\n    <vertices>\n`);
  for (let i = 0; i < v.length; i += 3) {
    push(`     <vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>\n`);
  }
  push(`    </vertices>\n    <triangles>\n`);
  for (let i = 0; i < t.length; i += 3) {
    push(`     <triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>\n`);
  }
  push(`    </triangles>\n   </mesh>\n  </object>\n </resources>\n`);
  push(` <build>\n  <item objectid="1"/>\n </build>\n</model>\n`);
  chunks.push(strToU8(buf));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export function write3mf(mesh: Mesh, name: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": modelXml(mesh, name),
  }, { level: 6 });
}
