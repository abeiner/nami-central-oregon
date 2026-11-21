const projectId = "resource-guide";
const companies = {
  "juniper-pine": { name: "Juniper & Pine Books", monogram: "JP" },
  "rimrock": { name: "Rimrock Letterpress", monogram: "RL" },
  "north-fork": { name: "North Fork Bicycle Co.", monogram: "NF" },
};
const placement = {
  "guide-cover": { location: "Cover proof", credit: "Presented by", logo: true },
  "guide-logo": { location: "Sponsor page proof", credit: "Supporting sponsor", logo: true },
  "guide-name": { location: "Sponsor page proof", credit: "Friends of the Guide", logo: false },
};
const chapters = [
  ["Sponsor view", "Choose how to show up.", ""],
  ["Sponsor view", "Make it official.", "An accepted commitment becomes an itemized invoice with a due date. The director picks it up from here."],
  ["Director’s desk", "Keep the promise.", "Once payment is recorded, the director can see what’s due, review the welcome draft, and track the promised recognition."],
  ["Recognition preview", "See it in print.", "This is how the recognition choice could appear in the guide. The final artwork would be prepared for print and digital use."],
];
const nextArrow = '<span aria-hidden="true">→</span>';
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const elements = {
  section: document.querySelector("#workbench"),
  role: document.querySelector("#stage-role"),
  title: document.querySelector("#stage-title"),
  description: document.querySelector("#stage-description"),
  body: document.querySelector("#stage-body"),
  steps: [...document.querySelectorAll("[data-step]")],
  partner: document.querySelector("[data-partner]"),
  dialog: document.querySelector("#share-dialog"),
  shareUrl: document.querySelector("#share-url"),
  copyStatus: document.querySelector("#copy-status"),
};
const given = new URLSearchParams(location.search);
const state = {
  step: 0,
  furthest: 0,
  companyKey: Object.hasOwn(companies, given.get("company")) ? given.get("company") : "juniper-pine",
  levelId: "",
  listPublicly: given.get("recognition") !== "private",
  data: null,
  project: null,
  preview: null,
  local: false,
  paid: false,
  welcomeOpen: false,
  completed: new Set(),
  revision: 0,
};

function safe(value) {
  const table = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, match => table[match]);
}

function formattedDate(value) {
  return value ? date.format(new Date(value)) : "—";
}

function after(value, days) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function chosenLevel() {
  return state.project.levels.find(level => level.id === state.levelId);
}

function partnershipUrl() {
  return "/partner?" + new URLSearchParams({ select: projectId + ":" + (state.levelId || "supporting") });
}

async function programContent() {
  for (const url of ["/api/content", "/content.json"]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!response.ok) continue;
      const data = await response.json();
      const project = data.projects?.find(item => item.id === projectId);
      if (project?.levels?.length && Number.isInteger(data.payment?.netDays)) return { data, project };
    } catch {
      // The bundled catalog also supports static hosting.
    }
  }
  throw new Error("The sponsorship catalog is unavailable.");
}

function setStage(step, focus = true) {
  if (step < 0 || step > state.furthest) return;
  state.step = step;
  render();
  if (focus) {
    elements.section.scrollIntoView();
    elements.title.focus({ preventScroll: true });
  }
}

function advance(step) {
  state.furthest = Math.max(state.furthest, step);
  setStage(step);
}

