const {createHash,timingSafeEqual} = require("node:crypto");
const {templates,fail} = require("./program");
function same(a,b) {
  const digest=value=>createHash("sha256").update(String(value)).digest();
  return Boolean(a && b) && timingSafeEqual(digest(a),digest(b));
}
const baseHeaders = {"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
function createHandler(service,secret) {
  return async function handle(req) {
    try {
      const url=new URL(req.url,service.origin);
      const path=url.pathname.replace(/^\/api(?=\/|$)/,"").replace(/\/$/,"");
      const headers=Object.fromEntries(Object.entries(req.headers || {}).map(([k,v])=>[k.toLowerCase(),v]));
      const admin=same(headers["x-admin-key"] || (headers.authorization || "").replace(/^Bearer /i,""),secret);
      const method=req.method.toUpperCase();
      const json=(body,status=200)=>({status,headers:{...baseHeaders,"Content-Type":"application/json; charset=utf-8"},body});
      if (Number(headers["content-length"]) > 3200000) fail(413,"Request is too large.");
      if (path==="/mcp" && Object.hasOwn(headers,"origin")) return json({jsonrpc:"2.0",id:null,error:{code:-32000,message:"Browser origins are forbidden."}},403);
      if ((path==="/mcp" || path.startsWith("/admin/")) && !admin)
        return {status:401,headers:{...baseHeaders,"WWW-Authenticate":'Bearer realm="NAMI staff"',"Content-Type":"application/json"},body:{error:"Staff access key required."}};
      if (method==="GET" && path==="/health") return json({ok:true,demo:service.demo,mail:"logged",payment:"offline"});
      if (method==="GET" && path==="/content") return json(await service.content());
      if (method==="GET" && path==="/guide.pdf") return {status:200,headers:{...baseHeaders,"Content-Type":"application/pdf","Content-Disposition":'inline; filename="NAMI-partnership-guide.pdf"'},body:await service.guide()};
      if (path==="/mcp") {
        const handler=require("./mcp");
        const reply=await handler({...req,headers},service);
        return {...reply,headers:{...baseHeaders,...reply.headers}};
      }
      let body=req.body;
      if (typeof body === "string" && body.length) {
        if (Buffer.byteLength(body)>3200000) fail(413,"Request is too large.");
        try {body=JSON.parse(body);} catch {fail(400,"Invalid JSON.");}
      }
      if (method==="POST" && path==="/demo/preview") return json(await service.preview(body || {}));
      if (method==="POST" && path==="/events") return json(await service.event(body));
      if (method==="POST" && path==="/sponsorships") return json(await service.commit(body,headers["idempotency-key"],headers["x-journey-id"]),201);
      const invoice=path.match(/^\/sponsorships\/([a-f0-9-]+)\/invoice$/);
      if (method==="GET" && invoice) return {status:200,headers:{...baseHeaders,"Content-Type":"text/html; charset=utf-8",
        "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"},body:await service.invoice(invoice[1],url.searchParams.get("access"),admin)};
      if (method==="GET" && path==="/admin/sponsors") return json(await service.list());
      if (method==="POST" && path==="/admin/sponsors") return json(await service.prospect(body),201);
      if (method==="GET" && path==="/admin/tasks") return json(await service.tasks());
      if (method==="GET" && path==="/admin/conversions") return json(await service.conversions());
      if (method==="GET" && path==="/admin/templates") return json(templates);
      if (method==="PUT" && path==="/admin/content") return json(await service.saveContent(body));
      const sponsor=path.match(/^\/admin\/sponsors\/([a-f0-9-]+)(\/email)?$/);
      if (sponsor) {
        if (!sponsor[2] && method==="PATCH") return json(await service.patch(sponsor[1],body));
        if (!sponsor[2] && method==="GET") return json(await service.get(sponsor[1]));
        if (sponsor[2] && method==="POST") return json(await service.email(sponsor[1],body?.templateId));
      }
      if (method==="GET" && path==="/admin/export.csv") {
        const cell=x=>{
          const value=String(x ?? "");
          return '"' + (/^[\s]*[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"','""') + '"';
        };
        const data=[["Company","Stage","Program year","Committed USD","Invoice","Due","Paid","Renewal","Open benefits","Recognition"],
          ...(await service.list()).map(s=>[s.company.name,s.status,s.programYear,s.total,s.invoice.number,s.invoice.dueAt,s.invoice.paidAt,s.renewalDate,s.benefits.filter(b=>!b.doneAt).length,s.recognition.listPublicly?"Public":"Private"])];
        return {status:200,headers:{...baseHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="sponsorships.csv"'},body:"\uFEFF"+data.map(row=>row.map(cell).join(",")).join("\r\n")};
      }
      return json({error:"Route not found."},404);
    } catch (error) {
      const status=error.status || 500;
      if (status >= 500) console.error("Sponsorship API failed:",error.name,error.code || "",error.statusCode || "");
      return {status,headers:{...baseHeaders,"Content-Type":"application/json"},body:{error:status<500 ? error.message : "The service could not finish this request. Please try again."}};
    }
  };
}
module.exports = {createHandler};

