const { chromium } = require('playwright');

async function testPaginationClicks() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/connections/paged') || url.includes('/suggestions?') || url.includes('/pending?') || url.includes('/sent?')) {
      const status = response.status();
      console.log(`[API] ${response.request().method()} ${url} -> ${status}`);
    }
  });

  try {
    console.log('=== Loading login page ===');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

    console.log('=== Logging in ===');
    await page.waitForSelector('.auth-form', { timeout: 10000 });
    await page.fill('.auth-field input[placeholder="Email / Phone / Username"]', 'auser000001@loadtest.local');
    await page.fill('.auth-field input[placeholder="Password"]', 'a@12345678');
    await page.click('button.pf-primary-btn[type="submit"]');
    await page.waitForURL('**/contacts', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Test Contacts page pagination clicks (pages 1, 2, 3)
    console.log('\n=== Contacts page - test page clicks ===');
    await page.waitForSelector('.nw-contact-row, .nw-table-pagination', { timeout: 10000 });
    for (let pg = 2; pg <= 4; pg++) {
      const pageBtn = await page.$(`.ant-pagination-item-${pg}`);
      if (pageBtn) {
        console.log(`Clicking page ${pg}...`);
        await pageBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        const current = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '?');
        console.log(`  Now on page: ${current}`);
      }
    }

    // Test Suggestions page pagination clicks
    console.log('\n=== Suggestions page - test page clicks ===');
    await page.goto('http://localhost:3000/discover/suggestions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.nw-req-row, .nw-table-pagination', { timeout: 10000 });

    for (let pg = 2; pg <= 4; pg++) {
      const pageBtn = await page.$(`.ant-pagination-item-${pg}`);
      if (pageBtn) {
        console.log(`Clicking page ${pg}...`);
        await pageBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        const current = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '?');
        console.log(`  Now on page: ${current}`);
      } else {
        console.log(`Page ${pg} button not found (may not exist)`);
        break;
      }
    }

    // Test Requests page - Received tab pagination clicks
    console.log('\n=== Requests page (Received) - test page clicks ===');
    await page.goto('http://localhost:3000/discover/requests', { waitUntil: 'networkidle' });
    await page.waitForSelector('.nw-req-row, .nw-table-pagination', { timeout: 10000 });

    for (let pg = 2; pg <= 4; pg++) {
      const pageBtn = await page.$(`.ant-pagination-item-${pg}`);
      if (pageBtn) {
        console.log(`Clicking page ${pg}...`);
        await pageBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        const current = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '?');
        console.log(`  Now on page: ${current}`);
      } else {
        console.log(`Page ${pg} button not found (may not exist)`);
        break;
      }
    }

    // Test Requests page - Sent tab
    console.log('\n=== Requests page (Sent tab) - test page clicks ===');
    await page.click('.nw-chip:has-text("Sent")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (let pg = 2; pg <= 4; pg++) {
      const pageBtn = await page.$(`.ant-pagination-item-${pg}`);
      if (pageBtn) {
        console.log(`Clicking page ${pg}...`);
        await pageBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        const current = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '?');
        console.log(`  Now on page: ${current}`);
      } else {
        console.log(`Page ${pg} button not found (may not exist)`);
        break;
      }
    }

    console.log('\n=== All pagination click tests complete ===');
    await page.waitForTimeout(10000);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
}

testPaginationClicks().catch(console.error);