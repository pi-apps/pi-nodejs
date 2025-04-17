import esbuild from "esbuild";

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
  })
  .catch(() => process.exit(1));
