const { chromium } = require('playwright');

async function testPagination() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  // Capture console logs and errors
  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  // Track network requests
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/connections/paged') || url.includes('/suggestions') || url.includes('/pending') || url.includes('/sent')) {
      const status = response.status();
      const body = await response.text().catch(() => 'N/A');
      console.log(`[API] ${response.request().method()} ${url} -> ${status}`);
    }
  });

  try {
    console.log('=== Loading login page ===');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

    console.log('=== Logging in ===');
    // Wait for form to be visible
    await page.waitForSelector('.auth-form', { timeout: 10000 });
    // Use more flexible selectors
    await page.fill('.auth-field input[placeholder="Email / Phone / Username"]', 'auser000001@loadtest.local');
    await page.fill('.auth-field input[placeholder="Password"]', 'a@12345678');
    await page.click('button.pf-primary-btn[type="submit"]');
    await page.waitForURL('**/contacts', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    console.log('=== On Contacts page - checking pagination ===');

    // Wait for contacts to load
    await page.waitForSelector('.nw-contact-row, .nw-table-pagination, .nw-state-box', { timeout: 10000 });

    // Check if pagination exists
    const pagination = await page.$('.nw-table-pagination .ant-pagination');
    if (pagination) {
      console.log('Pagination found on Contacts page');

      // Get current page
      const currentPage = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '1');
      console.log(`Current page: ${currentPage}`);

      // Get page size - try different selectors
      let pageSize = 'N/A';
      try {
        pageSize = await page.$eval('.ant-pagination-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (pageSize === 'N/A') pageSize = await page.$eval('.ant-pagination-options-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (pageSize === 'N/A') pageSize = await page.$eval('.ant-pagination-size-changer select', el => el.value);
      } catch {}
      console.log(`Current page size: ${pageSize}`);

      // Get total items
      const totalText = await page.$eval('.nw-discover-label span[title]', el => el.title).catch(() => 'N/A');
      console.log(`Total items: ${totalText}`);

      // Test clicking page 2 if it exists
      const page2 = await page.$('.ant-pagination-item-2');
      if (page2) {
        console.log('Clicking page 2...');
        await page2.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        const newPage = await page.$eval('.ant-pagination-item-active', el => el.textContent).catch(() => '?');
        console.log(`After click - Current page: ${newPage}`);
      }

      // Test changing page size to 100
      console.log('Changing page size to 100...');
      try {
        await page.click('.ant-pagination-size-changer .ant-select-selector');
      } catch {
        await page.click('.ant-pagination-options-size-changer .ant-select-selector');
      }
      await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      await page.click('.ant-select-item-option-content:has-text("100")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Get new page size
      let newPageSize = 'N/A';
      try {
        newPageSize = await page.$eval('.ant-pagination-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (newPageSize === 'N/A') newPageSize = await page.$eval('.ant-pagination-options-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      console.log(`After change - Page size: ${newPageSize}`);

    } else {
      console.log('No pagination found on Contacts page (maybe not enough items or mobile view)');
    }

    // Test Suggestions page
    console.log('\n=== Testing Suggestions page ===');
    await page.goto('http://localhost:3000/discover/suggestions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.nw-req-row, .nw-table-pagination, .nw-state-box', { timeout: 10000 });

    const suggPagination = await page.$('.nw-table-pagination .ant-pagination');
    if (suggPagination) {
      console.log('Pagination found on Suggestions page');
      let suggPageSize = 'N/A';
      try {
        suggPageSize = await page.$eval('.ant-pagination-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (suggPageSize === 'N/A') suggPageSize = await page.$eval('.ant-pagination-options-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      console.log(`Suggestions page size: ${suggPageSize}`);
      // Check options
      try {
        await page.click('.ant-pagination-size-changer .ant-select-selector');
      } catch {
        await page.click('.ant-pagination-options-size-changer .ant-select-selector');
      }
      await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      const options = await page.$$eval('.ant-select-item-option-content', els => els.map(e => e.textContent));
      console.log(`Suggestions page size options: ${options.join(', ')}`);
      await page.keyboard.press('Escape'); // close dropdown
    } else {
      console.log('No pagination on Suggestions page');
    }

    // Test Requests page
    console.log('\n=== Testing Requests page ===');
    await page.goto('http://localhost:3000/discover/requests', { waitUntil: 'networkidle' });
    await page.waitForSelector('.nw-req-row, .nw-table-pagination, .nw-state-box', { timeout: 10000 });

    const reqPagination = await page.$('.nw-table-pagination .ant-pagination');
    if (reqPagination) {
      console.log('Pagination found on Requests page');
      let reqPageSize = 'N/A';
      try {
        reqPageSize = await page.$eval('.ant-pagination-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      try {
        if (reqPageSize === 'N/A') reqPageSize = await page.$eval('.ant-pagination-options-size-changer .ant-select-selector', el => el.textContent);
      } catch {}
      console.log(`Requests page size: ${reqPageSize}`);
      try {
        await page.click('.ant-pagination-size-changer .ant-select-selector');
      } catch {
        await page.click('.ant-pagination-options-size-changer .ant-select-selector');
      }
      await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      const options = await page.$$eval('.ant-select-item-option-content', els => els.map(e => e.textContent));
      console.log(`Requests page size options: ${options.join(', ')}`);
      await page.keyboard.press('Escape');
    } else {
      console.log('No pagination on Requests page');
    }

    console.log('\n=== Test complete - keeping browser open for manual inspection ===');
    await page.waitForTimeout(30000);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
}

testPagination().catch(console.error);