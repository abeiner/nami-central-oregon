const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {LocalStore} = require("./store");
const {createService} = require("./service");
const {createHandler} = require("./handler");
const port = Number(process.env.PORT || 7071);
const origin = "http://localhost:" + port;
const directory = path.resolve(__dirname,"../.local/state");
const root=path.resolve(__dirname,"../web/dist");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".svg":"image/svg+xml",".webp":"image/webp",".woff2":"font/woff2",".pdf":"application/pdf",".ico":"image/x-icon"};
async function run() {
  await fs.mkdir(directory,{recursive:true});
  const keyFile=path.join(directory,"staff-key");
  try {await fs.writeFile(keyFile,crypto.randomBytes(24).toString("base64url"),{flag:"wx",mode:0o600});} catch(e){if(e.code!=="EEXIST") throw e;}
  const dispatch = createHandler(createService(new LocalStore(directory),{origin}), process.env.ADMIN_KEY || (await fs.readFile(keyFile,"utf8")).trim());
  http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,origin);
      if (!url.pathname.startsWith("/api/")) {
        const pathname=decodeURIComponent(url.pathname);
        let file=path.resolve(root,"."+pathname+(pathname.endsWith("/") ? "index.html" : ""));
        if (!file.startsWith(root+path.sep)) {res.writeHead(404).end();return;}
        try {if (!(await fs.stat(file)).isFile()) file=path.join(file,"index.html");}
        catch { if (!path.extname(file)) file=path.join(root,"index.html"); }
        try {const data=await fs.readFile(file);res.writeHead(200,{"Content-Type":types[path.extname(file)] || "application/octet-stream"}).end(req.method==="HEAD"?undefined:data);}
        catch {res.writeHead(404).end("Build the web app first.");}
        return;
      }
      const chunks=[];let size=0;
      for await(const chunk of req) {
        size+=chunk.length;
        if (size>3200000) {res.writeHead(413).end("Request too large");return;} chunks.push(chunk);
      }
      const result=await dispatch({method:req.method,url:url.href,headers:req.headers,body:Buffer.concat(chunks).toString("utf8")});
      res.writeHead(result.status,result.headers).end(result.body == null ? undefined : typeof result.body==="string" || Buffer.isBuffer(result.body) ? result.body : JSON.stringify(result.body));
    } catch { if (!res.headersSent) res.writeHead(500);res.end(); }
  }).listen(port,"127.0.0.1",()=>console.log("Sponsorship app on "+origin+" • Local staff key: .local/state/staff-key"));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

