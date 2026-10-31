import { CasePackSchema, type CasePack, type Condition } from "./index";

export type ValidationResult = { ok: true; pack: CasePack } | { ok: false; errors: string[] };

// Schema shape plus referential integrity: every id a pack mentions must exist,
// and every flag a condition waits for must be set somewhere. Catches the typos
// that would otherwise surface as a witness who can never confess.
export function validateCasePack(input: unknown): ValidationResult {
  const parsed = CasePackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const pack = parsed.data;
  const errors: string[] = [];

  const ids = (list: { id: string }[], what: string) => {
    const set = new Set<string>();
    for (const { id } of list) {
      if (set.has(id)) errors.push(`duplicate ${what} id "${id}"`);
      set.add(id);
    }
    return set;
  };

  const facts = ids(pack.facts, "fact");
  const acts = ids(pack.acts, "act");
  const containers = ids(pack.containers, "container");
  const items = ids(pack.items, "item");
  const characters = ids(pack.characters, "character");
  const slots = ids(pack.slots, "slot");
  const claims = ids(pack.claims, "claim");
  ids(pack.events, "event");
  ids(pack.irreversible, "irreversible action");

  const topics = new Set(pack.characters.flatMap((c) => c.topics.map((t) => t.id)));
  const knowledge = new Set<string>();
  for (const c of pack.characters) {
    for (const k of c.knowledge) {
      if (knowledge.has(k.id)) errors.push(`duplicate knowledge id "${k.id}"`);
      knowledge.add(k.id);
    }
  }

  const flagsSet = new Set<string>([
    ...pack.characters.flatMap((c) => c.knowledge.flatMap((k) => k.setsFlags)),
    ...pack.items.flatMap((i) => (i.kind === "photo" ? i.hotspots.flatMap((h) => (h.setsFlag ? [h.setsFlag] : [])) : [])),
    ...pack.events.flatMap((e) => e.actions.flatMap((a) => (a.type === "setFlag" ? [a.flag] : []))),
  ]);

  const need = (set: Set<string>, id: string, what: string, where: string) => {
    if (!set.has(id)) errors.push(`${where}: unknown ${what} "${id}"`);
  };

  const checkCondition = (c: Condition, where: string): void => {
    if ("all" in c) return c.all.forEach((x) => checkCondition(x, where));
    if ("any" in c) return c.any.forEach((x) => checkCondition(x, where));
    if ("not" in c) return checkCondition(c.not, where);
    if ("presented" in c) return need(items, c.presented, "item", where);
    if ("onBoard" in c) return need(items, c.onBoard, "item", where);
    if ("askedAbout" in c) return need(topics, c.askedAbout, "topic", where);
    if ("askedBy" in c) return need(slots, c.askedBy, "slot", where);
    if ("admitted" in c) return need(knowledge, c.admitted, "knowledge", where);
    if ("flag" in c) {
      if (!flagsSet.has(c.flag)) errors.push(`${where}: flag "${c.flag}" is never set`);
    }
  };

  for (const c of pack.containers) {
    if (c.parent) need(containers, c.parent, "container", `container ${c.id}`);
    if (c.access !== "all") c.access.forEach((s) => need(slots, s, "slot", `container ${c.id}`));
    if (c.unlockedBy) checkCondition(c.unlockedBy, `container ${c.id}`);
  }

  for (const i of pack.items) {
    need(containers, i.container, "container", `item ${i.id}`);
    i.evidences.forEach((f) => need(facts, f, "fact", `item ${i.id}`));
  }

  for (const ch of pack.characters) {
    if (ch.talksTo !== "all") ch.talksTo.forEach((s) => need(slots, s, "slot", `character ${ch.id}`));
    for (const k of ch.knowledge) checkCondition(k.unlock, `knowledge ${k.id}`);
  }

  for (const s of pack.slots) {
    s.items.forEach((i) => need(items, i, "item", `slot ${s.id}`));
    s.contacts.forEach((c) => need(characters, c, "character", `slot ${s.id}`));
  }
  for (const m of pack.slotMerges) {
    need(slots, m.from, "slot", "slotMerges");
    need(slots, m.into, "slot", "slotMerges");
  }

  for (const e of pack.events) {
    checkCondition(e.when, `event ${e.id}`);
    for (const a of e.actions) {
      const where = `event ${e.id}`;
      if (a.type === "message" && a.to !== "all") need(slots, a.to, "slot", where);
      if (a.type === "trashItem") {
        need(items, a.item, "item", where);
        need(items, a.trashRecord, "item", where);
      }
      if (a.type === "revealItem") need(items, a.item, "item", where);
      if (a.type === "actTransition") need(acts, a.toAct, "act", where);
    }
  }

  for (const r of pack.irreversible) {
    if (r.action.kind === "present") need(characters, r.action.character, "character", `irreversible ${r.id}`);
    else need(containers, r.action.container, "container", `irreversible ${r.id}`);
  }

  for (const c of pack.claims) {
    for (const s of c.sources) s.items.forEach((i) => need(items, i, "item", `claim ${c.id}`));
  }

  need(characters, pack.truth.culprit, "character", "truth.culprit");
  need(characters, pack.accusation.culprit, "character", "accusation.culprit");
  if (pack.truth.culprit !== pack.accusation.culprit) errors.push("accusation.culprit differs from truth.culprit");
  pack.accusation.requiredClaims.flat().forEach((c) => need(claims, c, "claim", "accusation.requiredClaims"));
  pack.accusation.motiveClaims.forEach((c) => need(claims, c, "claim", "accusation.motiveClaims"));
  need(characters, pack.reconstruction.narrator, "character", "reconstruction.narrator");

  if (pack.meta.players.min > pack.meta.players.max) errors.push("meta.players.min exceeds max");

  return errors.length ? { ok: false, errors } : { ok: true, pack };
}
