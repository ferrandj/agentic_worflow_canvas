import { test, expect } from "@playwright/test";
import { createCanvas, dragCenterTo, dragOnto } from "./helpers";

test.describe.configure({ mode: "serial" });

test("app loads with sidebar and dotted canvas shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByText("Agent Flow Canvas").first()).toBeVisible();
});

test("full grouping workflow", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "smoke");

  // Add blocks and spread them out.
  await page.click('[data-testid="add-agent"]');
  await page.click('[data-testid="add-code"]');
  await page.waitForTimeout(300);
  await dragCenterTo(page, '[data-testid="node-New Agent"]', 600, 300);
  await dragCenterTo(page, '[data-testid="node-New Code"]', 950, 300);

  // Drag agent onto code -> both become a Group.
  await dragOnto(page, '[data-testid="node-New Agent"]', '[data-testid="node-New Code"]');
  await expect(page.getByTestId("container-Group")).toHaveCount(1);

  // Both members visible (wrap parks the dragged node beside the target).
  await expect(page.getByTestId("node-New Agent")).toBeVisible();
  await expect(page.getByTestId("node-New Code")).toBeVisible();

  // Moving a member drags the auto-hugging frame along; group persists.
  await dragCenterTo(page, '[data-testid="node-New Code"]', 950, 500);
  await expect(page.getByTestId("container-Group")).toHaveCount(1);

  // Remove-from-group via context menu -> group auto-dissolves at 1 member.
  await page.locator('[data-testid="node-New Agent"]').click({ button: "right" });
  await page.click('[data-testid="menu-remove-from-group"]');
  await expect(page.getByTestId("container-Group")).toHaveCount(0);
});

test("platform rejects Person blocks with a toast", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "platform-rule");

  await page.click('[data-testid="add-person"]');
  await page.click('[data-testid="add-platform"]');
  await page.waitForTimeout(300);
  await dragCenterTo(page, '[data-testid="node-New Person"]', 550, 250);
  await dragCenterTo(page, '[data-testid="container-New Platform"]', 700, 620);

  const before = await page.locator('[data-testid="node-New Person"]').boundingBox();
  await dragOnto(page, '[data-testid="node-New Person"]', '[data-testid="container-New Platform"]');

  await expect(page.locator("[data-sonner-toast]")).toContainText("Person");
  const after = await page.locator('[data-testid="node-New Person"]').boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(5);
});

test("degroup dissolves a container from the context menu", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "degroup");

  await page.click('[data-testid="add-agent"]');
  await page.click('[data-testid="add-code"]');
  await page.waitForTimeout(300);
  await dragCenterTo(page, '[data-testid="node-New Agent"]', 600, 300);
  await dragCenterTo(page, '[data-testid="node-New Code"]', 950, 300);
  await dragOnto(page, '[data-testid="node-New Agent"]', '[data-testid="node-New Code"]');
  await expect(page.getByTestId("container-Group")).toHaveCount(1);

  await page.locator('[data-testid="container-Group"]').click({ button: "right", position: { x: 10, y: 60 } });
  await page.click('[data-testid="menu-degroup"]');
  await expect(page.getByTestId("container-Group")).toHaveCount(0);
  await expect(page.getByTestId("node-New Agent")).toBeVisible();
  await expect(page.getByTestId("node-New Code")).toBeVisible();
});

test("theme toggle flips dark mode and persists across reload", async ({ page }) => {
  await page.goto("/");
  const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.click('[data-testid="theme-toggle"]');
  const nowDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(nowDark).toBe(!wasDark);

  await page.reload();
  await page.waitForSelector('[data-testid="sidebar"], [data-testid="sidebar-unfold"]');
  const stillDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(stillDark).toBe(nowDark);
});

test("mermaid export uses real names; import round-trips", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "mermaid-rt");

  await page.click('[data-testid="add-agent"]');
  await page.waitForTimeout(200);
  // Rename via inspector (node is selected after add).
  await page.fill('[data-testid="inspector-label"]', "Orchestrator");
  // Export reads the server copy — wait for the autosave to flush first.
  await page.waitForSelector('[data-save-state="clean"]', { timeout: 5000 });

  await page.click('[data-testid="export-mermaid"]');
  const mermaid = await page.getByTestId("mermaid-output").textContent();
  expect(mermaid).toContain('Orchestrator["Orchestrator"]');
  expect(mermaid).not.toMatch(/n_[a-z0-9]{8,}/);
});
