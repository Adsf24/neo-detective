import { expect, test } from "@playwright/test";

test("two players in a room see each other", async ({ browser }) => {
  const room = `e2e-${Date.now()}`;
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);

  for (const [page, name] of [[a, "Ann"], [b, "Bob"]] as const) {
    await page.goto(`/?room=${room}`);
    await page.getByLabel("Your name").fill(name);
    await page.getByRole("button", { name: "Join" }).click();
  }

  for (const page of [a, b]) {
    const players = page.getByRole("list", { name: "Players" });
    await expect(players).toContainText("Ann");
    await expect(players).toContainText("Bob");
  }
});
