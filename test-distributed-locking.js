const { spawn } = require('child_process');

const ports = [8000, 8001];
const servers = ports.map((p) => `http://localhost:${p}`);

// Sleep function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
  console.log('\n================================================================================');
  console.log('🚀 TESTING DISTRIBUTED LOCKING ACROSS MULTIPLE INSTANCES (Ports 8000 & 8001)');
  console.log('================================================================================\n');

  console.log('Starting NestJS server instances...');
  const fs = require('fs');
  const processes = [];
  for (const port of ports) {
    const outLog = fs.createWriteStream(`./server${port}.log`);
    const p = spawn('node', ['dist/main.js'], {
      env: { ...process.env, PORT: port.toString() },
      shell: true,
    });
    p.stdout.pipe(outLog);
    p.stderr.pipe(outLog);
    
    processes.push(p);
  }

  // Wait for servers to start
  console.log('Waiting 10 seconds for servers to initialize...');
  await sleep(10000);

  // Reset database state on both instances
  console.log('Resetting database states...');
  await Promise.all(servers.map(url => fetch(`${url}/reset`, { method: 'POST' })));

  console.log('\nScenario: Both instances try to buy Product 3 (Stock = 1) using Pessimistic Locking.');
  console.log('Server 1 receives Req #1 first. Server 2 receives Req #2 50ms later.');
  console.log('Due to the Distributed Lock, Req #2 on Server 2 MUST block and wait until Req #1 finishes.\n');

  const startTimes = {};
  const endTimes = {};
  const responses = [];

  // Send Request 1 to port 8000
  const req1Promise = (async () => {
    const start = Date.now();
    startTimes['req1'] = start;
    console.log(`[0ms] Sent Req #1 to Server 1 (Port 8000)`);
    try {
      const res = await fetch(`${servers[0]}/products/3/buy-pessimistic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 })
      });
      const data = await res.json();
      endTimes['req1'] = Date.now();
      responses.push({ req: 'req1', status: res.status, data, elapsed: endTimes['req1'] - start });
    } catch (err) {
      console.error(`Req #1 failed: ${err.message}`);
    }
  })();

  // Wait 50ms before sending Request 2 to port 8001
  await sleep(50);

  // Send Request 2 to port 8001
  const req2Promise = (async () => {
    const start = Date.now();
    startTimes['req2'] = start;
    console.log(`[50ms] Sent Req #2 to Server 2 (Port 8001)`);
    try {
      const res = await fetch(`${servers[1]}/products/3/buy-pessimistic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 })
      });
      const data = await res.json();
      endTimes['req2'] = Date.now();
      responses.push({ req: 'req2', status: res.status, data, elapsed: endTimes['req2'] - start });
    } catch (err) {
      console.error(`Req #2 failed: ${err.message}`);
    }
  })();

  // Wait for both to finish
  await Promise.all([req1Promise, req2Promise]);

  console.log('\n📊 Results:');
  responses.forEach(r => {
    console.log(`   - ${r.req === 'req1' ? 'Req #1 (Port 8000)' : 'Req #2 (Port 8001)'}: HTTP ${r.status} - Time: ${r.elapsed}ms - Response:`, r.data.message || r.data.message || r.data);
  });

  const req1Result = responses.find(r => r.req === 'req1');
  const req2Result = responses.find(r => r.req === 'req2');

  console.log('\n--- Analysis ---');
  if (req1Result && req2Result) {
    console.log(`Req #1 Elapsed Time: ${req1Result.elapsed}ms (Expected: ~300ms)`);
    console.log(`Req #2 Elapsed Time: ${req2Result.elapsed}ms (Expected: ~550ms due to waiting)`);

    const expectedDelayDifference = 200; // should be at least 200ms extra delay
    const actualDifference = req2Result.elapsed - (req1Result.elapsed - 50);

    console.log(`Actual extra delay for Req #2: ${actualDifference.toFixed(0)}ms`);

    // Since both instances share the same file-backed database (shared_db_products.json),
    // Req 1 (Port 8000) will succeed (HTTP 201) and consume the single stock item.
    // Req 2 (Port 8001) will block, wait, and then fail with HTTP 400 (Insufficient stock)
    // because the stock is now 0.
    if (req1Result.status === 201 && req2Result.status === 400) {
      console.log('✅ SUCCESS: Request 1 succeeded (HTTP 201) and consumed the stock.');
      if (req2Result.elapsed >= 500) {
        console.log('✅ SUCCESS: Request 2 was blocked until Request 1 released the distributed lock! (Time: ' + req2Result.elapsed + 'ms)');
        console.log('✅ SUCCESS: Request 2 correctly failed with HTTP 400 due to Insufficient stock.');
      } else {
        console.log('❌ FAILURE: Request 2 did not block for the distributed lock.');
      }
    } else {
      console.log('❌ FAILURE: Unexpected HTTP status codes returned (Expected Req 1: 201, Req 2: 400).');
    }
  }

  console.log('\nShutting down servers...');
  for (const p of processes) {
    p.kill('SIGINT');
  }

  console.log('Test finished.\n');
  process.exit(0);
}

runTest();
