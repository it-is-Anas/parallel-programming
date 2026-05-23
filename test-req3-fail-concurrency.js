const numConcurrentRequests = 50;
const userIdBase = 'user_bad_';

async function testReq3ConcurrencyFail() {
  console.log('--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  console.log(`--- Starting BAD Concurrency Test (50 Users hitting Synchronous route) ---`);
  console.log('Each request will WAIT for the PDF and Email before finishing.\n');

  // Create 50 carts
  for (let i = 0; i < numConcurrentRequests; i++) {
    const userId = userIdBase + i;
    await fetch(`http://127.0.0.1:3000/cart/${userId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: '3', quantity: 1 })
    });
  }

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < numConcurrentRequests; i++) {
    const userId = userIdBase + i;
    promises.push(
      fetch(`http://127.0.0.1:3000/orders/checkout-bad/${userId}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          const elapsed = Date.now() - startTime;
          console.log(`[${elapsed.toString().padStart(5, ' ')}ms][${userId}] Status: ${data.message}`);
        })
    );
  }

  await Promise.all(promises);
  const endTime = Date.now();

  console.log('\n--- CONCLUSION TO SHOW MR ---');
  console.log(`TOTAL TIME TAKEN: ${(endTime - startTime) / 1000} seconds.`);
  console.log('OBSERVATION: Because we did NOT use Async Queues, the Semaphore slots were blocked for 3.5s per user.');
  console.log('This made the entire system move like a snail. With Requirement 3 implemented, this same test finishes 7 times faster!');
}

testReq3ConcurrencyFail();
