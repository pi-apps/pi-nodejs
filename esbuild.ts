import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ["./src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  minify: process.env.PI_ENV === "production",
  treeShaking: true,
  platform: "node",
  format: "esm",
  target: "es2020",
  define: {
    "process.env.PI_ENV": `"${process.env.PI_ENV || "development"}"`,
  },
  // Keep every dependency external: bundling a CommonJS one such as @stellar/stellar-sdk into this ESM output
  // breaks its require() calls.
  packages: "external",
  legalComments: "linked" as const,
};

// CommonJS build, so `require("pi-backend")` keeps working as it did in 0.1.x. It has no import.meta, so the config
// loader's import.meta.url is computed from __filename instead.
const cjsBuildOptions: esbuild.BuildOptions = {
  ...buildOptions,
  outfile: "dist/index.cjs",
  format: "cjs",
  define: { ...buildOptions.define, "import.meta.url": "__piImportMetaUrl" },
  banner: { js: 'const __piImportMetaUrl = require("url").pathToFileURL(__filename).href;' },
  // The ESM build already writes the license file.
  legalComments: "none",
};

async function build() {
  try {
    if (process.argv.includes("--watch")) {
      for (const options of [buildOptions, cjsBuildOptions]) {
        const ctx = await esbuild.context(options);
        await ctx.watch();
      }
      console.log("Watching for file changes...");
    } else {
      await Promise.all([esbuild.build(buildOptions), esbuild.build(cjsBuildOptions)]);
    }

    const distDir = path.join(process.cwd(), "dist");
    const legalFile = path.join(distDir, "index.js.LEGAL.txt");
    const newLegalFile = path.join(distDir, "THIRD-PARTY-LICENSES.txt");
    if (fs.existsSync(legalFile)) {
      fs.renameSync(legalFile, newLegalFile);
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
