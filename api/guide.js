const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = require("pdf-lib");
const { money } = require("./program");

const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 45;
const BODY = WIDTH - 2 * MARGIN;
const BOTTOM = 730;
const color = (r, g, b) => rgb(r / 255, g / 255, b / 255);
const navy = color(19, 43, 72);
const ink = color(32, 51, 75);
const muted = color(70, 89, 112);
const paper = color(251, 247, 238);
const blue = color(231, 239, 247);
const gold = color(241, 203, 120);
const line = color(202, 211, 217);
const white = rgb(1, 1, 1);
const price = item => money(item.amount) + (item.plus ? "+" : "");

// Built-in PDF fonts use WinAnsi. Preserve supported punctuation and accents,
// transliterate unsupported accented letters where possible, and keep edits printable.
function printable(value) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[‐‑–—]/g, "-");
  return text.replace(/[^\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•˜™š›œžŸ]/gu, ch =>
    ch.normalize("NFD").replace(/\p{Mark}/gu, "").match(/^[a-zA-Z]$/)?.[0] || "?");
}

async function buildGuide(content, coverJpeg, origin) {
  const document = await PDFDocument.create();
  const fonts = {
    serif: await document.embedFont(StandardFonts.TimesRoman),
    sans: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold)
  };
  const cover = coverJpeg?.length ? await document.embedJpg(coverJpeg) : null;
  const { org } = content;
  const builder = new URL("/partner", origin).href;
  document.setTitle(`${org.name} | Business Partnership Guide`);
  document.setAuthor(org.name);

  let page, y, section, sectionBackground;
  const dark = new Set();
  function rectangle(x, top, width, height, tint) {
    page.drawRectangle({ x, y: HEIGHT - top - height, width, height, color: tint });
  }
  function rule(top, tint = line, x = MARGIN, width = BODY) {
    page.drawLine({ start:{x,y:HEIGHT-top}, end:{x:x+width,y:HEIGHT-top}, thickness:0.65, color:tint });
  }
  function type(value, {x=MARGIN,top=y,size=11,font="sans",tint=ink}={}) {
    page.drawText(printable(value), {x,y:HEIGHT-top-size,font:fonts[font],size,color:tint});
  }
  function wrap(value, width, size, font) {
    const lines = [];
    let row = "";
    const fits = str => fonts[font].widthOfTextAtSize(str, size) <= width;
    for (let word of printable(value).split(/\s+/).filter(Boolean)) {
      const candidate = row ? row + " " + word : word;
      if (fits(candidate)) {
        row = candidate;
        continue;
      }
      if (row) lines.push(row);
      while (!fits(word)) {
        let last = 1;
        while (last < word.length && fits(word.slice(0, last + 1))) last++;
        lines.push(word.slice(0, last));
        word = word.slice(last);
      }
      row = word;
    }
    if (row) lines.push(row);
    return lines;
  }
  function addPage(kicker, {background=paper,continuation=false}={}) {
    page = document.addPage([WIDTH,HEIGHT]);
    if (!continuation) {
      section = kicker;
      sectionBackground = background;
    }
    background = sectionBackground;
    if (background===navy) dark.add(page);
    rectangle(0,0,WIDTH,HEIGHT,background);
    const label=wrap((section+(continuation ? " / continued" : "")).toUpperCase(),BODY,9,"bold")[0];
    type(label,
      {top:44,font:"bold",size:9,tint:background===navy ? gold : muted});
    y=70;
  }
  function need(height) {
    if (y + height > BOTTOM) addPage(section,{continuation:true});
  }
  function write(value,{x=MARGIN,width=BODY,size=11,font="sans",tint=ink,leading=size*1.28,gap=0}={}) {
    for (const row of wrap(value,width,size,font)) {
      need(leading);
      type(row,{x,size,font,tint});
      y+=leading;
    }
    y+=gap;
  }
  function heading(kicker,title,description) {
    addPage(kicker);
    write(title,{font:"serif",size:39,tint:navy,leading:44,gap:9});
    write(description,{size:12,tint:muted,gap:19});
  }
  function link(url,x,top,width,height) {
    const annotation = document.context.obj({
      Type:PDFName.of("Annot"), Subtype:PDFName.of("Link"),
      Rect:[x,HEIGHT-top-height,x+width,HEIGHT-top], Border:[0,0,0],
      A:{S:PDFName.of("URI"),URI:PDFString.of(url)}
    });
    page.node.addAnnot(document.context.register(annotation));
  }
  function button(label, url, x=MARGIN) {
    need(34);
    const width = fonts.bold.widthOfTextAtSize(label,11)+30;
    rectangle(x,y,width,32,gold);
    type(label,{x:x+15,top:y+9,font:"bold",size:11,tint:navy});
    link(url,x,y,width,32);
    y+=34;
  }
  function row(title, cost, entries, {leftWidth=174,padding=23}={}) {
    const rightX = MARGIN + leftWidth + 18;
    const rightWidth = BODY - leftWidth - 18;
    const left = wrap(title,leftWidth,18,"serif");
    const costs = wrap(cost,leftWidth,10.75,"bold");
    const right = entries.flatMap(({text,bold=false}) => wrap(text,rightWidth,bold ? 10 : 10.8,bold ? "bold" : "sans")
      .map(rowText=>({rowText,bold})));
    const height = Math.max(left.length * 21 + costs.length * 14, right.length * 16)+padding;
    if (height > 320) {
      need(50);
      rule(y);
      y+=8;
      write(title,{font:"serif",size:18,tint:navy,leading:21,gap:5});
      write(cost,{font:"bold",size:10.75,gap:8});
      for (const {text,bold} of entries) write(text,{font:bold ? "bold" : "sans",gap:3});
      y+=10;
      return;
    }
    need(height);
    rule(y);
    y+=9;
    left.forEach((text,index)=>type(text,{top:y+index*21,font:"serif",size:18,tint:navy}));
    costs.forEach((text,index)=>type(text,{top:y+left.length*21+index*14,font:"bold",size:10.75,tint:navy}));
    right.forEach(({rowText,bold},index)=>type(rowText,{
      x:rightX,top:y+index*16,font:bold ? "bold" : "sans",size:bold ? 10 : 10.8,tint:bold ? muted : ink
    }));
    y+=height-9;
  }
  function photo(maxHeight) {
    if (!cover) return;
    const size = cover.scaleToFit(BODY,maxHeight);
    need(size.height+22);
    const x=(WIDTH-size.width)/2;
    page.drawImage(cover,{x,y:HEIGHT-y-size.height,...size});
    y+=size.height+22;
  }

  addPage("Business partnership guide / " + org.programYear,{background:navy});
  write(org.name.toUpperCase(),{font:"bold",size:12,tint:gold,gap:14});
  write(content.hero.headline,{width:BODY-20,font:"serif",size:45,tint:white,leading:47,gap:10});
  write(org.mission,{width:BODY-22,size:13,tint:blue,gap:18});
  photo(244);
  const highlights = content.stats.slice(0,4);
  if (highlights.length) {
    need(95);
    const column = BODY / highlights.length;
    highlights.forEach((stat,index)=>{
      const x=MARGIN+index*column;
      type(Number(stat.value).toLocaleString("en-US")+(stat.suffix || ""),{x,top:y,font:"serif",size:29,tint:gold});
      wrap(stat.label,column-13,9.7,"sans").slice(0,3).forEach((text,i)=>
        type(text,{x,top:y+36+i*12.5,size:9.7,tint:blue}));
    });
    y+=77;
  }
  write(org.serviceArea.join("  /  "),{size:9.3,tint:dark.has(page) ? blue : muted,gap:12});
  button("Explore business partnerships",builder);

  heading("Annual corporate partnerships","Support the whole mission",
    "Choose an annual level. Each tier adds to the benefits from its included tier.");
  const tiers=new Map(content.tiers.map(t=>[t.id,t]));
  for (const tier of content.tiers) {
    const entries=[];
    if (tiers.has(tier.includes)) entries.push({text:`Includes ${tiers.get(tier.includes).name} benefits, plus`,bold:true});
    entries.push(...tier.benefits.map(b=>({text:"• "+b.label})));
    row(tier.name,price(tier)+" / year"+(tier.inquiryOnly ? " · inquiry" : ""),entries);
  }
  write("You can add one or more project sponsorships in the same request.",{size:10.5,tint:muted,gap:10});

  const featured=content.projects.find(project=>project.id==="resource-guide");
  if (featured) {
    heading(featured.kicker || "Sponsorship spotlight",featured.name,featured.description);
    photo(226);
    for (const level of featured.levels) {
      const limit=level.limit ? ` · ${level.limit} placement${level.limit===1 ? "" : "s"}` : "";
      row(level.name,price(level)+limit,level.benefits.map(b=>({text:b.label})));
    }
    button("Explore sponsorship options",builder);
  }

  heading("Projects and events","Choose the work you back",
    "Support one project, combine several, or add a project to your annual partnership.");
  for (const project of content.projects) {
    if (project===featured) continue;
    const entries=project.kind==="namiwalks"
      ? [{text:project.kicker.replace("Next walk:", "Proposed walk date:"),bold:true},
        {text:project.description+" Confirm the date and recognition with the walk organizer."}]
      : [];
    for (const level of project.levels) {
      const limit=level.limit ? ` · ${level.limit} placement${level.limit===1 ? "" : "s"}` : "";
      if (project.kind !== "namiwalks") {
        entries.push({text:`${level.name} · ${price(level)}${limit}`,bold:true});
        entries.push(...level.benefits.map(b=>({text:b.label})));
      }
    }
    row(project.name,project.kind==="namiwalks" ? project.levels.map(price).join(" / ") : project.kicker,
      entries,{leftWidth:184,padding:14});
  }

  heading("From interest to impact","Become a partner",
    "Choose what you want to support and tell us how you would like to be recognized.");
  row("Choose your support","",[
    {text:"Select an annual level, a project, NAMIWalks or a combination. Custom partnerships start with a conversation."}
  ]);
  row("Sign your commitment","",[{text:"Share your business contact, website, logo, short description and recognition preferences for review."}]);
  row("Arrange payment","",[{text:`Your invoice is available after you sign a standard commitment. Terms are ${content.payment.terms.toLowerCase()}. Arrange payment privately with our Regional Director. We’ll confirm your recognition schedule after payment.`}]);
  y+=9;
  write(content.champions.title,{font:"serif",size:23,tint:navy,gap:6});
  write(content.champions.body,{size:10.9,gap:8});
  for (const action of content.champions.actions) write("• "+action,{size:10.5,gap:3});
  write(content.champions.disclaimer,{size:9.25,tint:muted,gap:15});
  button("Open the partnership builder",builder);
  write(builder,{size:9,tint:muted,gap:9});
  if (org.email && !/@example\.(com|net|org|invalid)$/i.test(org.email))
    write("Questions? "+org.email,{size:10,tint:muted});

  const pages=document.getPages();
  for (const [index, item] of pages.entries()) {
    page=item;
    const tint=dark.has(page) ? blue : muted;
    rule(747,tint);
    const year=wrap(org.programYear,155,8,"bold")[0] || "";
    const folio=`${year}  /  ${String(index+1).padStart(2,"0")} of ${String(pages.length).padStart(2,"0")}`;
    const x=WIDTH-MARGIN-fonts.bold.widthOfTextAtSize(folio,8);
    type(wrap(org.name.toUpperCase(),x-MARGIN-18,8,"bold")[0],{top:758,font:"bold",size:8,tint});
    type(folio,{x,top:758,font:"bold",size:8,tint});
  }
  return Buffer.from(await document.save());
}

module.exports = { buildGuide };
