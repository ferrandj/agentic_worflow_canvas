import { test, expect } from "@playwright/test";
import { createCanvas, dragCenterTo } from "./helpers";

test.describe.configure({ mode: "serial" });

test("create two canvases, switch between them, content persists", async ({ page }) => {
  await page.goto("/");

  await createCanvas(page, "first");
  await page.click('[data-testid="add-agent"]');
  await page.waitForTimeout(300);
  await dragCenterTo(page, '[data-testid="node-New Agent"]', 700, 300);

  await createCanvas(page, "second");
  await expect(page.getByTestId("node-New Agent")).toHaveCount(0);
  await page.click('[data-testid="add-code"]');
  await page.waitForTimeout(300);

  // Switch back to "first": the agent is still there.
  await page.click('[data-testid="canvas-item-first"]');
  await expect(page.getByTestId("node-New Agent")).toHaveCount(1);
  await expect(page.getByTestId("node-New Code")).toHaveCount(0);

  // And "second" kept its code block.
  await page.click('[data-testid="canvas-item-second"]');
  await expect(page.getByTestId("node-New Code")).toHaveCount(1);
});

test("content survives a full page reload", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "persistent");
  await page.click('[data-testid="add-person"]');
  await page.waitForTimeout(1200); // let the autosave debounce flush

  await page.reload();
  await page.waitForSelector('[data-testid="flow-canvas"]');
  await expect(page.getByTestId("node-New Person")).toHaveCount(1);
});

test("rename and delete canvases from the sidebar", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "temp");

  // Rename via hover action.
  await page.hover('[data-testid="canvas-item-temp"]');
  await page.locator('[data-testid="canvas-item-temp"] button[title="Rename"]').click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("kept");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("canvas-item-kept")).toBeVisible();

  // Delete (accept the confirm dialog).
  page.on("dialog", (dialog) => dialog.accept());
  await page.hover('[data-testid="canvas-item-kept"]');
  await page.locator('[data-testid="canvas-delete-kept"]').click();
  await expect(page.getByTestId("canvas-item-kept")).toHaveCount(0);
});
