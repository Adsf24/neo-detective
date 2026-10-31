import { expect, test, type Page } from "@playwright/test";

async function joinAs(page: Page, room: string, name: string) {
  await page.goto(`/?room=${room}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("list", { name: "Players" })).toContainText(name);
}

test("three players explore the world and share evidence through the Board", async ({ browser }) => {
  const room = `e2e-${Date.now()}`;
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [ann, bob, cy] = await Promise.all(contexts.map((c) => c.newPage()));

  await joinAs(ann!, room, "Ann");
  await joinAs(bob!, room, "Bob");
  await joinAs(cy!, room, "Cy");

  await ann!.getByRole("button", { name: "Start the investigation" }).click();
  for (const page of [ann!, bob!, cy!]) await page.getByRole("button", { name: "Start investigating" }).click();

  // Starting materials are personal: with three players Ann also holds the anonymous letter.
  await expect(ann!.getByRole("button", { name: /No subject/ })).toBeVisible();
  await expect(bob!.getByRole("button", { name: /No subject/ })).toHaveCount(0);
  await expect(bob!.getByRole("button", { name: /Note from Paul/ })).toBeVisible();

  // Only Ann sees the photos.
  await expect(ann!.getByRole("heading", { name: "Photos" })).toBeVisible();
  await expect(cy!.getByRole("heading", { name: "Photos" })).toHaveCount(0);

  // Bob unlocks the computer with the password from his note and posts the change log.
  await bob!.getByLabel("Password").fill("PG-1962");
  await bob!.getByRole("button", { name: "Unlock" }).click();
  await bob!.getByRole("button", { name: /Registry — change log/ }).click();
  await bob!.getByLabel("Why it matters").fill("Marina changed No.14 at 17:40");
  await bob!.getByRole("button", { name: "Post to Board" }).click();
  await expect(bob!.getByText(/On the Board — posted by Bob/)).toBeVisible();

  // Everyone sees it on the Board within a second.
  for (const page of [ann!, cy!]) {
    await page.getByRole("button", { name: /^Board/ }).click();
    const board = page.getByRole("list", { name: "Board" });
    await expect(board).toContainText("Registry — change log", { timeout: 1_000 });
    await expect(board).toContainText("Marina changed No.14 at 17:40");
  }

  // Cy can open the posted item although the computer is still locked for him.
  await cy!.getByRole("button", { name: /Registry — change log/ }).click();
  await expect(cy!.getByRole("table")).toContainText("m.cole");

  await Promise.all(contexts.map((c) => c.close()));
});

test("a refreshed player rejoins the same seat", async ({ browser }) => {
  const room = `e2e-rejoin-${Date.now()}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await joinAs(page, room, "Ann");
  await page.reload();
  await expect(page.getByRole("list", { name: "Players" })).toContainText("Ann");
  await expect(page.getByRole("list", { name: "Players" }).getByRole("listitem")).toHaveCount(1);
  await context.close();
});

