const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const pct = (value) => `${number.format((value || 0) * 100)} %`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[char]);
const table = (headers, rows) => `<table><thead><tr>${headers.map((item) => `<th>${esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const get = async (url, init) => {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || response.statusText);
  return result;
};

const sections = ["overview","funnels","diagnosis","marketing","experiments","revenue","reliability","quality","users"];
$("#nav").innerHTML = sections.map((id) => `<a href="#${id}">${esc($("#"+id+" h2").textContent)}</a>`).join("");

const funnel = (name, values) => {
  const entries = Object.entries(values);
  const start = entries[0]?.[1] || 1;
  return `<div class="panel"><strong>${esc(name)}</strong>${entries.map(([key,value]) =>
    `<p><span class="muted">${esc(key)}</span> · ${number.format(value)}</p><div class="bar"><i style="width:${Math.min(100,value/start*100)}%"></i></div>`).join("")}</div>`;
};

const render = (data) => {
  const executive = data.executive;
  const cards = [
    ["Weekly Engaged Cooks", executive.weeklyEngagedCooks, number],
    ["Nutzer gesamt", executive.totalUsers, number],
    ["Neue Nutzer (7 Tage)", executive.newUsers, number],
    ["Aktivierung", executive.activationRate, { format:pct }],
    ["D7-Retention", executive.d7Retention, { format:pct }],
    ["D30-Retention", executive.d30Retention, { format:pct }],
    ["Pro-Nutzer", executive.proUsers, number],
    ["MRR", executive.mrr, euro],
    ["ARR", executive.arr, euro],
    ["Churn", executive.churn, { format:pct }],
    ["Netto-Umsatz (30 Tage)", executive.netRevenue30d, euro],
    ["Deckungsbeitrag (30 Tage)", executive.contributionMargin30d, euro],
    ["Fehlgeschlagene Jobs", executive.failedIntegrationJobs, number],
  ];
  $("#cards").innerHTML = cards.map(([label,value,formatter]) => `<article class="card"><span>${label}</span><strong>${formatter.format(value)}</strong></article>`).join("");
  $("#funnel-grid").innerHTML = Object.entries(data.funnels).map(([name,values]) => funnel(name,values)).join("");

  const importFunnel = data.funnels.import;
  const starts = importFunnel.import_started || 0;
  const failures = importFunnel.import_failed || 0;
  $("#diagnosis-table").innerHTML = table(
    ["Prozess","Abbruch/Fehler","p95-Ladezeit","Plattform","Version","Sentry","Hinweis"],
    [["Import", starts ? pct(failures / starts) : "–", `${number.format(data.reliability.p95ScreenLoadMs)} ms`, esc(data.reliability.mostAffectedPlatform), esc(data.reliability.mostAffectedVersion), number.format(data.connectors.sentryIssues.length), failures ? "Fehler und Replays prüfen" : "Kein Signal"]],
  ) + (data.connectors.posthogProjectUrl ? `<p><a href="${esc(data.connectors.posthogProjectUrl)}/replay" target="_blank">Session Replays öffnen</a> · <a href="${esc(data.connectors.posthogProjectUrl)}/surveys" target="_blank">${number.format(data.connectors.surveys.length)} Surveys verwalten</a></p>` : "");

  $("#marketing-content").innerHTML = `<div class="cards">
    <article class="card"><span>Ausgaben (30 Tage)</span><strong>${euro.format(data.marketing.spend30d)}</strong></article>
    <article class="card"><span>CAC</span><strong>${euro.format(data.marketing.cac)}</strong></article>
    <article class="card"><span>ROAS</span><strong>${number.format(data.marketing.roas)}</strong></article>
    <article class="card"><span>LTV:CAC</span><strong>${number.format(data.marketing.ltvToCac)}</strong></article>
    <article class="card"><span>Payback</span><strong>${number.format(data.marketing.paybackMonths)} Monate</strong></article>
  </div>${table(["Kampagne","Kanal","Status","Placement","Aktion"], data.marketing.campaigns.map((item) => [esc(item.name),esc(item.channel),esc(item.status),esc(item.placement),`<button class="campaign-status" data-id="${esc(item.id)}" data-status="${item.status === "active" ? "paused" : "active"}">${item.status === "active" ? "Pausieren" : "Aktivieren"}</button>`]))}
  <form id="campaign-form" class="panel"><input name="name" placeholder="Kampagnenname" required><select name="channel"><option value="in_app">In-App</option><option value="push">Push</option><option value="email">E-Mail</option></select><input name="title" placeholder="Titel" required><input name="body" placeholder="Text" required><input name="ctaLabel" placeholder="CTA"><input name="ctaDeepLink" placeholder="/tabs/subscribe"><select name="placement"><option>categories_top</option><option>recipe_detail</option><option>weekly_planner</option><option>shopping_list</option><option>profile</option></select><button>Entwurf erstellen</button></form>
  <form id="spend-form" class="panel"><input name="day" type="date" required><input name="source" placeholder="Quelle" required><input name="campaign" placeholder="Kampagne" required><input name="amount" type="number" step="0.01" placeholder="Ausgaben EUR" required><button>Ausgabe speichern</button><input id="spend-csv" type="file" accept=".csv"></form>`;

  $("#flags").innerHTML = `${table(["Experiment","Hypothese","Primärmetrik","Status","Aktion"], data.experiments.map((item) => [esc(item.name),esc(item.hypothesis),esc(item.primaryMetric),esc(item.status),`<button class="experiment-status" data-id="${esc(item._id)}" data-flag="${esc(item.posthogFlagId)}" data-status="${item.status === "running" ? "paused" : "running"}">${item.status === "running" ? "Pausieren" : "Starten"}</button>`]))}
  <form id="experiment-form" class="panel"><input name="key" placeholder="flag_key" required><input name="name" placeholder="Experimentname" required><input name="hypothesis" placeholder="Hypothese" required><input name="primaryMetric" placeholder="Primärmetrik" required><input name="variants" value="control,test" required><input name="guardrails" placeholder="Fehlerrate,Ladezeit"><input name="rollout" type="number" min="1" max="100" value="100"><button>Experiment anlegen</button></form>
  <h3>PostHog Feature Flags</h3>${table(["Flag","Aktiv","Rollout","Aktion"], data.connectors.featureFlags.map((flag) => [esc(flag.key), flag.active ? '<span class="ok">Ja</span>' : '<span class="muted">Nein</span>', esc(flag.filters?.groups?.[0]?.rollout_percentage ?? "–"),`<button class="flag-toggle" data-id="${esc(flag.id)}" data-active="${flag.active}">${flag.active ? "Pausieren" : "Starten"}</button>`]))}`;
  const transactions = data.connectors.stripeTransactions;
  const stripeNet = transactions.reduce((sum,item) => sum + (item.net || 0), 0) / 100;
  $("#revenue-content").innerHTML = `<div class="cards"><article class="card"><span>Stripe Netto (letzte 100)</span><strong>${euro.format(stripeNet)}</strong></article><article class="card"><span>RevenueCat</span><strong>${data.connectors.revenueCat ? "Verbunden" : "Nicht konfiguriert"}</strong></article><article class="card"><span>ARPU</span><strong>${euro.format(executive.arpu)}</strong></article><article class="card"><span>ARPPU</span><strong>${euro.format(executive.arppu)}</strong></article><article class="card"><span>LTV</span><strong>${euro.format(executive.ltv)}</strong></article><article class="card"><span>Kosten je Import</span><strong>${euro.format(executive.costPerSuccessfulImport)}</strong></article></div>${table(["Revenue-Stream","Netto"], data.economics.revenueByType.map((item) => [esc(item.type),euro.format(item.amount)]))}${table(["Provider","Netto"], data.economics.revenueByProvider.map((item) => [esc(item.provider),euro.format(item.amount)]))}<form id="cost-form" class="panel"><input name="provider" placeholder="Anbieter, z. B. Gemini" required><input name="category" placeholder="Kategorie" required><input name="amount" type="number" step="0.01" placeholder="Kosten EUR" required><button>Kosten speichern</button></form>`;
  $("#issues").innerHTML = table(["Issue","Nutzer","Ereignisse","Zuletzt"], data.connectors.sentryIssues.slice(0,25).map((item) => [`<a href="${esc(item.permalink)}">${esc(item.title)}</a>`,number.format(item.userCount || 0),number.format(item.count || 0),esc(item.lastSeen)]));
  const quality = data.dataQuality;
  $("#quality-content").innerHTML = `<div class="cards"><article class="card"><span>Events (30 Tage)</span><strong>${number.format(quality.events30d)}</strong></article><article class="card"><span>Fehlender Kontext</span><strong class="${quality.missingContext?'bad':'ok'}">${number.format(quality.missingContext)}</strong></article><article class="card"><span>Unbekannte Properties</span><strong class="${quality.unknownProperties?'bad':'ok'}">${number.format(quality.unknownProperties)}</strong></article><article class="card"><span>Unbekannte Events</span><strong class="${quality.unknownEvents?'bad':'ok'}">${number.format(quality.unknownEvents)}</strong></article><article class="card"><span>Verzögert</span><strong>${number.format(quality.delayed)}</strong></article><article class="card"><span>Connector-Fehler</span><strong class="${data.connectors.errors.length?'bad':'ok'}">${number.format(data.connectors.errors.length)}</strong></article></div>`;
};

