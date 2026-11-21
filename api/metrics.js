const { createHash } = require("node:crypto");
const { setTimeout: pause } = require("node:timers/promises");
const { fail } = require("./program");

const EVENTS = ["visit", "explore", "builder"];
const SOURCES = ["direct", "email", "social", "referral"];
const DAYS = 30;
const DAY_MS = 86_400_000;
const MAX_VISITS_PER_DAY = 10_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAUSE_ID = /^[a-z0-9-]{1,80}$/;
const metricsKey = (day) => `metrics/${day}.json`;
const utcDate = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);
const rate = (count, total) => total === 0 ? 0 : count / total;

function hashVisitId(visitId) {
  if (typeof visitId !== "string" || visitId.length !== 36 || !UUID_V4.test(visitId)) return null;
  return createHash("sha256").update(visitId.toLowerCase()).digest("hex");
}

function createMetrics(store) {
  return {
    async record(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some((key) => !["visitId", "source", "event", "causeId"].includes(key))) {
        fail(400, "Enter one valid site event.");
      }
      const { event, source = "direct", visitId, causeId } = input;
      const visitHash = hashVisitId(visitId);
      if (!visitHash || !EVENTS.includes(event) || !SOURCES.includes(source)) fail(400, "Enter one valid site event.");
      if (causeId !== undefined && (event !== "explore" || typeof causeId !== "string" || !CAUSE_ID.test(causeId))) {
        fail(400, "Choose a site cause for an exploration event.");
      }

      const key = metricsKey(utcDate(Date.now()));
      for (let attempt = 0; attempt < 8; attempt++) {
        const existing = await store.read(key);
        const visits = existing?.value ?? {};
        const previous = visits[visitHash];
        const causes = previous?.causes ?? [];
        const newCause = causeId !== undefined && !causes.includes(causeId);
        if (previous?.[event] && !newCause) return { recorded: false };
        if (!previous && Object.keys(visits).length >= MAX_VISITS_PER_DAY) fail(429, "Site event limit reached for today.");

        const entry = { ...previous, source: previous?.source ?? source, [event]: true };
        if (newCause) entry.causes = [...causes, causeId];
        if (await store.write(key, { ...visits, [visitHash]: entry }, existing?.version)) return { recorded: true };
        await pause(5 * (attempt + 1) + Math.floor(Math.random() * 20));
      }
      fail(409, "Site event could not be recorded. Please retry.");
    },

    async report(records) {
      const now = new Date();
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const start = today - (DAYS - 1) * DAY_MS;
      const end = today + DAY_MS;
      const dates = Array.from({ length: DAYS }, (_, index) => utcDate(start + index * DAY_MS));
      const buckets = await Promise.all(dates.map((day) => store.read(metricsKey(day))));
      const visits = new Map();
      for (const bucket of buckets) {
        for (const [hash, entry] of Object.entries(bucket?.value ?? {})) {
          const previous = visits.get(hash);
          visits.set(hash, {
            source: previous?.source ?? entry.source,
            explore: Boolean(entry.explore || previous?.explore),
            builder: Boolean(entry.builder || previous?.builder),
            causes: new Set([...(previous?.causes ?? []), ...(entry.causes ?? [])]),
          });
        }
      }

      const totals = {
        visits: visits.size, explored: 0, builderStarts: 0,
        inquiries: 0, commitments: 0, convertedVisits: 0, conversionRate: 0,
      };
      const converted = new Set();
      for (const record of records) {
        if (record.origin !== "microsite" || record.fixture === true || record.demo === true) continue;
        const at = Date.parse(record.createdAt);
        if (!(at >= start && at < end)) continue;
        if (record.intent === "inquiry") totals.inquiries++;
        else if (record.intent === "commitment") totals.commitments++;
        else continue;
        if (visits.has(record.visitHash)) converted.add(record.visitHash);
      }

      const channels = new Map(SOURCES.map((source) => [source, { source, visits: 0, convertedVisits: 0, conversionRate: 0 }]));
      const byCause = new Map();
      for (const [hash, visit] of visits) {
        const channel = channels.get(visit.source);
        channel.visits++;
        if (visit.explore) totals.explored++;
        if (visit.builder) totals.builderStarts++;
        if (converted.has(hash)) channel.convertedVisits++;
        for (const cause of visit.causes) byCause.set(cause, (byCause.get(cause) ?? 0) + 1);
      }
      for (const channel of channels.values()) channel.conversionRate = rate(channel.convertedVisits, channel.visits);
      totals.convertedVisits = converted.size;
      totals.conversionRate = rate(totals.convertedVisits, totals.visits);

      return { days: DAYS, from: dates[0], through: dates.at(-1), totals, channels: [...channels.values()], byCause: Object.fromEntries(byCause) };
    },
  };
}

module.exports = { createMetrics, hashVisitId };