test("a speakerphone call: showing evidence makes the witness change her story for everyone", async ({ browser }) => {
  const room = `e2e-call-${Date.now()}`;
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [ann, bob, cy] = await Promise.all(contexts.map((c) => c.newPage()));
  await joinAs(ann!, room, "Ann");
  await joinAs(bob!, room, "Bob");
  await joinAs(cy!, room, "Cy");
  await ann!.getByRole("button", { name: "Start the investigation" }).click();
  for (const page of [ann!, bob!, cy!]) await page.getByRole("button", { name: "Start investigating" }).click();

  // Bob gets the change log from the computer.
  await bob!.getByLabel("Password").fill("PG-1962");
  await bob!.getByRole("button", { name: "Unlock" }).click();

  // Bob calls Marina on speakerphone and shows it.
  await bob!.getByRole("listitem").filter({ hasText: "Marina Cole" }).getByRole("button", { name: "Call" }).click();
  await bob!.getByLabel("Your question").fill("What did you do on Wednesday afternoon?");
  await bob!.getByRole("button", { name: "Ask" }).click();
  const transcript = bob!.getByLabel("Transcript");
  await expect(transcript).toContainText("packing delivery");

  await bob!.getByRole("button", { name: "Show evidence" }).click();
  await bob!.getByRole("list", { name: "Evidence to show" }).getByRole("button", { name: "Registry — change log" }).click();
  await bob!.getByLabel("Your question").fill("Why did you change the registry?");
  await bob!.getByRole("button", { name: "Ask" }).click();

  // Showing evidence to the suspect is irreversible: a second detective has to agree.
  await expect(bob!.getByText("Waiting for a second detective", { exact: false }).first()).toBeVisible();
  await expect(ann!.getByText("Show Registry — change log to Marina Cole")).toBeVisible();
  await ann!.getByRole("button", { name: "Agree" }).click();
  await expect(transcript).toContainText("Paul asked me");

  // Marina is now alerted: the director opens the act transition for everyone.
  await expect(cy!.getByRole("dialog", { name: "Working version" })).toBeVisible();

  // Bob steps out of the version form to post the change log as backing.
  await bob!.getByRole("button", { name: "Look through the materials first" }).click();
  await bob!.getByRole("button", { name: "← Hang up" }).click();
  await bob!.getByRole("button", { name: /Registry — change log/ }).click();
  await bob!.getByRole("button", { name: "Post to Board" }).click();

  // The team records its working version; Act II starts for everyone.
  const dialog = cy!.getByRole("dialog", { name: "Working version" });
  await dialog.getByLabel("Who").selectOption({ label: "Marina Cole — Gallery administrator" });
  await dialog.getByLabel("What happened").fill("She swapped the print and changed the card to cover it.");
  await dialog.getByLabel("Why").fill("Stern offered money.");
  await dialog.getByLabel("Registry — change log").check();
  await dialog.getByRole("button", { name: "Record our version" }).click();
  await expect(cy!.getByRole("dialog", { name: "Working version" })).toHaveCount(0);
  await expect(ann!.getByText("Pressure")).toBeVisible();

  // Ann heard Marina on the speaker.
  await ann!.getByRole("listitem").filter({ hasText: "Marina Cole" }).getByRole("button", { name: "Call" }).click();
  await expect(ann!.getByLabel("Transcript")).toContainText("Paul asked me");

  await Promise.all(contexts.map((c) => c.close()));
});

test("the team votes in secret, accuses with evidence and reads its debrief", async ({ browser }) => {
  const room = `e2e-final-${Date.now()}`;
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [ann, bob, cy] = await Promise.all(contexts.map((c) => c.newPage()));
  await joinAs(ann!, room, "Ann");
  await joinAs(bob!, room, "Bob");
  await joinAs(cy!, room, "Cy");
  await ann!.getByRole("button", { name: "Start the investigation" }).click();
  for (const page of [ann!, bob!, cy!]) await page.getByRole("button", { name: "Start investigating" }).click();

  await bob!.getByLabel("Password").fill("PG-1962");
  await bob!.getByRole("button", { name: "Unlock" }).click();
  for (const title of ["Door access log — Wednesday", "Registry — change log"]) {
    await bob!.getByRole("button", { name: new RegExp(title) }).click();
    await bob!.getByRole("button", { name: "Post to Board" }).click();
    await bob!.getByRole("button", { name: "← Back" }).click();
  }
  await bob!.locator("summary", { hasText: "m.cole@lumengallery.example" }).click();
  await bob!.getByRole("button", { name: /Re: The Embankment.*Mon, Oct 26/ }).click(); // Stern's terms: the motive
  await bob!.getByRole("button", { name: "Post to Board" }).click();
  await bob!.getByRole("button", { name: "← Back" }).click();

  await ann!.getByRole("button", { name: /^Board/ }).click();
  await ann!.getByRole("button", { name: "We're ready — call the verdict" }).click();

  for (const page of [ann!, bob!, cy!]) {
    await page.getByRole("dialog", { name: "Verdict" }).getByRole("button", { name: /Marina Cole/ }).click();
  }
  const verdict = ann!.getByRole("dialog", { name: "Verdict" });
  await expect(verdict.getByRole("heading", { name: "The votes" })).toBeVisible();

  await verdict.getByLabel("Accused").selectOption({ label: "Marina Cole" });
  await verdict.getByLabel("What happened, in order").fill("She swapped the print while alone and changed the registry.");
  await verdict.getByLabel("Motive").fill("Stern's money.");
  for (const box of await verdict.getByRole("checkbox").all()) await box.check();
  await verdict.getByRole("button", { name: "Accuse" }).click();

  for (const page of [ann!, bob!, cy!]) {
    await expect(page.getByRole("heading", { name: "Case closed." })).toBeVisible();
    await expect(page.getByText("What really happened — Marina Cole")).toBeVisible();
  }

  await Promise.all(contexts.map((c) => c.close()));
});
