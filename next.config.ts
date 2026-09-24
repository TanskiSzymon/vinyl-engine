import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the repository root on dev startup; this is a
  // published project, and those files are noise in it.
  agentRules: false,
  // All the work (audio decoding, geometry, G-code) happens in the browser, so the app is
  // static and the user's audio never leaves their machine.
  reactStrictMode: true,
};

export default nextConfig;
