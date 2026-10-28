const { chromium } = require('playwright');

async function testLargePageSizes() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/connections/paged')) {
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

    console.log('\n=== Contacts page - test ALL page sizes ===');
    await page.waitForSelector('.nw-contact-row, .nw-table-pagination', { timeout: 10000 });

    // Test each page size option
    const sizes = ['50', '100', '200', '500', '1000'];

    for (const size of sizes) {
      console.log(`\n--- Testing page size: ${size} ---`);

      // Open page size dropdown
      try {
        await page.click('.ant-pagination-size-changer .ant-select-selector');
      } catch {
        await page.click('.ant-pagination-options-size-changer .ant-select-selector');
      }
      await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

      // Click the option
      const optionText = `${size} / page`;
      await page.click(`.ant-select-item-option-content:has-text("${optionText}")`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify the page size
      let currentSize = 'N/A';
      try {
        currentSize = await page.$eval('.ant-pagination-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (currentSize === 'N/A') currentSize = await page.$eval('.ant-pagination-options-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      console.log(`  Result page size: ${currentSize}`);

      // Check if data loaded (count rows)
      const rowCount = await page.$eval('.nw-contact-list', el => el.children.length).catch(() => 0);
      console.log(`  Rows visible: ${rowCount}`);

      // Go back to page 1
      const page1 = await page.$('.ant-pagination-item-1');
      if (page1) {
        await page1.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
      }
    }

    console.log('\n=== All page size tests complete ===');
    await page.waitForTimeout(10000);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
}

testLargePageSizes().catch(console.error);