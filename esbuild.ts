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
  external: ["stellar-sdk", "axios", "dotenv"],
  legalComments: "linked" as const,
};

async function build() {
  try {
    if (process.argv.includes("--watch")) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("Watching for file changes...");
    } else {
      await esbuild.build(buildOptions);
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
