// Bundle the managed Function so the release ships one Node entry point
// instead of thousands of SDK files. The source remains runnable with npm.
const path = require("node:path");
const fs = require("node:fs/promises");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const esbuild = createRequire(path.join(root,"web","package.json"))("esbuild");

async function pack() {
  const out = path.join(root, ".local", "function-app");
  const bindingDir = path.join(out,"sponsorship");
  await fs.mkdir(bindingDir,{recursive:true});
  await fs.mkdir(path.join(out,"downloads"),{recursive:true});
  await esbuild.build({entryPoints:[path.join(root,"api","sponsorship","index.js")],outfile:path.join(out,"app.js"),bundle:true,platform:"node",target:"node22",format:"cjs",legalComments:"eof"});
  const binding = JSON.parse(await fs.readFile(path.join(root,"api","sponsorship","function.json"),"utf8"));
  binding.scriptFile="../app.js";
  await Promise.all([
    fs.writeFile(path.join(bindingDir,"function.json"),JSON.stringify(binding,null,2)),
    fs.writeFile(path.join(out,"package.json"),JSON.stringify({name:"nami-partnerships-function",private:true,version:"1.0.0"})),
    fs.copyFile(path.join(root,"api","host.json"),path.join(out,"host.json")),
    fs.copyFile(path.join(root,"web","public","content.json"),path.join(out,"defaults.json")),
    ...["guide-cover.jpg","sponsor-guide.pdf"].map(name=>fs.copyFile(path.join(root,"web","public","downloads",name),path.join(out,"downloads",name)))
  ]);
  console.log("Packaged managed API ("+ Math.ceil((await fs.stat(path.join(out,"app.js"))).size/1024)+" KiB)");
}
pack().catch(error=>{console.error(error.message);process.exitCode=1;});

