import { z } from "zod";

// A case pack is pure content. The engine is the only consumer of `truth`,
// `facts`, character `knowledge` and the evidence graph; none of it is ever
// sent to a client or to an LLM unfiltered.

const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "ids are lowercase slugs");
const SlotId = z.string().regex(/^[A-Z]$/, "player slots are single capital letters");

// Story time as shown to players ("Wed 17:12") plus a sortable ISO value for the timeline.
const StoryTime = z.object({ label: z.string(), at: z.string().datetime({ offset: true }) });

// ---------- Conditions ----------
// Evaluated by the engine against world state and the current conversation.

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { always: true }
  | { presented: string } // item shown to this character at any time
  | { askedAbout: string } // classifier tagged the current question with this topic
  | { askedBy: string } // current question comes from this player slot
  | { admitted: string } // this character has already revealed this knowledge entry
  | { flag: string }
  | { onBoard: string } // item is on the shared Board
  | { minutesElapsed: number };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
    z.object({ always: z.literal(true) }).strict(),
    z.object({ presented: Id }).strict(),
    z.object({ askedAbout: Id }).strict(),
    z.object({ askedBy: SlotId }).strict(),
    z.object({ admitted: Id }).strict(),
    z.object({ flag: Id }).strict(),
    z.object({ onBoard: Id }).strict(),
    z.object({ minutesElapsed: z.number().nonnegative() }).strict(),
  ]),
);

// ---------- World objects ----------

export const ContainerSchema = z.object({
  id: Id,
  // "personal" holds starting materials; its items reach players only through slots.
  kind: z.enum(["computer", "mailbox", "gallery", "location", "personal"]),
  title: z.string(),
  parent: Id.optional(), // a mailbox lives inside a computer
  password: z.string().optional(),
  access: z.union([z.literal("all"), z.array(SlotId).min(1)]),
  unlockedBy: ConditionSchema.optional(), // hidden until true (e.g. a cabinet noticed on a photo)
  scene: z.string().optional(), // establishing shot shown behind the location
});

const ItemBase = {
  id: Id,
  container: Id,
  title: z.string(),
  time: StoryTime.optional(),
  hidden: z.boolean().default(false), // revealed only by a director action
  evidences: z.array(Id).default([]), // fact ids; engine-only, used for scoring and history
};

export const HotspotSchema = z.object({
  id: Id,
  label: z.string(),
  // Rectangle in percentages of the image.
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(0).max(100),
  h: z.number().min(0).max(100),
  minZoom: z.number().min(1).default(2),
  setsFlag: Id.optional(),
});

export const ItemSchema = z.discriminatedUnion("kind", [
  z.object({
    ...ItemBase,
    kind: z.literal("mail"),
    from: z.string(),
    to: z.string(),
    body: z.string(),
    attachments: z.array(z.string()).default([]),
  }),
  z.object({
    ...ItemBase,
    kind: z.literal("document"),
    body: z.string(), // markdown
  }),
  z.object({
    ...ItemBase,
    kind: z.literal("table"),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    ...ItemBase,
    kind: z.literal("photo"),
    src: z.string(),
    caption: z.string(),
    exif: z.object({ author: z.string(), takenAt: z.string() }),
    hotspots: z.array(HotspotSchema).default([]),
    // Evidence details drawn over the photo by the client, never by an image
    // generator: x/y in percent of the image, size in percent of its width.
    marks: z
      .array(
        z.object({
          text: z.string(),
          x: z.number(),
          y: z.number(),
          size: z.number().positive(),
          rotate: z.number().default(0),
          style: z.enum(["pencil", "emboss", "ink"]),
        }),
      )
      .default([]),
    alt: z.string(),
  }),
  z.object({
    ...ItemBase,
    kind: z.literal("finding"),
    body: z.string(), // what the players see when they search a location
  }),
]);

// ---------- Characters ----------

export const KnowledgeSchema = z.object({
  id: Id,
  // What the character says once unlocked; the LLM paraphrases, never extends.
  says: z.string(),
  unlock: ConditionSchema,
  truthful: z.boolean(), // false for lies the character tells under this condition
  setsFlags: z.array(Id).default([]),
});

export const TopicSchema = z.object({
  id: Id,
  // Instruction for the question classifier.
  description: z.string(),
});

