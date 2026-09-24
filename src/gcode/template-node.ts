// The file level wrapper for the CLI. The browser uses readTemplateBytes / packGcode3mfBytes.
import { readFileSync, writeFileSync } from "node:fs";
import { packGcode3mfBytes } from "./pack3mf";
import { readTemplateBytes, type PrintMeta, type Template } from "./template";

export function readTemplate(path: string): Template {
  return readTemplateBytes(new Uint8Array(readFileSync(path)));
}

export function packGcode3mf(t: Template, fullGcode: string, outPath: string, meta?: PrintMeta): void {
  writeFileSync(outPath, packGcode3mfBytes(t, fullGcode, meta));
}
