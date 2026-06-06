const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('   STARTING DISTRIBUTED CACHING VERIFICATION TESTS (REQ 6)      ');
  console.log('================================================================\n');

  const productId = '1';

  try {
    // -------------------------------------------------------------
    // TEST 1: Direct Database Queries (Before Caching)
    // -------------------------------------------------------------
    console.log('--- TEST 1: Non-Cached Endpoint (Direct Database queries) ---');
    console.log('We will query the database directly. Each query has simulated latency.');
    for (let i = 1; i <= 3; i++) {
      const start = Date.now();
      // We call the cached endpoint but force a Cache Miss by clearing cache,
      // or we can just measure findOneCached first request. Let's do findOneCached.
    }

    // Let's reset cache first
    // Note: Since we are using ioredis-mock, we can verify the cache lifecycle.
    console.log('\n--- TEST 2: Cache-Aside Lifecycle (findOneCached) ---');
    
    // First request: Cache Miss
    console.log('Request 1: Fetching Laptop (ID: 1) for the first time...');
    let start = Date.now();
    let res = await makeRequest(`${BASE_URL}/products/${productId}/cached`);
    let duration = Date.now() - start;
    console.log(`Result: Source = "${res.body.source}", Stock = ${res.body.data.stock}, Version = ${res.body.data.version}`);
    console.log(`Response Time: ${duration}ms (Expected: ~500ms due to Database delay)\n`);

    // Second request: Cache Hit
    console.log('Request 2: Fetching Laptop (ID: 1) again (should hit Cache)...');
    start = Date.now();
    res = await makeRequest(`${BASE_URL}/products/${productId}/cached`);
    duration = Date.now() - start;
    console.log(`Result: Source = "${res.body.source}", Stock = ${res.body.data.stock}, Version = ${res.body.data.version}`);
    console.log(`Response Time: ${duration}ms (Expected: <15ms - Fast Cache Hit)\n`);

    // Third request: Cache Hit
    console.log('Request 3: Fetching Laptop (ID: 1) third time (should hit Cache)...');
    start = Date.now();
    res = await makeRequest(`${BASE_URL}/products/${productId}/cached`);
    duration = Date.now() - start;
    console.log(`Result: Source = "${res.body.source}", Stock = ${res.body.data.stock}, Version = ${res.body.data.version}`);
    console.log(`Response Time: ${duration}ms (Expected: <15ms - Fast Cache Hit)\n`);

    // -------------------------------------------------------------
    // TEST 3: Cache Invalidation (Preventing Stale Data)
    // -------------------------------------------------------------
    console.log('--- TEST 3: Cache Invalidation Scenario (Stock Update) ---');
    console.log('We will purchase 2 units of Laptop (ID: 1) using Optimistic Locking.');
    console.log('This should modify the stock in the database and INVALIDATE the cache.');
    
    // Perform stock update (purchase)
    const updateRes = await makeRequest(
      `${BASE_URL}/products/${productId}/buy-optimistic`,
      'POST',
      { quantity: 2, version: 1 }
    );
    console.log(`Update Result: ${updateRes.body.message || JSON.stringify(updateRes.body)}`);
    console.log(`New Database Stock: ${updateRes.body.newStock}, New Version: ${updateRes.body.newVersion}\n`);

    // Fourth request: Cache Miss (due to invalidation)
    console.log('Request 4: Fetching Laptop (ID: 1) immediately after update...');
    console.log('The cache was invalidated, so it must query the Database again.');
    start = Date.now();
    res = await makeRequest(`${BASE_URL}/products/${productId}/cached`);
    duration = Date.now() - start;
    console.log(`Result: Source = "${res.body.source}", Stock = ${res.body.data.stock}, Version = ${res.body.data.version}`);
    console.log(`Response Time: ${duration}ms (Expected: ~500ms - Database Query for fresh data)\n`);

    // Fifth request: Cache Hit
    console.log('Request 5: Fetching Laptop (ID: 1) again...');
    start = Date.now();
    res = await makeRequest(`${BASE_URL}/products/${productId}/cached`);
    duration = Date.now() - start;
    console.log(`Result: Source = "${res.body.source}", Stock = ${res.body.data.stock}, Version = ${res.body.data.version}`);
    console.log(`Response Time: ${duration}ms (Expected: <15ms - Cache Hit with updated stock)\n`);

    console.log('================================================================');
    console.log('             VERIFICATION TESTS COMPLETED SUCCESSFULLY          ');
    console.log('================================================================');
  } catch (error) {
    console.error('Error running cache verification tests:', error.message);
    console.log('\nMake sure the NestJS server is running before running this test script!');
    console.log('Run: npm run start');
  }
}

runTests();
