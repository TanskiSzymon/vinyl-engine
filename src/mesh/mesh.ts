// A minimal mesh buffer: vertices and triangles in typed arrays, because a disc has
// hundreds of thousands of them and arrays of objects would eat the browser's memory.

export class Mesh {
  private vx: number[] = [];
  private tri: number[] = [];

  /** Adds a vertex and returns its index. */
  v(x: number, y: number, z: number): number {
    this.vx.push(x, y, z);
    return this.vx.length / 3 - 1;
  }

  /** A triangle in the given vertex order; the normal follows the right hand rule. */
  t(a: number, b: number, c: number): void {
    this.tri.push(a, b, c);
  }

  /** A quad a-b-c-d, split into two triangles. */
  quad(a: number, b: number, c: number, d: number): void {
    this.t(a, b, c);
    this.t(a, c, d);
  }

  get vertexCount(): number { return this.vx.length / 3; }
  get triangleCount(): number { return this.tri.length / 3; }
  get vertices(): Float64Array { return Float64Array.from(this.vx); }
  get triangles(): Uint32Array { return Uint32Array.from(this.tri); }

  /**
   * Checks watertightness: in a closed solid every edge has to appear exactly twice, once in each
   * direction. Returns a list of problems, empty when the mesh is sound.
   */
  checkManifold(limit = 10): string[] {
    const seen = new Map<string, number>();
    const tri = this.tri;
    for (let i = 0; i < tri.length; i += 3) {
      for (const [a, b] of [[tri[i], tri[i + 1]], [tri[i + 1], tri[i + 2]], [tri[i + 2], tri[i]]]) {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        const dir = a < b ? 1 : -1;
        seen.set(key, (seen.get(key) ?? 0) + dir);
      }
    }
    const bad: string[] = [];
    for (const [key, sum] of seen) {
      if (sum !== 0) {
        bad.push(`edge ${key}: balance ${sum}`);
        if (bad.length >= limit) break;
      }
    }
    return bad;
  }
}
