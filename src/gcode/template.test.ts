import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { packGcode3mfBytes } from "./pack3mf";
import { packGcode3mf, readTemplate } from "./template-node";
import { disableSpaghettiDetector, patchLayerCount, patchLevelingArea, readTemplateBytes, splitGcode } from "./template";

const sample = [
  "; HEADER_BLOCK_START", "; total layer number: 5", "; HEADER_BLOCK_END",
  "M104 S220", "G28", "; MACHINE_START_GCODE_END", "M83",
  "; CHANGE_LAYER", "; Z_HEIGHT: 0.2", "G1 X1 Y1 E0.1",
  "; MACHINE_END_GCODE_START", "M104 S0", "M140 S0", "; MACHINE_END_GCODE_END", "",
].join("\n");

describe("splitGcode", () => {
  it("header ends before first CHANGE_LAYER, footer starts at MACHINE_END_GCODE_START", () => {
    const { header, footer } = splitGcode(sample);
    expect(header.endsWith("M83\n")).toBe(true);
    expect(header).not.toContain("CHANGE_LAYER");
    expect(footer.startsWith("; MACHINE_END_GCODE_START")).toBe(true);
    expect(footer).toContain("M140 S0");
  });
  it("patches the declared layer count and can comment out the spaghetti detector", () => {
    const { header } = splitGcode(sample.replace("G28", "G28\nM981 S1 P20000 ;open spaghetti detector"));
    expect(patchLayerCount(header, 9)).toContain("; total layer number: 9");
    expect(patchLayerCount(header, 9)).not.toContain("total layer number: 5");
    expect(patchLayerCount("M73 P56 R4\nG28\n", 9)).not.toMatch(/^M73 P/m);
    const off = disableSpaghettiDetector(header);
    expect(off).toContain("; M981 S1 P20000");
    expect(off).not.toMatch(/^M981/m);
  });
  it("grows the bed probing area from the cube's bounding box to the disc's", () => {
    const header = "G28\n    G29 A X123 Y123 I10 J10\n    M400\n";
    const out = patchLevelingArea(header, 128, 128, 125, 256);
    expect(out).toContain("    G29 A X0 Y0 I256 J256");
    const small = patchLevelingArea(header, 128, 128, 85, 256);
    expect(small).toContain("G29 A X38 Y38 I180 J180");
    expect(patchLevelingArea("G28\n", 128, 128, 85, 256)).toBe("G28\n"); // no G29 means no change
  });
  it("throws with a hint when markers are missing", () => {
    expect(() => splitGcode("G28\nG1 X1\n")).toThrow(/CHANGE_LAYER/);
  });
});

describe("readTemplate + packGcode3mf", () => {
  it("works on raw bytes too, which is the path the browser uses", () => {
    const zip = zipSync({ "Metadata/plate_1.gcode": strToU8(sample) });
    const t = readTemplateBytes(zip);
    const out = unzipSync(packGcode3mfBytes(t, "G28\n"));
    expect(strFromU8(out["Metadata/plate_1.gcode"])).toBe("G28\n");
    expect(strFromU8(out["Metadata/plate_1.gcode.md5"])).toMatch(/^[0-9A-F]{32}$/);
  });
  it("replaces gcode and md5, keeps other entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "3mf-"));
    const tpl = join(dir, "template.gcode.3mf");
    writeFileSync(tpl, zipSync({
      "Metadata/plate_1.gcode": strToU8(sample),
      "Metadata/plate_1.gcode.md5": strToU8("ABC"),
      "Metadata/plate_1.json": strToU8("{}"),
      "[Content_Types].xml": strToU8("<x/>"),
    }));
    const t = readTemplate(tpl);
    expect(t.gcodeName).toBe("Metadata/plate_1.gcode");
    const out = join(dir, "out.gcode.3mf");
    packGcode3mf(t, "G28\nG1 X5 Y5 E1\n", out);
    const z = unzipSync(new Uint8Array(readFileSync(out)));
    expect(strFromU8(z["Metadata/plate_1.gcode"])).toContain("G1 X5 Y5 E1");
    expect(strFromU8(z["Metadata/plate_1.gcode.md5"])).toMatch(/^[0-9A-F]{32}$/);
    expect(strFromU8(z["Metadata/plate_1.json"])).toBe("{}");
  });
});
