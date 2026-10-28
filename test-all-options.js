const { chromium } = require('playwright');

async function testAllOptions() {
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

    // Test all three pages for page size options
    const pages = [
      { name: 'Contacts', url: '/contacts' },
      { name: 'Suggestions', url: '/discover/suggestions' },
      { name: 'Requests (Received)', url: '/discover/requests' },
    ];

    for (const p of pages) {
      console.log(`\n=== ${p.name} page - page size options ===`);
      await page.goto(`http://localhost:3000${p.url}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.nw-table-pagination, .nw-state-box', { timeout: 10000 });

      const pagination = await page.$('.nw-table-pagination .ant-pagination');
      if (pagination) {
        // Click page size dropdown
        try {
          await page.click('.ant-pagination-size-changer .ant-select-selector');
        } catch {
          await page.click('.ant-pagination-options-size-changer .ant-select-selector');
        }
        await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        const options = await page.$$eval('.ant-select-item-option-content', els => els.map(e => e.textContent));
        console.log(`  Options: ${options.join(', ')}`);
        await page.keyboard.press('Escape');
      } else {
        console.log('  No pagination (not enough items or mobile view)');
      }
    }

    console.log('\n=== Test complete ===');
    await page.waitForTimeout(10000);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
}

testAllOptions().catch(console.error);