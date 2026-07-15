// scripts/write-build-info.js
// Run as a `prebuild` step so /api/status can report a real "last deploy" time.
//
// package.json:
//   "scripts": {
//     "prebuild": "node scripts/write-build-info.js",
//     "build": "next build"
//   }

const fs = require("fs");
const path = require("path");

const info = {
  builtAt: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
};

const outPath = path.join(process.cwd(), "public", "build-info.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(info));
console.log("[build-info]", info);
