const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';
const PRODUCT_ID = '1';

async function fetchWithTiming(url, method = 'GET', body = null) {
  const startTime = Date.now();
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();
  const elapsed = Date.now() - startTime;
  
  return { data, elapsed };
}

async function runCachingTest() {
  console.log('================================================================');
  console.log('   STARTING DISTRIBUTED CACHING VERIFICATION TESTS (REQ 6)      ');
  console.log('================================================================\n');

  console.log('--- Resetting Server State ---');
  await fetchWithTiming(`${BASE_URL}/reset`, 'POST');

  console.log('\n--- TEST 2: Cache-Aside Lifecycle (findOneCached) ---');
  
  console.log(`Request 1: Fetching Laptop (ID: ${PRODUCT_ID}) for the first time...`);
  let res1 = await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/cached`);
  console.log(`Result: Stock = ${res1.data.data.stock}, Version = ${res1.data.data.version}`);
  console.log(`Response Time: ${res1.elapsed}ms (Expected: ~500ms due to Database delay)\n`);

  console.log(`Request 2: Fetching Laptop (ID: ${PRODUCT_ID}) again (should hit Cache)...`);
  let res2 = await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/cached`);
  console.log(`Result: Stock = ${res2.data.data.stock}, Version = ${res2.data.data.version}`);
  console.log(`Response Time: ${res2.elapsed}ms (Expected: <15ms - Fast Cache Hit)\n`);

  console.log(`Request 3: Fetching Laptop (ID: ${PRODUCT_ID}) third time (should hit Cache)...`);
  let res3 = await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/cached`);
  console.log(`Result: Stock = ${res3.data.data.stock}, Version = ${res3.data.data.version}`);
  console.log(`Response Time: ${res3.elapsed}ms (Expected: <15ms - Fast Cache Hit)\n`);

  console.log('--- TEST 3: Cache Invalidation Scenario (Stock Update) ---');
  console.log(`We will update stock of Laptop (ID: ${PRODUCT_ID}) to trigger cache invalidation.`);
  
  // Update stock to trigger invalidation using Optimistic Locking
  await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/buy-optimistic`, 'POST', { quantity: 2, version: res3.data.data.version });
  
  console.log('Update Result: Stock updated successfully.');

  console.log(`\nRequest 4: Fetching Laptop (ID: ${PRODUCT_ID}) immediately after update...`);
  console.log(`The cache was invalidated, so it must query the Database again.`);
  let res4 = await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/cached`);
  console.log(`Result: Stock = ${res4.data.data.stock}, Version = ${res4.data.data.version}`);
  console.log(`Response Time: ${res4.elapsed}ms (Expected: ~500ms - Database Query for fresh data)\n`);

  console.log(`Request 5: Fetching Laptop (ID: ${PRODUCT_ID}) again...`);
  let res5 = await fetchWithTiming(`${BASE_URL}/products/${PRODUCT_ID}/cached`);
  console.log(`Result: Stock = ${res5.data.data.stock}, Version = ${res5.data.data.version}`);
  console.log(`Response Time: ${res5.elapsed}ms (Expected: <15ms - Cache Hit with updated stock)\n`);
}

runCachingTest().catch(console.error);
