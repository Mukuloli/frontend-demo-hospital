import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("noor-demo-token", "chat-test-token"));
  await page.route("**/config", route => route.fulfill({ json: {
    auth_mode: "demo", livekit_configured: false, voice_pipeline: "stt_tts",
    booking_mode: "local_demo", clinic_timezone: "Asia/Dubai", doctors: [],
  } }));
  await page.route("**/me", route => route.fulfill({ json: { uid: "chat-test", name: "Test patient" } }));
  await page.route("**/appointments", route => route.fulfill({ json: { appointments: [] } }));
  await page.route("**/availability?**", route => route.fulfill({ json: { slots: [] } }));
});

test("chat sends authorized messages to ADK and keeps the conversation session", async ({ page }) => {
  const sessionIds: string[] = [];
  await page.route("**/chat", async route => {
    expect(new URL(route.request().url()).port).toBe("8001");
    expect(route.request().headers()["authorization"]).toBe("Bearer chat-test-token");
    const body = route.request().postDataJSON() as { session_id: string; message: string };
    sessionIds.push(body.session_id);
    await route.fulfill({ json: { reply: `Received: ${body.message}` } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.locator("#chat-input").fill("Hello Noor");
  await page.locator("#chat-input").press("Enter");
  await expect(page.locator("#chat-messages")).toContainText("Received: Hello Noor");
  await page.locator("#chat-input").fill("Show my appointments");
  await page.locator("#chat-input").press("Enter");
  await expect(page.locator("#chat-messages")).toContainText("Received: Show my appointments");
  expect(sessionIds).toHaveLength(2);
  expect(sessionIds[0]).toBe(sessionIds[1]);
});

test("chat distinguishes an expired sign-in from a connection error", async ({ page }) => {
  await page.route("**/chat", route => route.fulfill({ status: 401, json: { detail: "Invalid token" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.locator("#chat-input").fill("Hello");
  await page.locator("#chat-input").press("Enter");
  await expect(page.locator("#chat-messages")).toContainText("Your sign-in has expired. Please sign in again.");
  await expect(page.locator("#chat-messages")).not.toContainText("couldn't reach booking server");
});

test("chat shows service errors and allows retrying", async ({ page }) => {
  await page.route("**/chat", route => route.fulfill({ status: 503, json: { detail: "Noor could not respond right now. Please try again." } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.locator("#chat-input").fill("Hello");
  await page.locator("#chat-input").press("Enter");
  await expect(page.locator("#chat-messages")).toContainText("Noor could not respond right now. Please try again.");
  await expect(page.locator("#chat-input")).toBeEnabled();
});
