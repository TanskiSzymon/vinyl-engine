import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { md5Hex } from "./md5";

const enc = new TextEncoder();

describe("md5Hex", () => {
  it("matches RFC 1321 test vectors", () => {
    expect(md5Hex(enc.encode(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Hex(enc.encode("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Hex(enc.encode("message digest"))).toBe("f96b697d7cb7938d525a2f31aaf161d0");
    expect(md5Hex(enc.encode("12345678901234567890123456789012345678901234567890123456789012345678901234567890")))
      .toBe("57edf4a22be3c955ac49da2e2107b67a");
  });
  it("matches node:crypto on random and block-boundary sizes", () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100000]) {
      const b = randomBytes(n);
      expect(md5Hex(new Uint8Array(b))).toBe(createHash("md5").update(b).digest("hex"));
    }
  });
});
