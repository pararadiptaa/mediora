/**
 * Mediora Loadgen Bot — Playwright-based continuous load generator.
 *
 * Reads LOADGEN_VPM (Visits Per Minute, default 2) from environment.
 * Each iteration picks a random persona and walks through the UI flow
 * using a headless Chromium browser.
 */
const { chromium } = require("playwright");

// ── Config ──────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://frontend:80";
const VPM = parseInt(process.env.LOADGEN_VPM, 10) || 2;
const INTERVAL_MS = (60 / VPM) * 1000; // ms between scenario starts

// ── Helpers ──────────────────────────────────────────────────────────
function log(msg, extra = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        service: "loadgen",
        message: msg,
        ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
}

/** Random delay to simulate human reading time (1–3 s). */
function humanDelay() {
    const ms = 1000 + Math.random() * 2000;
    return new Promise((r) => setTimeout(r, ms));
}

/** Sleep for a fixed ms. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Mock user data (must match login.html buttons) ──────────────────
const USERS = {
    budi: { id: "budi", name: "Budi" },
    siti: { id: "siti", name: "Siti" },
    john: { id: "john", name: "John" },
};

// ── Persona helpers ─────────────────────────────────────────────────

/**
 * Login as a given user by setting localStorage and navigating to dashboard.
 */
async function loginAs(page, userId) {
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Set localStorage directly (reliable across all login page implementations)
    await page.evaluate((u) => {
        localStorage.setItem("mediora_user", JSON.stringify(u));
    }, USERS[userId]);

    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();
}

/** Logout by clearing localStorage and navigating to login. */
async function logout(page) {
    await page.evaluate(() => localStorage.removeItem("mediora_user"));
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: "domcontentloaded" });
}

// ── Persona 1: The Perfect Patient ──────────────────────────────────
async function perfectPatient(page) {
    log("▶ Persona: The Perfect Patient (User A → book → pay → success)");
    await loginAs(page, "budi");

    // Go to booking
    await page.goto(`${BASE_URL}/booking.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Select specialty
    await page.selectOption("#specialty-select", "cardiology");
    await humanDelay();

    // Select doctor
    await page.selectOption("#doctor-select", "dr-tirta");
    await humanDelay();

    // Click Confirm Booking
    await page.click("#confirm-booking-btn");

    // Wait for navigation to billing (success redirect) or alert (failure)
    try {
        await page.waitForURL("**/billing.html", { timeout: 30000 });
    } catch {
        log("  ⚠ Booking may have failed — accepting potential alert");
        return;
    }
    await humanDelay();

    // Fill Valid CC
    await page.click("#fill-valid-cc");
    await humanDelay();

    // Process Payment
    await page.click("#process-payment-btn");

    // Wait for navigation to success or failed
    try {
        await page.waitForURL("**/success.html", { timeout: 15000 });
        log("  ✅ Reached success.html");
    } catch {
        log("  ⚠ Did not reach success.html");
    }
    await humanDelay();

    await logout(page);
    log("  ✔ Perfect Patient complete");
}

// ── Persona 2: The Window Shopper ───────────────────────────────────
async function windowShopper(page) {
    log("▶ Persona: The Window Shopper (User A → book → cancel)");
    await loginAs(page, "budi");

    await page.goto(`${BASE_URL}/booking.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Select specialty
    await page.selectOption("#specialty-select", "dental");
    await humanDelay();

    // Select doctor
    await page.selectOption("#doctor-select", "dr-sisca");
    await humanDelay();

    // Click Cancel link
    await page.click('a[href="/dashboard.html"]');
    await page.waitForURL("**/dashboard.html", { timeout: 10000 });
    await humanDelay();

    await logout(page);
    log("  ✔ Window Shopper complete");
}

// ── Persona 3: The Hypochondriac ────────────────────────────────────
async function hypochondriac(page) {
    log("▶ Persona: The Hypochondriac (User B → records → view detail)");
    await loginAs(page, "siti");

    // Navigate to Medical Records
    await page.goto(`${BASE_URL}/records.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Click the first "View" link (now an anchor to record-detail.html)
    const viewLinks = page.locator('a[href*="record-detail.html"]');
    if ((await viewLinks.count()) > 0) {
        await viewLinks.first().click();
        try {
            await page.waitForURL("**/record-detail.html**", { timeout: 10000 });
            log("  📋 Reached record-detail.html");
        } catch {
            log("  ⚠ Did not reach record-detail.html");
        }
        await humanDelay();
    }

    await logout(page);
    log("  ✔ Hypochondriac complete");
}

// ── Persona 4: The Broke Patient ────────────────────────────────────
async function brokePatient(page) {
    log("▶ Persona: The Broke Patient (User B → billing → declined CC → failed)");
    await loginAs(page, "siti");

    await page.goto(`${BASE_URL}/billing.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Fill Declined CC
    await page.click("#fill-declined-cc");
    await humanDelay();

    // Process Payment
    await page.click("#process-payment-btn");

    // Wait for failed.html
    try {
        await page.waitForURL("**/failed.html", { timeout: 15000 });
        log("  ❌ Reached failed.html (expected)");
    } catch {
        log("  ⚠ Did not reach failed.html");
    }
    await humanDelay();

    await logout(page);
    log("  ✔ Broke Patient complete");
}

// ── Persona 5: The Chaos Magnet ─────────────────────────────────────
async function chaosMagnet(page) {
    log("▶ Persona: The Chaos Magnet (User C → Dr. Chaos → error)");
    await loginAs(page, "john");

    await page.goto(`${BASE_URL}/booking.html`, { waitUntil: "domcontentloaded" });
    await humanDelay();

    // Select Neurology → Dr. Chaos
    await page.selectOption("#specialty-select", "neurology");
    await humanDelay();
    await page.selectOption("#doctor-select", "dr-chaos");
    await humanDelay();

    // Set up dialog handler
    page.once("dialog", async (dialog) => {
        log(`  ⚠ Alert: ${dialog.message().substring(0, 80)}`);
        await dialog.accept();
    });

    // Click Confirm Booking — expect error alert
    await page.click("#confirm-booking-btn");
    await sleep(3000); // wait for the simulated delay + alert
    await humanDelay();

    await logout(page);
    log("  ✔ Chaos Magnet complete");
}

// ── Persona pool ────────────────────────────────────────────────────
const PERSONAS = [
    perfectPatient,
    windowShopper,
    hypochondriac,
    brokePatient,
    chaosMagnet,
];

// ── Main loop ───────────────────────────────────────────────────────
(async () => {
    log(`Loadgen starting — VPM=${VPM}, interval=${INTERVAL_MS}ms, target=${BASE_URL}`);

    // Wait for frontend to be ready
    log("Waiting 10 s for services to initialize…");
    await sleep(10000);

    let iteration = 0;

    while (true) {
        iteration++;
        const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
        const personaName = persona.name;

        let browser;
        try {
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const page = await context.newPage();

            // Dismiss unexpected dialogs
            page.on("dialog", async (dialog) => {
                try { await dialog.accept(); } catch { }
            });

            log(`── Iteration ${iteration} ──────────────────`, { persona: personaName });
            await persona(page);

            await context.close();
        } catch (err) {
            log(`ERROR in iteration ${iteration}`, { persona: personaName, error: err.message });
        } finally {
            if (browser) {
                try { await browser.close(); } catch { }
            }
        }

        // Pace based on VPM
        await sleep(INTERVAL_MS);
    }
})();