const load = async () => {
  $("#refresh").disabled = true;
  try { render(await get("/api/snapshot")); }
  catch (error) { $("main").prepend(Object.assign(document.createElement("p"), { className:"error", textContent:error.message })); }
  finally { $("#refresh").disabled = false; }
};

$("#refresh").addEventListener("click", load);
document.addEventListener("click", async (event) => {
  const campaign = event.target.closest(".campaign-status");
  if (campaign) {
    await get("/api/campaigns/status", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ campaignId:campaign.dataset.id, status:campaign.dataset.status }) });
    return load();
  }
  const flag = event.target.closest(".flag-toggle");
  if (flag) {
    await get(`/api/feature-flags/${flag.dataset.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ active:flag.dataset.active !== "true" }) });
    return load();
  }
  const experiment = event.target.closest(".experiment-status");
  if (experiment) {
    await get("/api/experiments/status", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ id:experiment.dataset.id, posthogFlagId:Number(experiment.dataset.flag), status:experiment.dataset.status }) });
    return load();
  }
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "campaign-form") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  await get("/api/campaigns", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({
    ...data, format:"banner", status:"draft", priority:0, frequencyCap:3,
    imageUrl:undefined, audience:{}, startAt:undefined, endAt:undefined, experimentKey:undefined,
  }) });
  await load();
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "experiment-form") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  await get("/api/experiments", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({
    ...data,
    variants:data.variants.split(",").map((item) => item.trim()).filter(Boolean),
    guardrails:data.guardrails.split(",").map((item) => item.trim()).filter(Boolean),
    rollout:Number(data.rollout),
    audience:{},
  }) });
  await load();
});
document.addEventListener("submit", async (event) => {
  if (event.target.id === "spend-form") {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await get("/api/marketing-spend", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ ...data, channel:"paid", currency:"EUR", amount:Number(data.amount) }) });
    return load();
  }
  if (event.target.id === "cost-form") {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await get("/api/costs", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ ...data, externalId:crypto.randomUUID(), currency:"EUR", amount:Number(data.amount), occurredAt:Date.now() }) });
    return load();
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.id !== "spend-csv" || !event.target.files[0]) return;
  const [header, ...lines] = (await event.target.files[0].text()).trim().split(/\r?\n/);
  const keys = header.split(",").map((key) => key.trim());
  for (const line of lines) {
    const row = Object.fromEntries(line.split(",").map((value,index) => [keys[index],value.trim()]));
    await get("/api/marketing-spend", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ ...row, currency:row.currency || "EUR", amount:Number(row.amount), impressions:row.impressions ? Number(row.impressions) : undefined, clicks:row.clicks ? Number(row.clicks) : undefined, installs:row.installs ? Number(row.installs) : undefined }) });
  }
  await load();
});
$("#user-search").addEventListener("submit", async (event) => {
  event.preventDefault();
  const search = new FormData(event.currentTarget).get("search");
  const users = await get(`/api/users?search=${encodeURIComponent(search)}`);
  $("#user-results").innerHTML = table(["Nutzer","E-Mail","Plan","Lifecycle","Quelle","Letzte Aktivität","Details"], users.map((user) => [esc(user.name),esc(user.email),esc(user.plan),esc(user.lifecycleStage),esc(user.acquisitionSource),user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString("de-DE") : "–",`<button class="user-detail" data-id="${esc(user.billingUserId)}">Öffnen</button>`]));
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest(".user-detail");
  if (!button) return;
  const detail = await get(`/api/user?billingUserId=${encodeURIComponent(button.dataset.id)}`);
  $("#user-results").insertAdjacentHTML("beforeend", `<div class="panel"><h3>${esc(detail.user.name)}</h3><p>${esc(detail.recipes.length)} Rezepte · ${esc(detail.imports.length)} Importe · ${esc(detail.events.length)} Ereignisse · ${esc(detail.revenue.length)} Umsatzereignisse</p>${table(["Zeit","Event","Screen"], detail.events.slice(0,50).map((item) => [new Date(item.occurredAt).toLocaleString("de-DE"),esc(item.name),esc(item.screen)]))}</div>`);
});
load();