function updateSteps() {
  elements.steps.forEach((button, index) => {
    button.disabled = index > state.furthest;
    button.classList.toggle("is-complete", index < state.furthest);
    if (index === state.step) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function render() {
  const [role, title, description] = chapters[state.step];
  const privateProof = state.step === 3 && !state.listPublicly;
  elements.role.textContent = role;
  elements.title.textContent = privateProof ? "Honor their choice." : title;
  elements.description.textContent = privateProof
    ? "The guide keeps the sponsor’s identity private. The director still has the commitment and payment record on file."
    : description || state.project.description;
  elements.partner.href = partnershipUrl();
  updateSteps();
  [renderSponsor, renderInvoice, renderDesk, renderProof][state.step]();
}

function invalidatePreview() {
  state.revision += 1;
  state.furthest = 0;
  state.preview = null;
  state.paid = false;
  state.welcomeOpen = false;
  state.completed.clear();
  updateSteps();
}

function selectedBenefits() {
  if (!state.listPublicly) return "Private support. The guide omits the business name and logo.";
  return chosenLevel().benefits.map(benefit =>
    benefit.label + (Number.isInteger(benefit.dueInDays) ? " · within " + benefit.dueInDays + " days of commitment" : "")
  ).join(" · ");
}

function renderSponsor() {
  const companyOptions = Object.entries(companies).map(([key, company]) =>
    `<option value="${key}" ${key === state.companyKey ? "selected" : ""}>${safe(company.name)}</option>`
  ).join("");
  const levelOptions = state.project.levels.map(level => `
    <label class="level-card">
      <input type="radio" name="level" value="${safe(level.id)}" ${level.id === state.levelId ? "checked" : ""}>
      <span class="level-info"><span class="level-name">${safe(level.name)}</span><span class="level-price">${money.format(level.amount)}${level.plus ? "+" : ""}</span></span>
    </label>`).join("");
  elements.body.innerHTML = `
    <form class="panel sponsor-form" id="sponsor-form">
      <div class="company-field">
        <label for="company">Fictional business</label>
        <select id="company" name="company">${companyOptions}</select>
      </div>
      <fieldset aria-describedby="level-benefit">
        <legend>Sponsorship level</legend>
        <div class="level-grid">${levelOptions}</div>
        <p id="level-benefit" class="level-benefit" aria-live="polite">${safe(selectedBenefits())}</p>
      </fieldset>
      <label class="recognition-choice">
        <input type="checkbox" name="public" ${state.listPublicly ? "checked" : ""}>
        <span><strong>Recognize the business publicly</strong><small>Uncheck to keep its name and logo out of the guide.</small></span>
      </label>
      <div class="actions">
        <p class="hint" id="sponsor-status" role="status">You’re creating a sample commitment.</p>
        <button class="primary-button" type="submit">Create sample invoice ${nextArrow}</button>
      </div>
    </form>`;

  const form = document.querySelector("#sponsor-form");
  const submit = form.querySelector("button[type='submit']");
  const status = document.querySelector("#sponsor-status");
  form.addEventListener("change", () => {
    const values = new FormData(form);
    state.companyKey = values.get("company");
    state.levelId = values.get("level");
    state.listPublicly = values.has("public");
    elements.partner.href = partnershipUrl();
    invalidatePreview();
    document.querySelector("#level-benefit").textContent = selectedBenefits();
    submit.disabled = false;
    status.textContent = "You’re creating a sample commitment.";
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.preview) {
      advance(1);
      return;
    }
    const revision = ++state.revision;
    const input = {
      projectId,
      levelId: state.levelId,
      companyName: companies[state.companyKey].name,
      listPublicly: state.listPublicly,
    };
    const level = chosenLevel();
    submit.disabled = true;
    status.textContent = "Preparing the sample…";
    let preview;
    let local = false;
    try {
      const response = await fetch("/api/demo/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(5500),
      });
      if (!response.ok) throw new Error("Preview unavailable");
      preview = await response.json();
      if (!preview.sponsor?.invoice || !Array.isArray(preview.tasks) || !preview.welcome || typeof preview.invoiceHtml !== "string") {
        throw new Error("Incomplete preview");
      }
    } catch {
      preview = localPreview(input, level);
      local = true;
    }
    if (revision !== state.revision) return;
    state.preview = preview;
    state.local = local;
    advance(1);
  });
}

function localPreview(input, level) {
  const now = new Date().toISOString();
  const amount = level.amount;
  const dueAt = after(now, state.data.payment.netDays);
  const benefits = input.listPublicly ? level.benefits.map(benefit => ({
    id: benefit.id,
    label: benefit.label,
    staffMinutes: benefit.staffMinutes,
    dueAt: after(now, benefit.dueInDays),
  })) : [];
  const invoice = { number: "DEMO-LOCAL", issuedAt: now, paidAt: now, dueAt };
  const name = input.companyName;
  const sponsor = { company: { name }, invoice, total: amount, benefits, recognition: { listPublicly: input.listPublicly } };
  const tasks = [
    { id: "local-welcome", kind: "send_welcome", title: name + " · Prepare the welcome email", dueAt: now },
    ...benefits.map(benefit => ({
      id: "local-" + benefit.id,
      kind: "fulfil_benefit",
      benefitId: benefit.id,
      title: benefit.label,
      dueAt: benefit.dueAt,
    })),
  ];
  const recognition = input.listPublicly ? "public acknowledgment as " + name : "private support";
  const next = benefits.map(benefit => benefit.label + " · " + formattedDate(benefit.dueAt)).join("\n") || "We will respect your request for private recognition.";
  const subject = "Welcome to the partnership, " + name;
  const body = `Hello,\n\nThank you for supporting the Resource Guide as a ${level.name}. We recorded your sample payment of ${money.format(amount)}. Your recognition preference is ${recognition}.\n\n${next}\n\nNAMI Central Oregon`;
  return { sponsor, tasks, welcome: { subject, body }, invoiceHtml: "" };
}

function renderInvoice() {
  const { sponsor, invoiceHtml } = state.preview;
  const { invoice } = sponsor;
  elements.body.innerHTML = `
    <div class="panel invoice-panel">
      <article class="invoice-paper" aria-labelledby="invoice-heading">
        <header class="invoice-header">
          <div><p class="eyebrow">NAMI Central Oregon</p><h3 id="invoice-heading">Sample invoice</h3></div>
          <span class="invoice-tag">Sample</span>
        </header>
        <dl>
          <div><dt>Invoice</dt><dd>${safe(invoice.number)}</dd></div>
          <div><dt>Billed to</dt><dd>${safe(sponsor.company.name)}</dd></div>
          <div><dt>Issued</dt><dd>${formattedDate(invoice.issuedAt)}</dd></div>
          <div><dt>Due</dt><dd>${formattedDate(invoice.dueAt)}</dd></div>
        </dl>
        <div class="invoice-line"><span>${safe(state.project.name)}<small>${safe(chosenLevel().name)}</small></span><span>${money.format(sponsor.total)}</span></div>
        <p class="invoice-total"><span class="total-label">Sample total</span><strong>${money.format(sponsor.total)}</strong></p>
        <p class="hint">Demo invoice. No funds are due.</p>
      </article>
      ${state.local ? '<p class="hint" role="status">Local preview from the program catalog. The preview service is unavailable.</p>' : ""}
      <div class="actions">
        <button class="subtle-button" type="button" data-back>Back to the sponsor</button>
        <button class="primary-button" type="button" data-advance="2">Take the director’s seat ${nextArrow}</button>
      </div>
      ${invoiceHtml ? '<details class="invoice-details"><summary>Open the generated invoice</summary><iframe title="Full sample invoice" sandbox loading="lazy"></iframe></details>' : ""}
    </div>`;
  if (invoiceHtml) elements.body.querySelector("iframe").srcdoc = invoiceHtml;
}

function renderDesk(focusNext = false) {
  const { sponsor, tasks, welcome } = state.preview;
  const cleanTitle = title => title.startsWith(sponsor.company.name + " · ") ? title.slice(sponsor.company.name.length + 3) : title;
  const payment = { id: "record-payment", title: "Record sample payment", details: money.format(sponsor.total) + " · " + sponsor.invoice.number, label: "Record payment", done: state.paid };
  const items = state.paid ? [payment, ...tasks.map(task => {
    const benefit = sponsor.benefits?.find(item => item.id === task.benefitId);
    const details = "Due " + formattedDate(task.dueAt) +
      (Number.isInteger(benefit?.staffMinutes) ? " · " + benefit.staffMinutes + " min staff time" : "");
    const welcomeTask = task.kind === "send_welcome";
    return { id: task.id, title: cleanTitle(task.title), details, label: welcomeTask ? "Review draft" : "Mark complete", done: state.completed.has(task.id), welcomeTask };
  })] : [payment];
  const complete = state.paid && tasks.every(task => state.completed.has(task.id));
  const draftMarkup = `
    <details class="welcome-preview" ${state.welcomeOpen ? "open" : ""}>
      <summary>Welcome email preview</summary>
      <h4>${safe(welcome.subject)}</h4>
      <p>${safe(welcome.body)}</p>
    </details>`;
  const tasksMarkup = items.map(item => `
    <li class="task ${item.done ? "completed" : ""}">
      <span class="task-mark" aria-hidden="true">${item.done ? "✓" : "·"}</span>
      <div><strong>${safe(item.title)}</strong><p>${safe(item.details)}</p></div>
      ${item.done ? '<span class="hint">Done</span>' : `<button type="button" data-task="${safe(item.id)}">${item.label}</button>`}
      ${item.welcomeTask ? draftMarkup : ""}
    </li>`).join("");
  elements.body.innerHTML = `
    <div class="desk">
      <div class="desk-record">
        <div><p class="eyebrow">Sample sponsor record</p><strong>${safe(sponsor.company.name)}</strong><p>${safe(chosenLevel().name)} · ${money.format(sponsor.total)}</p></div>
        <span class="status-pill ${state.paid ? "" : "waiting"}">${state.paid ? "Paid" : "Invoiced"}</span>
      </div>
      <div class="panel desk-board">
        <h3>What needs doing</h3>
        <p class="eyebrow" aria-live="polite">${items.filter(item => item.done).length} of ${items.length} complete</p>
        <ol class="task-list">${tasksMarkup}</ol>
        ${state.paid && !state.listPublicly ? '<p class="hint">This sponsor chose private support, so no public recognition task was created.</p>' : ""}
        <div class="actions desk-actions">
          <button class="subtle-button" type="button" data-back>Back to the invoice</button>
          <button class="primary-button" type="button" data-advance="3" ${complete ? "" : "disabled"}>See the print proof ${nextArrow}</button>
          ${complete ? "" : '<p class="hint">Complete the sample tasks to open the proof.</p>'}
        </div>
      </div>
    </div>`;
  elements.body.querySelector(".welcome-preview")?.addEventListener("toggle", event => {
    state.welcomeOpen = event.target.open;
  });
  if (focusNext) {
    const next = elements.body.querySelector("[data-task], [data-advance]:not(:disabled)");
    next?.focus({ preventScroll: true });
  }
}

function updateTask(id) {
  if (id === "record-payment") {
    state.paid = true;
    renderDesk(true);
    return;
  }
  const task = state.preview.tasks.find(item => item.id === id);
  if (!task) return;
  state.completed.add(id);
  if (task.kind === "send_welcome") {
    state.welcomeOpen = true;
    renderDesk();
    elements.body.querySelector(".welcome-preview summary")?.focus();
  } else {
    renderDesk(true);
  }
}

function renderProof() {
  const { sponsor } = state.preview;
  const sponsorName = safe(sponsor.company.name);
  const credit = (sponsor.benefits ?? []).map(benefit => placement[benefit.id]).find(Boolean);
  const recognized = state.listPublicly && Boolean(credit);
  const location = recognized ? credit.location : "Cover proof";
  const cover = location === "Cover proof";
  const title = recognized ? "A promise put to work." : "Support carried through.";
  const promise = recognized ? sponsor.benefits.map(benefit => benefit.label).join(" · ")
    : state.listPublicly ? "The director can use the current benefit schedule to prepare the final artwork."
      : "The sponsor record shows paid, and the guide honors the request for private recognition.";
  elements.body.innerHTML = `
    <div class="proof">
      <div class="proof-visual">
        <img alt="" src="/downloads/guide-cover.jpg" width="1672" height="941">
        <article class="proof-paper" aria-label="${location}">
          <p class="paper-kicker">NAMI Central Oregon</p>
          <div><div class="rule"></div>
            <h3>${cover ? "Resource<br>Guide" : "Thank<br>you."}${cover ? "" : "<small>Resource Guide sponsors</small>"}</h3>
            <div class="rule"></div>
          </div>
          ${recognized ? `<div class="brand-proof ${credit.logo ? "logo" : ""}">
            <span>${credit.credit}</span>
            ${credit.logo ? `<span class="proof-monogram" aria-hidden="true">${companies[state.companyKey].monogram}</span>` : ""}
            <strong>${sponsorName}</strong>
          </div>` : ""}
          <p class="paper-kicker">${location} · Sample artwork</p>
        </article>
      </div>
      <div class="panel proof-copy">
        <p class="eyebrow">${recognized ? location : state.listPublicly ? "Resource Guide" : "Private support"}</p>
        <h3>${title}</h3>
        <p>${safe(promise)}</p>
        <div class="actions">
          <a class="primary-button" href="${safe(partnershipUrl())}">Build a partnership ${nextArrow}</a>
          <button class="subtle-button" type="button" data-share>Share your setup</button>
          <button class="subtle-button" type="button" data-print>Print sample proof</button>
        </div>
      </div>
    </div>`;
}

function showShare() {
  const url = new URL("/launch/", location.origin);
  if (state.project) {
    url.search = new URLSearchParams({
      company: state.companyKey,
      level: state.levelId,
      recognition: state.listPublicly ? "public" : "private",
    });
  }
  elements.shareUrl.value = url.href;
  elements.copyStatus.textContent = "";
  elements.dialog.showModal();
  elements.shareUrl.focus();
  elements.shareUrl.select();
}

async function copyShare() {
  elements.shareUrl.select();
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(elements.shareUrl.value);
    else if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
    elements.copyStatus.textContent = "Link copied.";
  } catch {
    elements.shareUrl.focus();
    elements.shareUrl.select();
    elements.copyStatus.textContent = "The link is selected. Use your device’s copy command.";
  }
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-begin], [data-share], [data-print], [data-step], [data-advance], [data-back], [data-task], #copy-button");
  if (!target) return;
  if (target.hasAttribute("data-begin")) {
    event.preventDefault();
    elements.section.scrollIntoView();
    elements.title.focus({ preventScroll: true });
  } else if (target.hasAttribute("data-share")) showShare();
  else if (target.hasAttribute("data-print")) window.print();
  else if (target.id === "copy-button") copyShare();
  else if (target.hasAttribute("data-step") && state.project && Number(target.dataset.step) !== state.step) setStage(Number(target.dataset.step));
  else if (target.hasAttribute("data-advance")) advance(Number(target.dataset.advance));
  else if (target.hasAttribute("data-back")) setStage(state.step - 1);
  else if (target.hasAttribute("data-task")) updateTask(target.dataset.task);
});

try {
  const { data, project } = await programContent();
  state.data = data;
  state.project = project;
  state.levelId = project.levels.find(level => level.id === given.get("level"))?.id
    ?? project.levels.find(level => level.id === "supporting")?.id
    ?? project.levels[0].id;
  render();
} catch {
  elements.body.innerHTML = `<div class="panel"><p>The demo couldn’t load its sponsorship catalog.</p><a href="${safe(partnershipUrl())}">Explore Resource Guide sponsorship ${nextArrow}</a></div>`;
} finally {
  elements.body.removeAttribute("aria-busy");
}
