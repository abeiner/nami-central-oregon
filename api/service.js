const fs = require("node:fs/promises");
const path = require("node:path");
const {createHash} = require("node:crypto");
const p = require("./program");
const {render} = require("./invoice");
const {createMetrics,hashVisitId}=require("./metrics");
const hash = value => createHash("sha256").update(value).digest("hex");
const sampleCompanies = ["Juniper & Pine Books","Rimrock Letterpress","North Fork Bicycle Co."];
const ledgerKey = "staff/ledger.json";
async function defaults() {
  const root = path.join(__dirname,"..","web","public","content.json");
  try { return JSON.parse(await fs.readFile(root,"utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return JSON.parse(await fs.readFile(path.join(__dirname,"defaults.json"),"utf8"));
  }
}
function validateContent(data, base) {
  if (!data || JSON.stringify(data).length > 150000) p.fail(400,"Program content is missing or too large.");
  function check(sample, value) {
    if (Array.isArray(sample)) {
      if (!Array.isArray(value) || value.length > 100) p.fail(400,"A content list is invalid.");
      if (sample.length) for (const x of value) check(sample[0], x);
    } else if (sample && typeof sample === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) p.fail(400,"A content section is invalid.");
      for (const [k,v] of Object.entries(sample)) if (!["plus","featured","includes","inquiryOnly","badge","limit","suffix","causes","onlineUrl"].includes(k)) check(v,value[k]);
    } else if (typeof sample !== typeof value || (typeof value === "string" && value.length > 8000)) p.fail(400,"A content field has the wrong type or length.");
  }
  check(base,data);
  if (data.payment.onlineUrl) {
    let url;
    try {url=new URL(data.payment.onlineUrl);} catch {p.fail(400,"Enter an HTTPS payment link.");}
    if (url.protocol!=="https:" || url.username || url.password) p.fail(400,"Enter an HTTPS payment link.");
  }
  if (data.causes!==undefined && (!Array.isArray(data.causes) || data.causes.length>35 || data.causes.some(c=>!c || !/^[a-z0-9-]{1,80}$/.test(c.id) || ![c.label,c.programs,c.impact].every(x=>typeof x==="string" && x.trim() && x.length<4000) || !Array.isArray(c.opportunities) || !c.opportunities.every(id=>typeof id==="string")))) p.fail(400,"Choose valid cause labels and sponsorship options.");
  if (!data.tiers.length || !data.projects.length || !data.agreement.length) p.fail(400,"The program requires tiers, projects and agreement terms.");
  const validIds = list => list.every(x=>/^[a-z0-9-]{1,80}$/.test(x.id)) && new Set(list.map(x=>x.id)).size === list.length;
  if (!validIds(data.tiers) || !validIds(data.projects)) p.fail(400,"Tier and project identifiers must be unique.");
  for (const x of data.projects) if (!["project","namiwalks"].includes(x.kind) || !x.levels.length || !validIds(x.levels)) p.fail(400,"Each project needs valid levels.");
  if (!Number.isInteger(data.payment.netDays) || data.payment.netDays < 1 || data.payment.netDays > 365) p.fail(400,"Invoice terms must be between 1 and 365 days.");
  for (const item of p.catalog(data).values()) {
    if (!Number.isSafeInteger(item.amount) || item.amount < 1 || item.amount > 1000000 || (item.limit != null && (!Number.isInteger(item.limit) || item.limit < 1))) p.fail(400,"Check package pricing and availability.");
    for (const b of item.benefits) if (!b.id || !b.label || !Number.isInteger(b.dueInDays) || b.dueInDays < 0 || b.dueInDays > 730 || !Number.isFinite(b.staffMinutes) || b.staffMinutes < 0) p.fail(400,"Check benefit deadlines and staff effort.");
  }
}
function sampleApplication(content, projectId, levelId, companyName, listPublicly) {
  const item = p.catalog(content).get(projectId + ":" + levelId);
  if (!sampleCompanies.includes(companyName) || !item) p.fail(400,"Choose one of the sample businesses and project levels.");
  return {company:{name:companyName},contact:{name:"Sample Sponsor",email:"partner@example.invalid"},recognition:{displayName:companyName,listPublicly},
    selections:[{kind:item.kind,id:item.id,amount:item.amount}],total:item.amount,payment:{method:"invoice"},agreement:{accepted:true,signerName:"Sample Sponsor"}};
}
function recordPayment(sponsor, at) {
  sponsor.invoice.paidAt = at;
  const delay = Date.parse(at) - Date.parse(sponsor.invoice.issuedAt);
  for (const benefit of sponsor.benefits) {
    if (!benefit.doneAt) benefit.dueAt = new Date(Date.parse(benefit.dueAt) + delay).toISOString();
  }
  if (sponsor.renewalDate) {
    const renewal = new Date(at);
    renewal.setUTCFullYear(renewal.getUTCFullYear() + 1);
    sponsor.renewalDate = renewal.toISOString();
  }
}
function createService(store, {demo = true,origin = "http://localhost:7071"} = {}) {
  const metrics=createMetrics(store);
  let currentGuide;
  async function downloadAsset(name) {
    try { return await fs.readFile(path.join(__dirname,"downloads",name)); }
    catch (error) { if (error.code!=="ENOENT") throw error; }
    return fs.readFile(path.join(__dirname,"..","web","public","downloads",name));
  }
  async function content() {
    const saved=(await store.read("staff/content.json"))?.value;
    if (!saved) return defaults();
    if (!saved.causes) return {...saved,causes:(await defaults()).causes};
    return saved;
  }
  async function edit(key, seed, fn) {
    for (let attempt=0; attempt<8; attempt++) {
      const previous = await store.read(key);
      const current = previous?.value ?? await seed();
      const result = await fn(current);
      if (await store.write(key,current,previous?.version)) return result;
    }
    p.fail(409,"Another update is in progress. Please retry.");
  }
  async function initialRows() {
    if (!demo) return [];
    const c = await content();
    const prospect = p.makeRecord({company:{name:"Sample · Juniper Trail Bindery"},contact:{name:"Sample contact",email:"bindery@example.invalid"},notes:"Fictional pilot prospect. Ask about the Resource Guide."}, c,true);
    const offer = c.tiers.find(t=>!t.inquiryOnly);
    if (!offer) return [prospect];
    const sample = p.makeRecord({company:{name:"Sample · Painted Mesa Printworks"},contact:{name:"Sample liaison",email:"printworks@example.invalid"},
      recognition:{listPublicly:true},selections:[{id:offer.id,kind:"annual",amount:offer.amount}],total:offer.amount,payment:{method:"invoice"},agreement:{accepted:true,signerName:"Sample liaison"}},c);
    sample.status="paid"; recordPayment(sample,p.iso());
    sample.activity.push({at:p.iso(),type:"payment",text:"Fictional payment for the demonstration."});
    return [sample,prospect];
  }
  async function rows() {
    const existing = await store.read(ledgerKey);
    if (existing) return existing.value;
    return edit(ledgerKey,initialRows,r=>r);
  }
  function find(records,id) {
    const s=records.find(s=>s.id === id);
    if (!s) p.fail(404,"Sponsor not found.");
    return s;
  }
  async function hydrate(s) {
    const visible=p.visible(s);
    if (s.invoice.number) visible.invoice={...s.invoice,url:p.invoiceUrl(s)};
    if (s.logoRef) visible.recognition={...s.recognition,logoDataUrl:(await store.read(s.logoRef))?.value ?? null};
    return visible;
  }
  const service = {
    content, demo,origin,
    async event(input) {
      if (input?.causeId && !(await content()).causes?.some(c=>c.id===input.causeId)) p.fail(400,"Unknown cause.");
      return metrics.record(input);
    },
    async conversions() {return metrics.report(await rows());},
    async guide() {
      const saved = await store.read("staff/content.json");
      if (!saved) return downloadAsset("sponsor-guide.pdf");
      if (currentGuide?.version === saved.version) return currentGuide.bytes;
      const bytes=await require("./guide").buildGuide(saved.value,await downloadAsset("guide-cover.jpg"),origin);
      currentGuide={version:saved.version,bytes};
      return bytes;
    },
    async saveContent(value) {
      const base = await defaults();
      return edit("staff/content.json",defaults,async current=>{
        const incoming = typeof value === "function" ? await value(structuredClone(current)) : value;
        validateContent(incoming,base);
        Object.keys(current).forEach(k=>delete current[k]);
        Object.assign(current,incoming);
        return current;
      });
    },
    async commit(app, key, visitId) {
      if (!app || typeof app !== "object" || Array.isArray(app)) p.fail(400,"Enter a sponsorship application.");
      if (key && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key)) p.fail(400,"Invalid submission identifier.");
      const requestKey = key ? hash(key) : null;
      // The browser timestamps each retry. The service records its own time.
      const requestDigest = hash(JSON.stringify({...app,agreement:{...app?.agreement,signedAt:undefined}}));
      const result=await edit(ledgerKey,initialRows,async list=>{
        const repeat = requestKey && list.find(s=>s.requestKey === requestKey);
        if (repeat) {
          if (repeat.requestDigest !== requestDigest) p.fail(409,"This submission identifier has already been used.");
          return repeat;
        }
        const c = await content();
        const r = p.makeRecord(app,c);
        r.origin="microsite";
        r.intent=r.invoice.number ? "commitment" : "inquiry";
        r.visitHash=hashVisitId(visitId);
        r.requestKey=requestKey; r.requestDigest=requestDigest;
        if (!demo && r.invoice.number) {
          const offers=p.catalog(c);
          for (const selection of r.selections) {
            const limit=offers.get(selection.id).limit;
            if (limit && list.filter(s=>s.invoice.number && s.programYear===r.programYear && s.status!=="lapsed" && s.selections.some(x=>x.id===selection.id)).length >= limit) p.fail(409,"This sponsorship level has filled. Please choose another level.");
          }
        }
        if (r.recognition.logoDataUrl) {
          r.logoRef="logos/"+hash(r.recognition.logoDataUrl)+".json";
          await store.write(r.logoRef,r.recognition.logoDataUrl,null);
          r.recognition.logoDataUrl=null;
        }
        list.push(r);
        return r;
      });
      return {id:result.id,status:result.status,invoiceNumber:result.invoice.number,invoiceUrl:result.invoice.number ? p.invoiceUrl(result) : ""};
    },
    async list() { return Promise.all((await rows()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(hydrate)); },
    async tasks() { return p.tasksFor(await rows()); },
    async get(id) { return hydrate(find(await rows(),id)); },
    async prospect(body) {
      if (!body || typeof body !== "object") p.fail(400,"Enter a prospect.");
      const c=await content();
      const input={
        ...body,
        company:body.company ?? {name:body.companyName},
        contact:body.contact ?? {name:body.contactName,email:body.contactEmail}
      };
      const s=p.makeRecord(input,c,true);
      if (body.suggested != null) {
        if (!Array.isArray(body.suggested) || body.suggested.length>20) p.fail(400,"Select valid sponsorship suggestions.");
        const offers=p.catalog(c);
        for (const id of new Set(body.suggested)) {
          const offer=offers.get(id);
          if (!offer) continue;
          s.selections.push({id,kind:offer.kind,label:offer.label,amount:offer.amount});
          s.total+=offer.amount;
        }
      }
      await edit(ledgerKey,initialRows,list=>list.push(s));
      return p.visible(s);
    },
    async patch(id, body) {
      if (!body || typeof body!=="object") p.fail(400,"An update is required.");
      const at=p.iso();
      const updated=await edit(ledgerKey,initialRows,list=>{
        const s=find(list,id);
        const log=(type,text)=>s.activity.push({at,type,text});
        if ("notes" in body && body.notes !== s.notes) { s.notes=p.field(body.notes,4000);log("note","Staff notes updated."); }
        let status=body.markPaid ? "paid" : body.markInvoiced ? "invoiced" : body.status;
        if (status==="paid" && s.invoice.paidAt) status=s.status;
        if (status && status !== s.status) {
          if (!p.statuses.includes(status)) p.fail(400,"Unknown sponsorship status.");
          if (!s.invoice.number && !["prospect","lapsed"].includes(status)) p.fail(400,"A signed commitment is required before invoicing or payment.");
          if (s.invoice.paidAt && ["prospect","committed","invoiced"].includes(status)) p.fail(400,"A paid invoice cannot return to an unpaid stage.");
          if (s.invoice.number && status === "prospect") p.fail(400,"A signed commitment cannot return to prospect.");
          if (["active","renewal_due"].includes(status) && !s.invoice.paidAt) p.fail(400,"Record payment before activating a sponsor.");
          if (status==="paid") {
            recordPayment(s,at);
            log("payment","Payment recorded by staff." + (body.paymentReference ? " Reference " + p.field(body.paymentReference,120) : ""));
          }
          s.status=status;log("status","Status changed to "+ status.replaceAll("_"," ")+".");
        }
        if ("renewalDate" in body) {
          const time=typeof body.renewalDate==="string" ? Date.parse(body.renewalDate) : NaN;
          if (!s.renewalDate || !Number.isFinite(time))
            p.fail(400,"Set a valid renewal date for an annual sponsorship.");
          const renewalDate=new Date(time).toISOString();
          if (renewalDate!==s.renewalDate) {
            s.renewalDate=renewalDate;
            log("note","Annual renewal date updated.");
          }
        }
        const benefit=body.benefit;
        if (benefit !== undefined && (!benefit || typeof benefit.id!=="string" || typeof benefit.done!=="boolean"))
          p.fail(400,"Select a recognition task and its completion status.");
        const changes=benefit ? [{id:benefit.id,doneAt:benefit.done ? at : null}]
          : body.benefitId ? [{id:body.benefitId,doneAt:body.done===false ? null : at}] : body.benefits || [];
        if (!Array.isArray(changes)) p.fail(400,"Select a recognition task.");
        for (const change of changes) {
          const b=s.benefits.find(x=>x.id===change?.id);
          if (!b) p.fail(400,"Unknown recognition task.");
          if (Boolean(b.doneAt)!==Boolean(change.doneAt)) {
            if (change.doneAt && !s.invoice.paidAt) p.fail(400,"Record payment before delivering recognition.");
            b.doneAt=change.doneAt ? at : null;log("benefit",(b.doneAt?"Delivered: ":"Reopened: ")+b.label);
          }
        }
        return s;
      });
      return hydrate(updated);
    },
    async draft(id,t,options) {return p.draft(find(await rows(),id),t,origin,{...options,content:await content()});},
    async email(id,t) {
      const c=await content();
      return edit(ledgerKey,initialRows,list=>{
        const s=find(list,id), merged=p.draft(s,t,origin,{content:c});
        s.activity.push({at:p.iso(),type:"email",templateId:t,text:"Prepared "+t+" email. Manual delivery from the organization mailbox."});
        return {mode:"logged",...merged};
      });
    },
    async invoice(id,token,admin) {
      const s=find(await rows(),id);
      if (!s.invoice.number || (!admin && (!token || token!==s.invoiceSecret))) p.fail(404,"Invoice not found.");
      return render(s,await content(),demo);
    },
    async preview(input) {
      const c=await content(),app=sampleApplication(c,input.projectId,input.levelId,input.companyName,input.listPublicly !== false);
      const s=p.makeRecord(app,c);
      s.invoice.number="DEMO-"+s.invoice.number.slice(3);
      const invoiceHtml=render(s,c,true);
      s.status="paid"; recordPayment(s,p.iso());
      const sponsor=p.visible(s); delete sponsor.invoiceUrl;
      return {sponsor,tasks:p.tasksFor([s]),invoiceHtml,welcome:p.draft(s,"welcome",origin)};
    }
  };
  return service;
}
module.exports = {createService};
