import esbuild from "esbuild";
import fs from "fs";
import path from "path";

esbuild
  .build({
    entryPoints: ["./src/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    minify: process.env.PI_ENV === "production",
    treeShaking: true,
    platform: "node",
    format: "cjs",
    target: "node16",
    define: {
      "process.env.PI_ENV": `"${process.env.PI_ENV || "development"}"`,
    },
    external: ["stellar-sdk", "axios", "dotenv"],
    legalComments: "linked",
  })
  .then(() => {
    const distDir = path.join(process.cwd(), "dist");
    const legalFile = path.join(distDir, "index.js.LEGAL.txt");
    const newLegalFile = path.join(distDir, "THIRD-PARTY-LICENSES.txt");

    if (fs.existsSync(legalFile)) {
      fs.renameSync(legalFile, newLegalFile);
    }
  })
  .catch(() => process.exit(1));
