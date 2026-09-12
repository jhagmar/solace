import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("main screen smoke and accessibility", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Solace");
  await expect(page.getByRole("heading", { level: 1, name: "solace" })).toBeVisible();
  await expect(page.getByLabel("Location")).toBeVisible();
  await expect(
    page.getByText("Choose a location to see today's UV forecast and your burn risk."),
  ).toBeVisible();
  await expect(
    page.getByText("This is where you will log sunscreen use once a location is chosen."),
  ).toBeVisible();
  await expect(page.getByText("This is where you will log going outside.")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  await page.getByRole("radio", { name: "Dark theme" }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#17130e");
  const openMeteo = page.getByRole("link", { name: "Open-Meteo" });
  await expect(openMeteo).toBeVisible();
  await expect(openMeteo).toHaveAttribute("target", "_blank");
  await expect(openMeteo).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("Version 1.3.0.")).toBeVisible();
  const github = page.getByRole("link", { name: "GitHub" });
  await expect(github).toBeVisible();
  await expect(github).toHaveAttribute("href", "https://github.com/jhagmar/solace");
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(github).toHaveAttribute("rel", "noopener noreferrer");

  const skip = page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.locator("#main-content")).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
