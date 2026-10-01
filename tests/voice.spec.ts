import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // UI flow test: no microphone/audio or external STT service is used.
  await page.addInitScript(() => {
    class TestRecognition {
      start() {}
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: TestRecognition });
    Object.defineProperty(window, "speechSynthesis", { value: {
      cancel() {}, getVoices() { return []; },
      speak(utterance: SpeechSynthesisUtterance) {
        setTimeout(() => utterance.onend?.call(utterance, {} as SpeechSynthesisEvent), 25);
      },
    } });
  });
});

test("Next.js demo books only after confirmation, then cancels", async ({ page }) => {
  const configuration = await page.request.get("http://127.0.0.1:8000/config");
  test.skip((await configuration.json()).auth_mode !== "demo", "The running backend uses real Firebase authentication; run this guest integration test with AUTH_MODE=demo.");
  const browserErrors: string[] = [];
  page.on("pageerror", e => browserErrors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Local voice demo · Dubai")).toBeVisible();
  test.skip(await page.getByRole("button", { name: "Test prompts" }).count() === 0, "Deterministic browser QA is disabled in the patient-facing build.");
  await page.screenshot({ path: "test-results/noor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Start a conversation" }).click();
  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
  await page.getByRole("button", { name: "Test prompts" }).click();
  await page.getByRole("button", { name: "Book a cleaning", exact: true }).click();
  await expect(page.locator('.transcript')).toHaveCount(0);
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  // A closed Sunday is an expected business result, not a UI error.
  test.skip(new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Dubai', weekday: 'long'}).format(new Date(Date.now() + 86400000)) === 'Sunday', 'Clinic is closed tomorrow.');
  await page.getByRole("button", { name: "First", exact: true }).click();
  await expect(page.getByText("A little space for your next visit.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".appointment")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel my appointment", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".appointment")).toHaveCount(0);
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("button", { name: "Start a conversation" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("mobile page fits the screen and shows microphone and mode controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hi, I’m Noor." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start a conversation|Sign in & start talking/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/noor-mobile.png", fullPage: true });
  await expect(page.getByText("LiveKit AI voice", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice connection mode" })).toHaveCount(0);
});

test("Firebase mode requires sign-in and ignores a saved demo identity", async ({ page }) => {
  const configuration = await page.request.get("http://127.0.0.1:8000/config");
  test.skip((await configuration.json()).auth_mode !== "firebase", "This UI check applies when Firebase mode is active.");
  const patientRequests: string[] = [];
  page.on("request", request => {
    if (/\/(auth\/demo|me|appointments)$/.test(request.url())) patientRequests.push(request.url());
  });
  await page.addInitScript(() => localStorage.setItem("noor-demo-token", "old-demo-identity.invalid"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My appointments" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in & start talking" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".appointment")).toHaveCount(0);
  expect(patientRequests).toEqual([]);
});

test('patient screen hides transcripts and connected calendar identity', async ({ page }) => {
  await page.route('**/config', route => route.fulfill({ json: {
    auth_mode: 'firebase', livekit_configured: true, voice_pipeline: 'stt_tts',
    booking_mode: 'google_calendar', clinic_timezone: 'Asia/Dubai',
    doctors: [{ id: 'primary-doctor', name: 'Private calendar owner', services: ['cleaning'], calendar_connected: true }],
  } }));
  await page.goto('/');
  await expect(page.getByText('Appointment assistant', { exact: true })).toBeVisible();
  await expect(page.getByText('Private calendar owner')).toHaveCount(0);
  await expect(page.getByText('Your conversation', { exact: true })).toHaveCount(0);
  await expect(page.getByText('LIVE TRANSCRIPT')).toHaveCount(0);
  await expect(page.locator('.host-setup')).toHaveCount(0);
  await expect(page.locator('.doctor-schedule')).toHaveCount(0);
});
