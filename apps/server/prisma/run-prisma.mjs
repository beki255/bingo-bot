import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const args = process.argv.slice(2);
const res = spawnSync("pnpm", ["exec", "prisma", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(res.status ?? 1);

