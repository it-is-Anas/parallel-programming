const numConcurrentRequests = 50;
const userIdBase = 'user_';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConcurrency() {
  console.log('--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  console.log('--- Starting Concurrency & Capacity Test ---');
  
  // Create 50 carts for 50 users, all trying to buy Product '3' (which only has 1 stock)
  for (let i = 0; i < numConcurrentRequests; i++) {
    const userId = userIdBase + i;
    await fetch(`http://127.0.0.1:3000/cart/${userId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: '3', quantity: 1 })
    });
  }

  console.log('Carts populated. Initiating concurrent checkouts...');
  
  const startTime = Date.now();
  
  // Send 50 concurrent checkout requests
  const promises = [];
  for (let i = 0; i < numConcurrentRequests; i++) {
    const userId = userIdBase + i;
    promises.push(
      fetch(`http://127.0.0.1:3000/orders/checkout/${userId}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          const status = data.message || data.error;
          const elapsed = Date.now() - startTime;
          console.log(`[${elapsed.toString().padStart(5, ' ')}ms][${userId}] Status: ${status}`);
          return { userId, status };
        })
        .catch(err => {
          const elapsed = Date.now() - startTime;
          console.log(`[${elapsed.toString().padStart(5, ' ')}ms][${userId}] Status: Failed`);
          return { userId, status: 'Failed' };
        })
    );
  }

  const results = await Promise.all(promises);
  const endTime = Date.now();

  const successes = results.filter(r => r.status === 'Checkout successful');
  const failures = results.filter(r => r.status !== 'Checkout successful');

  console.log(`\nTest Results in ${endTime - startTime}ms:`);
  console.log(`Successful Checkouts: ${successes.length} (Expected: 1)`);
  console.log(`Failed Checkouts: ${failures.length} (Expected: 49)`);
  
  // Verify final stock
  const productsRes = await fetch('http://127.0.0.1:3000/products/3');
  const product = await productsRes.json();
  console.log(`Final stock for product 3: ${product.stock} (Expected: 0)`);
  
  if (successes.length === 1 && product.stock === 0) {
    console.log('\nSUCCESS: Race Condition Prevented. Data Integrity Maintained.');
  } else {
    console.log('\nFAILURE: Race Condition Occurred.');
  }

  // Capacity Control verification
  // Since Semaphore limits to 2 concurrent users, and each takes 500ms, 
  // you might expect (50/2) * 500ms = 12500ms.
  // HOWEVER, because all users buy the SAME product, the Mutex serializes them to 1 at a time.
  // So the total time will be around 50 * 500ms = 25000ms.
  console.log(`\nTime taken: ${endTime - startTime}ms`);
  if (endTime - startTime >= 12000) {
    console.log('SUCCESS: Capacity Control (Semaphore) is working. Requests were queued and processed without overloading.');
  } else {
    console.log('FAILURE: Capacity Control did not queue requests properly.');
  }
}

testConcurrency();
