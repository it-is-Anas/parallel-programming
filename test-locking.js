async function testLocking() {
  // ==============================================================================
  // 1. اختبار القفل المتفائل (Optimistic Locking)
  // ==============================================================================
  console.log('--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  // جلب المنتج لمعرفة الإصدار الحالي (سيكون 1)
  console.log('Fetching product 3 to get its current version...');
  const prodRes = await fetch('http://127.0.0.1:3000/products/3');
  const product = await prodRes.json();
  const currentVersion = product.version;
  console.log(`Product 3: Stock = ${product.stock}, Version = ${currentVersion}\n`);

  console.log('--- 1. Testing OPTIMISTIC LOCKING Concurrency ---');
  console.log('Sending 5 concurrent requests all using Version 1...');

  const optPromises = [];
  const startTimeOpt = Date.now();

  for (let i = 1; i <= 5; i++) {
    optPromises.push(
      fetch('http://127.0.0.1:3000/products/3/buy-optimistic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1, version: currentVersion })
      })
        .then(res => res.json().then(data => ({ status: res.status, data })))
        .then(({ status, data }) => {
          const elapsed = Date.now() - startTimeOpt;
          console.log(`[${elapsed.toString().padStart(4, ' ')}ms][Req #${i}] HTTP ${status}:`, data.message || data.error || data);
        })
    );
  }

  await Promise.all(optPromises);

  // معاينة النتيجة النهائية للمنتج
  const prodResAfterOpt = await fetch('http://127.0.0.1:3000/products/3');
  const productAfterOpt = await prodResAfterOpt.json();
  console.log(`\nFinal state for product 3 after Optimistic test: Stock = ${productAfterOpt.stock}, Version = ${productAfterOpt.version}`);
  console.log('Observation: Only 1 request succeeded. The other 4 failed with 409 Conflict because of version mismatch. This is Optimistic Locking!');

  // ==============================================================================
  // 2. اختبار القفل التشاؤمي (Pessimistic Locking)
  // ==============================================================================
  console.log('\n--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  console.log('\n--- 2. Testing PESSIMISTIC LOCKING Concurrency ---');
  console.log('Sending 5 concurrent requests to buy product 3 (Stock = 1)...');

  const pesPromises = [];
  const startTimePes = Date.now();

  for (let i = 1; i <= 5; i++) {
    pesPromises.push(
      fetch('http://127.0.0.1:3000/products/3/buy-pessimistic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 })
      })
        .then(res => res.json().then(data => ({ status: res.status, data })))
        .then(({ status, data }) => {
          const elapsed = Date.now() - startTimePes;
          console.log(`[${elapsed.toString().padStart(4, ' ')}ms][Req #${i}] HTTP ${status}:`, data.message || data.error || data);
        })
    );
  }

  await Promise.all(pesPromises);

  // معاينة النتيجة النهائية للمنتج
  const prodResAfterPes = await fetch('http://127.0.0.1:3000/products/3');
  const productAfterPes = await prodResAfterPes.json();
  console.log(`\nFinal state for product 3 after Pessimistic test: Stock = ${productAfterPes.stock}, Version = ${productAfterPes.version}`);
  console.log('Observation: The requests were queued and processed in order. The first succeeded, and the rest failed with 400 Bad Request (Insufficient stock) rather than version mismatch conflicts because of serialization. This is Pessimistic Locking!');
}

testLocking();
