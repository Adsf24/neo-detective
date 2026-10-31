import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { Rooms } from "./rooms";

describe("Rooms", () => {
  it("keeps games separate per room code", () => {
    const rooms = new Rooms(CasePackSchema.parse(missingOriginal));
    rooms.act("one", { type: "join", player: "a", name: "Ann" });
    rooms.act("two", { type: "join", player: "b", name: "Bob" });
    expect([...rooms.views("one").keys()]).toEqual(["a"]);
    expect([...rooms.views("two").keys()]).toEqual(["b"]);
  });
});
