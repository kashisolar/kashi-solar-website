const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const output = path.join(root, "dist");
const requiredFiles = ["index.html", "privacy-policy.html", "team-solar-assessment.html", "robots.txt"];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of requiredFiles) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Required website file is missing: ${file}`);
  }
  fs.copyFileSync(source, path.join(output, file));
}

const imagesSource = path.join(root, "images");
if (!fs.existsSync(imagesSource)) {
  throw new Error("The images directory is missing.");
}
fs.cpSync(imagesSource, path.join(output, "images"), { recursive: true });

console.log("Built Kashi Solar static website into dist/ (Netlify functions remain outside the publish folder).");
