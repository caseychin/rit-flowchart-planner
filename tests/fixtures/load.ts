import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function loadFixture(sourceDir: "programs-api" | "tigercenter", name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${sourceDir}/${name}`, import.meta.url)), "utf8");
}
