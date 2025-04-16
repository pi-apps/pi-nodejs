import dotenv from "dotenv";
import path from "path";

export const config = dotenv.config({
  path: path.resolve(__dirname, "../.env"),
}).parsed;
