import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "real-estate-platform-prototype", "project");
const publicDir = path.join(rootDir, "public");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

copyDir(sourceDir, publicDir);

const openSansSrc = path.join(rootDir, "Open_Sans");
const openSansDest = path.join(publicDir, "Open_Sans");
if (fs.existsSync(openSansSrc)) {
  copyDir(openSansSrc, openSansDest);
}

console.log("Synced static assets to public/");
