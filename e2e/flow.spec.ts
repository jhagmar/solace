import { expect, type Locator, type Page, test } from "@playwright/test";
import { mockOpenMeteo } from "./openMeteoMock";

async function dragHandleShowsTime(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  const clientX = box!.x + box!.width / 2;
  const clientY = box!.y + box!.height / 2;
  await target.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX,
    clientY,
  });
  const tip = page.locator("[data-chart-drag-time]");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/\d{1,2}:\d{2}/);
  const outline = await target.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("none");
  await page.locator('svg[role="img"]').dispatchEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY,
  });
  await expect(tip).toHaveCount(0);
}

test("search, forecast, sunscreen and exposure", async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto("/");

  const location = page.getByLabel("Location");
  await location.click();
  await location.pressSequentially("Oslo", { delay: 30 });
  await expect(page.getByRole("option", { name: /Oslo/ })).toBeVisible();
  await page.getByRole("option", { name: /Oslo/ }).click();

  await expect(page.getByText("Today's UV")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Location" })).toHaveValue("Oslo, Norway");
  await expect(page.getByRole("img", { name: /UV index/ })).toBeVisible();
  await expect(page.getByText("Tap below to add an outdoor window.")).toBeVisible();
  await expect(page.getByRole("button", { name: "1 hour" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2 hours" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rest of day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear outdoor windows" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear sunscreen" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear the day" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "1 hour" }).click();
  await expect(page.getByText("Tap below to add an outdoor window.")).toHaveCount(0);
  await page
    .getByRole("button", { name: /outside ·/i })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outdoor window" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Clear outdoor windows" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Clear sunscreen" })).toBeDisabled();
  await page.getByRole("button", { name: "Clear the day" }).click();
  await expect(page.getByRole("heading", { name: "Clear the day" })).toBeVisible();
  await expect(
    page.getByText(
      "This removes every outdoor window and sunscreen stamp, and starts burn risk from zero.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Clear the day" })).toBeHidden();
  await expect(page.getByRole("button", { name: /outside ·/i })).toBeVisible();

  await expect(page.getByText("Tap below to log sunscreen.")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Tap below to log sunscreen.")).toBeVisible();

  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "About Amount" }).click();
  await expect(page.getByText(/two-finger rule/i)).toBeVisible();
  await expect(page.getByText(/half the labelled Spf/i)).toBeVisible();
  await page.getByRole("button", { name: "About Amount" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Sunscreen" })).toBeHidden();
  await expect(page.getByRole("button", { name: /Spf 30/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sunscreen applied" })).toBeVisible();

  await dragHandleShowsTime(page, page.locator("svg rect.cursor-ew-resize").first());
  await dragHandleShowsTime(page, page.locator("svg rect.cursor-ew-resize").nth(1));
  await dragHandleShowsTime(page, page.getByRole("button", { name: "Sunscreen applied" }));
  await page.getByRole("button", { name: "Wash off" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Sunscreen washed off" })).toBeVisible();
  await dragHandleShowsTime(page, page.getByRole("button", { name: "Sunscreen washed off" }));

  await page.getByRole("button", { name: /Spf 30/ }).click();
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Clear sunscreen" }).click();
  await expect(page.getByText("Tap below to log sunscreen.")).toBeVisible();
  await page.getByRole("button", { name: "Clear outdoor windows" }).click();
  await expect(page.getByText("Tap below to add an outdoor window.")).toBeVisible();

  await page.getByRole("button", { name: "1 hour" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Clear the day" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Clear the day" })).toBeHidden();
  await expect(page.getByText("Tap below to add an outdoor window.")).toBeVisible();
  await expect(page.getByText("Tap below to log sunscreen.")).toBeVisible();
});
