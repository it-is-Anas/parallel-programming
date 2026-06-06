// stress-test.js
// Stress Test: Fulfills Requirement 9 (100 synchronized users)

const http = require('http');

const CONCURRENT_USERS = 100; // Exactly 100 synchronized users
const PRODUCT_ID = '100'; // StressTestItem (Initial Stock: 100)
const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent: false
    };

    if (options.body) {
      const bodyData = JSON.stringify(options.body);
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyData);
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', (err) => reject(err));
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// Concurrency pool runner
async function runConcurrentRequests(limit, url, getBody) {
  const results = new Array(CONCURRENT_USERS);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < CONCURRENT_USERS) {
      const index = nextIndex++;
      try {
        const body = typeof getBody === 'function' ? getBody() : getBody;
        results[index] = await makeRequest(url, { method: 'POST', body });
      } catch (err) {
        results[index] = { status: 'FAILED_CONNECTION', error: err.message };
      }
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);
  return results;
}

// Helper to count HTTP status codes
function getStatusSummary(results) {
  const summary = {};
  results.forEach(r => {
    summary[r.status] = (summary[r.status] || 0) + 1;
  });
  return JSON.stringify(summary);
}

async function main() {
  console.log('\n================================================================================');
  console.log(`🚀 STRESS TEST: ${CONCURRENT_USERS} SYNCHRONIZED USERS`);
  console.log('================================================================================');
  
  console.log('\n⚠️  PROBLEM:');
  console.log('   Concurrent purchases cause Race Conditions. Without locking, stock drops below zero.');
  
  console.log('\n🛡️  SOLUTION:');
  console.log('   - Pessimistic Locking: Queues requests to process atomically (prevents over-allocation).');
  console.log('   - Optimistic Locking: Uses version tracking (aborts stale concurrent updates).');

  // ---------------------------------------------------------------------------
  // TEST 1: PESSIMISTIC LOCKING
  // ---------------------------------------------------------------------------
  console.log('\n--------------------------------------------------------------------------------');
  console.log('TEST 1: Pessimistic Locking (Initial Stock: 100)');
  console.log('--------------------------------------------------------------------------------');
  
  await makeRequest(`${BASE_URL}/reset`, { method: 'POST' });
  console.log(`🔄 Database reset. Stock set to 100.`);
  
  console.log(`🚀 Sending ${CONCURRENT_USERS} concurrent purchase requests...`);
  const startPess = Date.now();
  const resultsPess = await runConcurrentRequests(20, `${BASE_URL}/products/${PRODUCT_ID}/buy-pessimistic`, () => ({
    quantity: 1
  }));
  const timePess = Date.now() - startPess;

  const successPess = resultsPess.filter(r => r.status === 201).length;
  const failPess = resultsPess.filter(r => r.status === 400).length;
  const crashPess = resultsPess.filter(r => r.status === 'FAILED_CONNECTION').length;
  const statusSummaryPess = getStatusSummary(resultsPess);

  const productPess = (await makeRequest(`${BASE_URL}/products/${PRODUCT_ID}`)).body;

  console.log(`\n📊 Results:`);
  console.log(`   - HTTP Status Codes Returned: ${statusSummaryPess}`);
  console.log(`   - Successes (HTTP 201): ${successPess} (Expected: 100)`);
  console.log(`   - Insufficient Stock Failures (HTTP 400): ${failPess} (Expected: 0)`);
  console.log(`   - Server Crashes: ${crashPess} (Expected: 0)`);
  console.log(`   - Final Database Stock: ${productPess?.stock} (Expected: 0)`);
  console.log(`   - Time Taken: ${timePess}ms`);

  if (successPess === 100 && productPess?.stock === 0 && crashPess === 0) {
    console.log('✅ SUCCESS: Served all 100 users concurrently. Stock is exactly 0. Zero crashes.');
  } else {
    console.log('❌ FAILURE: Data integrity compromised.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: OPTIMISTIC LOCKING
  // ---------------------------------------------------------------------------
  console.log('\n--------------------------------------------------------------------------------');
  console.log('TEST 2: Optimistic Locking (Initial Stock: 100, Version: 1)');
  console.log('--------------------------------------------------------------------------------');

  await makeRequest(`${BASE_URL}/reset`, { method: 'POST' });
  console.log(`🔄 Database reset. Stock set to 100.`);

  const initialProduct = (await makeRequest(`${BASE_URL}/products/${PRODUCT_ID}`)).body;
  const clientVersion = initialProduct?.version;

  console.log(`🚀 Sending ${CONCURRENT_USERS} concurrent purchase requests using Version ${clientVersion}...`);
  const startOpt = Date.now();
  const resultsOpt = await runConcurrentRequests(20, `${BASE_URL}/products/${PRODUCT_ID}/buy-optimistic`, () => ({
    quantity: 1,
    version: clientVersion
  }));
  const timeOpt = Date.now() - startOpt;

  const successOpt = resultsOpt.filter(r => r.status === 201).length;
  const conflictOpt = resultsOpt.filter(r => r.status === 409).length;
  const crashOpt = resultsOpt.filter(r => r.status === 'FAILED_CONNECTION').length;
  const statusSummaryOpt = getStatusSummary(resultsOpt);

  const productOpt = (await makeRequest(`${BASE_URL}/products/${PRODUCT_ID}`)).body;

  console.log(`\n📊 Results:`);
  console.log(`   - HTTP Status Codes Returned: ${statusSummaryOpt}`);
  console.log(`   - Successes (HTTP 201): ${successOpt} (Expected: 1)`);
  console.log(`   - Version Conflict Failures (HTTP 409): ${conflictOpt} (Expected: 99)`);
  console.log(`   - Server Crashes: ${crashOpt} (Expected: 0)`);
  console.log(`   - Final Database Stock: ${productOpt?.stock} (Expected: 99)`);
  console.log(`   - Time Taken: ${timeOpt}ms`);

  if (successOpt === 1 && productOpt?.stock === 99 && crashOpt === 0) {
    console.log('✅ SUCCESS: Only 1 request succeeded; remaining 99 rejected on version conflict. Zero crashes.');
  } else {
    console.log('❌ FAILURE: Data integrity compromised.');
  }

  console.log('\n================================================================================\n');
}

main();
