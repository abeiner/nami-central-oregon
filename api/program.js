const { randomBytes, randomUUID } = require("node:crypto");
const statuses = ["prospect", "committed", "invoiced", "paid", "active", "renewal_due", "lapsed"];
const day = 86400000;
const iso = () => new Date().toISOString();
const after = (at, days) => new Date(Date.parse(at) + days * day).toISOString();
const money = n => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }).format(n);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function field(value, max = 250, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(400, "A required field is missing or too long.");
  return value.trim();
}
function website(value) {
  const raw = field(value, 600);
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error();
    return url.href;
  } catch { fail(400, "Enter a valid business website."); }
}
function logo(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 2800000) fail(400, "Choose a PNG, JPEG or WebP logo under 2 MB.");
  const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, "Choose a PNG, JPEG or WebP logo.");
  const header = Buffer.from(match[2].slice(0, 24), "base64");
  const actual = header.subarray(0,8).toString("hex") === "89504e470d0a1a0a" ? "png"
    : header.subarray(0,3).toString("hex") === "ffd8ff" ? "jpeg"
    : header.toString("ascii",0,4) === "RIFF" && header.toString("ascii",8,12) === "WEBP" ? "webp" : "";
  if (actual !== match[1]) fail(400, "The logo format could not be recognized.");
  return value;
}
function catalog(content) {
  const entries = new Map();
  const tiers = new Map(content.tiers.map(t => [t.id, t]));
  function benefitsFor(tier, path = []) {
    if (path.includes(tier.id)) fail(400, "Annual benefit inheritance contains a cycle.");
    if (tier.includes && !tiers.has(tier.includes)) fail(400, "An included annual tier is missing.");
    return [...(tier.includes ? benefitsFor(tiers.get(tier.includes), [...path, tier.id]) : []), ...tier.benefits];
  }
  for (const t of content.tiers) entries.set(t.id, {...t, group:"annual", kind:"annual", label:t.name, benefits:benefitsFor(t)});
  for (const p of content.projects) for (const l of p.levels) {
    const id = p.id + ":" + l.id;
    entries.set(id, {...l, id, group:p.id, kind:p.kind, label:p.name + " — " + l.name});
  }
  return entries;
}
function makeRecord(app, content, prospect = false) {
  if (!app || typeof app !== "object") fail(400, "Enter a sponsorship application.");
  const c = app.company || {}, u = app.contact || {}, r = app.recognition || {};
  const company = {name:field(c.name,160,true), website:website(c.website), address:field(c.address,500), description:field(c.description,1600)};
  const contact = {name:field(u.name,160,!prospect), title:field(u.title,160), email:field(u.email,254,!prospect), phone:field(u.phone,60)};
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) fail(400, "Enter a valid contact email.");
  const at = iso(), id = randomUUID();
  const recognition = {displayName:field(r.displayName,160) || company.name, listPublicly:r.listPublicly === true,
    logoDataUrl:logo(r.logoDataUrl), socialHandle:field(r.socialHandle,160), notes:field(r.notes,1600), championsInterest:r.championsInterest === true};
  const record = {id, createdAt:at, programYear:content.org.programYear, company,contact,recognition, selections:[],total:0,
    agreement:{accepted:false, signerName:"", signedAt:""}, payment:{method:"invoice"}, status:"prospect",
    invoice:{number:"",issuedAt:null,dueAt:null,paidAt:null}, renewalDate:null, benefits:[],
    activity:[{at,type:"created",text:prospect ? "Prospect added." : "Commitment received and invoice issued."}], notes:prospect ? field(app.notes,4000) : ""};
  if (prospect) return record;
  if (app.intent != null && !["commit","inquiry"].includes(app.intent)) fail(400,"Choose an inquiry or a commitment.");
  if (!Array.isArray(app.selections) || app.selections.length > 20 || (!app.selections.length && !recognition.championsInterest && app.intent!=="inquiry")) fail(400, "Select at least one sponsorship or request more information.");
  const choices = catalog(content), groups = new Set(), benefits = new Map();
  const custom=app.selections.some(s=>choices.get(s?.id)?.inquiryOnly);
  const inquiry = app.intent==="inquiry" || !app.selections.length || custom;
  if (!inquiry && (app.agreement?.accepted !== true || typeof r.listPublicly !== "boolean")) fail(400, "Confirm the agreement and select a recognition preference.");
  if (!inquiry && !["card","invoice","check"].includes(app.payment?.method)) fail(400, "Choose a payment method.");
  for (const selection of app.selections) {
    const item = choices.get(selection?.id);
    if (!item || item.kind !== selection.kind || groups.has(item.group)) fail(400, "Select one available level per program.");
    const amount = selection.amount;
    if (!Number.isSafeInteger(amount) || amount < item.amount || (!item.plus && amount !== item.amount) || amount > 1000000) fail(409,"Package pricing changed. Review the current offer before confirming.");
    groups.add(item.group);
    record.selections.push({id:item.id,kind:item.kind,label:item.label,amount});
    record.total += amount;
    for (const b of item.benefits) {
      if (recognition.listPublicly || ["partner-kit","presentation","planning-call"].includes(b.id)) {
        benefits.set(b.id,{id:b.id,label:b.label,dueAt:after(at,b.dueInDays),staffMinutes:b.staffMinutes,doneAt:null});
      }
    }
  }
  if (record.total !== app.total) fail(409, "The total changed. Review the current offer before confirming.");
  if (inquiry) {
    record.activity[0].text = custom ? "Requested a custom partnership conversation. Amount and agreement pending."
      : recognition.championsInterest && !app.selections.length ? "Requested information about Mental Health Champions." : "Asked about a partnership. No payment or agreement is due.";
    record.notes = record.activity[0].text;
    return record;
  }
  record.agreement = {accepted:true, signerName:field(app.agreement.signerName,160,true), signedAt:at, terms:[...content.agreement]};
  record.payment = {method:app.payment.method};
  record.benefits = [...benefits.values()];
  record.status = "invoiced";
  const number = "CO-" + at.slice(0,4) + "-" + randomBytes(5).toString("hex").toUpperCase();
  record.invoice = {number, issuedAt:at, dueAt:after(at,content.payment.netDays), paidAt:null};
  record.invoiceSecret = randomBytes(28).toString("base64url");
  if (groups.has("annual")) {
    const next = new Date(at);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    record.renewalDate = next.toISOString();
  }
  return record;
}
function invoiceUrl(s) {
  return "/api/sponsorships/" + s.id + "/invoice?access=" + s.invoiceSecret;
}
function visible(s) {
  const { invoiceSecret,requestKey,requestDigest,logoRef,visitHash,...rest } = s;
  return {...rest, ...(s.invoice.number ? {invoiceUrl:invoiceUrl(s)} : {})};
}
function tasksFor(sponsors, now = new Date()) {
  const tasks = [];
  for (const s of sponsors) {
    const add = (kind,title,dueAt,extra = {}) => tasks.push({id:s.id + "/" + kind + "/" + (extra.benefitId || ""), sponsorId:s.id, kind,title:s.company.name + " · " + title,dueAt,...extra});
    if (s.status === "lapsed") continue;
    if (s.status === "prospect") {
      const last = s.activity.filter(a => a.type === "email").at(-1)?.at || s.createdAt;
      add("follow_up","Follow up on sponsorship",after(last,7),{templateId:"follow_up"});
      continue;
    }
    if (!s.invoice.paidAt) {
      if (s.invoice.dueAt && new Date(s.invoice.dueAt) < now) add("payment_overdue","Check overdue invoice",s.invoice.dueAt,{templateId:"payment_reminder"});
      else if (!s.activity.some(a=>a.templateId === "invoice")) add("send_invoice","Share the invoice",s.invoice.issuedAt || s.createdAt,{templateId:"invoice"});
      continue;
    }
    if (!s.activity.some(a=>a.templateId === "welcome")) add("send_welcome","Prepare the welcome email",s.invoice.paidAt,{templateId:"welcome"});
    for (const b of s.benefits) if (!b.doneAt) add("fulfil_benefit",b.label,b.dueAt,{benefitId:b.id});
    if (s.renewalDate && new Date(after(s.renewalDate,-45)) <= now && !s.activity.some(a=>a.templateId === "renewal" && a.at >= after(s.renewalDate,-45))) add("renewal","Review annual renewal",after(s.renewalDate,-30),{templateId:"renewal"});
  }
  return tasks.sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
}
const templates = [
  ["prospect_intro","Project invitation","When inviting a business to the guide pilot","Help a Central Oregon family find local support","Hello {{contactName}},\n\nWe are preparing a Resource Guide for Central Oregon families looking for mental health support. Would {{companyName}} like to help make it available? The partnership site lists the guide options and the acknowledgment attached to each.\n\n{{siteUrl}}\n\nNAMI Central Oregon"],
  ["invoice","Invoice","After a signed commitment","Sponsorship invoice {{invoiceNumber}}","Hello {{contactName}},\n\nThank you for choosing {{selection}}. Your invoice for {{total}} is due {{dueDate}}.\n\n{{invoiceUrl}}\n\nPlease reply if your accounts payable team needs a different billing contact.\n\nNAMI Central Oregon"],
  ["payment_reminder","Payment follow-up","After the invoice due date","Checking on invoice {{invoiceNumber}}","Hello {{contactName}},\n\nOur records show {{invoiceNumber}} for {{total}} is still open. Could you confirm whether payment is on its way? If it has cleared, please share its date and reference so we can match it.\n\nNAMI Central Oregon"],
  ["welcome","Sponsor welcome","After staff verify payment","Welcome to the partnership, {{companyName}}","Hello {{contactName}},\n\nThank you for supporting {{selection}}. We recorded your payment of {{total}}. Your recognition preference is {{recognition}}.\n\n{{nextBenefit}}\n\nPlease reply with corrections before we prepare your acknowledgment.\n\nNAMI Central Oregon"],
  ["follow_up","Prospect follow-up","One week after an invitation","A follow-up for {{companyName}}","Hello {{contactName}},\n\nHave you had a chance to look at the local sponsorship options? You can review the package here: {{siteUrl}}. Please let us know if a different project would fit your team.\n\nNAMI Central Oregon"],
  ["benefit_delivered","Recognition update","After publishing a promised credit","An update on your partnership","Hello {{contactName}},\n\nThank you again for supporting {{selection}}. Here is the completed recognition we have recorded for your team.\n\n{{delivered}}\n\nPlease reply if any detail needs a correction.\n\nNAMI Central Oregon"],
  ["impact_update","Quarterly partner update","After the quarterly review","Your Central Oregon partnership update","Hello {{contactName}},\n\nThank you for supporting {{selection}}. Here is what we recorded for your partnership in the last 90 days.\n\n{{quarterRecognition}}\n\nAcross all NAMI Central Oregon programs, our published reach figures are:\n{{programReach}}\n\nIf you would like to change how we acknowledge your business, please reply.\n\nNAMI Central Oregon"],
  ["renewal","Annual renewal","In the month before the annual renewal date","Continue your Central Oregon partnership","Hello {{contactName}},\n\nThank you for supporting {{selection}}. Your annual partnership comes up for renewal on {{renewalDate}}. Would {{companyName}} like to continue at the same level? Reply with any changes to your contact or recognition details so we can prepare the next agreement.\n\nNAMI Central Oregon"]
].map(([id,name,when,subject,body])=>({id,name,when,subject,body}));
function draft(s,id,origin,{redacted=false,content}={}) {
  const t = templates.find(t=>t.id === ({outreach:"prospect_intro",overdue:"payment_reminder"}[id] || id));
  if (!t) fail(400,"Choose a valid email template.");
  const date = x=>x ? x.slice(0,10) : "to be agreed";
  const values = {companyName:s.company.name,contactName:s.contact.name || "there",total:money(s.total),selection:s.selections.map(x=>x.label).join(", ") || "our local programs",
    invoiceNumber:s.invoice.number,dueDate:date(s.invoice.dueAt),renewalDate:date(s.renewalDate),recognition:s.recognition.listPublicly ? "public acknowledgment as " + s.recognition.displayName : "private support",
    delivered:s.benefits.filter(b=>b.doneAt).map(b=>b.label+" • "+date(b.doneAt)).join("\n") || "No completed benefit has been recorded yet.",siteUrl:origin + "/partner?" + new URLSearchParams({utm_medium:"email",for:s.company.name,select:s.selections.map(x=>x.id).join(",")}),invoiceUrl:s.invoice.number ? origin + invoiceUrl(s) : "",nextBenefit:s.benefits.map(b=>b.label + " • " + date(b.dueAt)).join("\n") || "We will respect your request for private recognition."};
  const recent=s.benefits.filter(b=>b.doneAt && Date.parse(b.doneAt)>=Date.now()-90*day);
  values.quarterRecognition=recent.length ? recent.map(b=>b.label+" • "+date(b.doneAt)).join("\n") : "No new recognition item was recorded for your partnership in the last 90 days.";
  values.programReach=(content?.stats || []).map(stat=>stat.value.toLocaleString("en-US")+(stat.suffix || "")+" "+stat.label).join("\n");
  if (redacted) Object.assign(values,{contactName:"[contact]",invoiceNumber:"[invoice]",invoiceUrl:"[private invoice link]",recognition:s.recognition.listPublicly ? "public acknowledgment" : "private support"});
  const merge = text=>text.replace(/\{\{(\w+)\}\}/g,(_,k)=>values[k] ?? "");
  return {subject:merge(t.subject),body:merge(t.body)};
}
module.exports = {fail,field,iso,after,money,statuses,catalog,makeRecord,visible,invoiceUrl,tasksFor,templates,draft};