export const CharacterSchema = z.object({
  id: Id,
  name: z.string(),
  role: z.string(),
  voice: z.object({
    gender: z.enum(["female", "male"]),
    style: z.string(),
    elevenlabs: z.string().optional(), // ElevenLabs voice id for synthesized speech
  }),
  bio: z.string(),
  personality: z.string(),
  coverStory: z.array(z.string()).min(1), // always available to the LLM
  knowledge: z.array(KnowledgeSchema),
  topics: z.array(TopicSchema),
  never: z.array(z.string()),
  talksTo: z.union([z.literal("all"), z.array(SlotId).min(1)]),
  refusal: z.string(), // said to players outside `talksTo`
  pressure: z.object({
    limit: z.number().int().min(1),
    endLine: z.string(),
    cooldownMinutes: z.number().min(0),
  }),
  channel: z.enum(["voice", "text"]),
  portrait: z.string().optional(), // close-up used on calls
});

// ---------- Players ----------

export const SlotSchema = z.object({
  id: SlotId,
  label: z.string(),
  intro: z.string(), // personal briefing shown only to this slot
  items: z.array(Id).default([]), // delivered to the personal folder at start
  contacts: z.array(Id).default([]), // characters this slot can call from the start
});

export const SlotMergeSchema = z.object({
  players: z.number().int().min(1),
  from: SlotId,
  into: SlotId,
});

// ---------- Director ----------

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    to: z.union([z.literal("all"), SlotId]),
    from: z.string(),
    text: z.string(),
  }),
  z.object({ type: z.literal("trashItem"), item: Id, trashRecord: Id }),
  z.object({ type: z.literal("revealItem"), item: Id }),
  z.object({ type: z.literal("setFlag"), flag: Id }),
  z.object({ type: z.literal("actTransition"), toAct: Id }),
  z.object({ type: z.literal("requestVerdict") }),
]);

export const EventSchema = z.object({
  id: Id,
  type: z.enum(["mandatory", "reactive", "support"]),
  when: ConditionSchema,
  delayMinutes: z.number().min(0).default(0),
  actions: z.array(ActionSchema).min(1),
  once: z.boolean().default(true),
});

export const IrreversibleSchema = z.object({
  id: Id,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("present"), character: Id }),
    z.object({ kind: z.literal("openContainer"), container: Id }),
  ]),
  risk: z.string(),
});

// ---------- Evidence graph ----------

export const ClaimSchema = z.object({
  id: Id,
  statement: z.string(),
  // Independent sources; each source is satisfied when all its items are on the Board.
  sources: z.array(z.object({ id: Id, items: z.array(Id).min(1) })).min(1),
});

export const AccusationSchema = z.object({
  culprit: Id,
  // Every group must be satisfied by at least one of its claims.
  requiredClaims: z.array(z.array(Id).min(1)).min(1),
  motiveClaims: z.array(Id).min(1),
  minSourcesPerClaim: z.number().int().min(1),
  minItems: z.number().int().min(1),
});

// ---------- Pack ----------

export const CasePackSchema = z.object({
  meta: z.object({
    id: Id,
    title: z.string(),
    language: z.string().min(2),
    players: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    minutes: z.number().int().positive(),
    cover: z.string().optional(), // title shot
  }),
  briefing: z.object({ title: z.string(), text: z.string(), image: z.string().optional() }),
  truth: z.object({
    summary: z.string(),
    culprit: Id,
    timeline: z.array(z.object({ time: z.string(), event: z.string() })).min(1),
  }),
  facts: z.array(z.object({ id: Id, statement: z.string() })).min(1),
  acts: z.array(z.object({ id: Id, title: z.string(), image: z.string().optional() })).min(1),
  containers: z.array(ContainerSchema).min(1),
  items: z.array(ItemSchema).min(1),
  characters: z.array(CharacterSchema).min(1),
  slots: z.array(SlotSchema).min(1),
  slotMerges: z.array(SlotMergeSchema).default([]),
  events: z.array(EventSchema).default([]),
  irreversible: z.array(IrreversibleSchema).default([]),
  claims: z.array(ClaimSchema).min(1),
  accusation: AccusationSchema,
  reconstruction: z.object({ narrator: Id, text: z.string(), reveals: z.array(z.string()).default([]), image: z.string().optional() }),
  // Optional "skip ahead" start for demos: a game already a few minutes in.
  demo: z
    .object({
      minutesAhead: z.number().min(0),
      unlock: z.array(Id).default([]),
      board: z.array(Id).default([]),
      fired: z.array(Id).default([]),
    })
    .optional(),
});

export type CasePackInput = z.input<typeof CasePackSchema>;
export type CasePack = z.output<typeof CasePackSchema>;
export type Item = z.output<typeof ItemSchema>;
export type Character = z.output<typeof CharacterSchema>;
export type Knowledge = z.output<typeof KnowledgeSchema>;
export type Container = z.output<typeof ContainerSchema>;
export type DirectorEvent = z.output<typeof EventSchema>;
export type DirectorAction = z.output<typeof ActionSchema>;
export type Claim = z.output<typeof ClaimSchema>;

export { validateCasePack, type ValidationResult } from "./validate";
