# Verification & Solution Guide: Requests 5 to 10

This guide describes how to test each requirement from 5 to 10 and displays the core solution code for each.

---

## 5. Load Distribution (توزيع الأحمال)

### 🚀 How to Test
1. Build the production version of the application:
   ```bash
   npm run build
   ```
2. Run the load distribution test script:
   ```bash
   node test-load-balancer.js
   ```
   *Expected Output:* The test script automatically spawns three separate server instances on ports 8000, 8001, and 8002. It sends requests sequentially, showing they are handled in a Round Robin rotation across the ports, and then gracefully closes the instances.

### 📸 Solution Code
```javascript
// Server spawning and Round Robin request distribution logic
const ports = [8000, 8001, 8002];
const servers = ports.map((p) => `http://localhost:${p}/process`);

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

let currentIndex = 0;
for (let i = 1; i <= numTasks; i++) {
  const serverUrl = servers[currentIndex];
  currentIndex = (currentIndex + 1) % servers.length;
  const res = await fetch(serverUrl);
  const data = await res.json();
  console.log(`Task ${i} -> ${data.message}`);
}
```

---

## 6. Distributed Caching (التخزين المؤقت)

### 🚀 How to Test
1. Run the NestJS application server:
   ```bash
   npm run start:dev
   ```
2. In a separate terminal window, run the caching test script:
   ```bash
   node test-caching.js
   ```
   *Expected Output:* The first request misses the cache and fetches from the database (simulating a 500ms delay). The second and third requests hit the cache immediately (< 15ms). A subsequent stock update invalidates the cache, causing the next query to miss and query the DB again.

### 📸 Solution Code
```typescript
// Cache-Aside Pattern implementation
async findOneCached(id: string) {
  const cacheKey = `product:${id}`;
  
  // 1. Attempt to get data from Redis
  const cachedData = await this.redis.get(cacheKey);
  if (cachedData) {
    return {
      source: 'Cache (Redis)',
      data: JSON.parse(cachedData),
    };
  }

  // 2. Cache Miss: Query Database (500ms artificial delay)
  const product = await this.db.findProductWithDelay(id);
  if (!product) {
    throw new BadRequestException('Product not found');
  }

  // 3. Save result to cache (60 seconds TTL)
  await this.redis.set(cacheKey, JSON.stringify(product), 60);

  return {
    source: 'Database',
    data: product,
  };
}
```

---

## 7. Concurrency Control & Distributed Locking (التحكم في الأقفال)

### 🚀 How to Test
1. To run local locking verification (requires running server):
   ```bash
   node test-locking.js
   ```
2. To run multi-instance distributed locking verification:
   ```bash
   npm run build
   node test-distributed-locking.js
   ```
   *Expected Output (test-locking):* Optimistic buy requests fail with version conflicts (409). Pessimistic requests queue up and process sequentially.
   *Expected Output (test-distributed-locking):* Spawns two servers on ports 8000 and 8001 sharing a database. Request 2 on server 2 is successfully blocked and delayed until Request 1 finishes and releases the lock. Request 1 succeeds (HTTP 201), and Request 2 fails (HTTP 400 - Insufficient stock) because they share the same stock database.

### 📸 Solution Code
```typescript
// Custom filesystem-based distributed lock (used when Redis is in mock mode)
private async acquireFileLock(safeLockKey: string, owner: string, ttlMs: number): Promise<boolean> {
  const lockPath = path.join(this.locksDir, `${safeLockKey}.lock`);
  const infoPath = path.join(lockPath, 'info.json');

  try {
    // OS-level atomic folder creation
    await fs.promises.mkdir(lockPath);

    // Save lock ownership metadata
    const info = {
      owner,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    await fs.promises.writeFile(infoPath, JSON.stringify(info), 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock exists: clean up if it is expired
      try {
        const infoData = await fs.promises.readFile(infoPath, 'utf8');
        const info = JSON.parse(infoData);
        if (Date.now() > info.expiresAt) {
          await fs.promises.rm(lockPath, { recursive: true, force: true });
        }
      } catch (readErr) {}
      return false;
    }
    return false;
  }
}
```

---

## 8. Transaction Integrity / ACID (سلامة المعاملات)

### 🚀 How to Test
1. Run the NestJS application server:
   ```bash
   npm run start:dev
   ```
2. In a separate terminal window, run the ACID integrity test:
   ```bash
   node test-acid.js
   ```
   *Expected Output:*
   * **With ACID:** Shopper attempts a checkout, payment fails, and stock is rolled back to its original state (maintaining consistency).
   * **Without ACID:** Shopper checkout payment fails, but stock is deducted and NOT rolled back (creating inconsistent data).

### 📸 Solution Code
```typescript
// Snapshot taking and Rollback implementation in orders checkout transaction
async checkout(userId: string, simulatePaymentFailure = false) {
  const stockSnapshot = new Map<string, number>();

  try {
    // 1. Take snapshot of stock values before modifiying
    for (const item of sortedCart) {
      const release = await this.concurrencyService.acquireLock(`product:${item.productId}`);
      releases.push(release);

      const product = this.db.products.get(item.productId);
      if (product) {
        stockSnapshot.set(item.productId, product.stock);
      }
    }

    // 2. Perform payment processing
    if (simulatePaymentFailure) {
      throw new BadRequestException('Payment processing failed! Transaction rolled back.');
    }
  } catch (error) {
    // 3. Rollback: Restores previous stock states
    for (const [productId, oldStock] of stockSnapshot.entries()) {
      const product = this.db.products.get(productId);
      if (product) {
        product.stock = oldStock;
      }
    }
    throw error;
  }
}
```

---

## 9. Stress Testing (اختبار الاستقرار تحت الضغط)

### 🚀 How to Test
1. Run the NestJS application server:
   ```bash
   npm run start:dev
   ```
2. In a separate terminal window, run the stress test script:
   ```bash
   node stress-test.js
   ```
   *Expected Output:* Generates 100 synchronized requests from 100 shoppers concurrently using worker pools. Under pessimistic locking, all 100 requests queue up and succeed without crashes or database corruption. Under optimistic locking, only 1 succeeds and the other 99 are rejected safely.

### 📸 Solution Code
```javascript
// Synchronized Worker pool to process 100 concurrent requests
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
```

---

## 10. Measurement & Bottleneck Analysis (القياس وتحديد الاختناقات)

### 🚀 How to Test
1. Run the NestJS application server:
   ```bash
   npm run start:dev
   ```
2. In a separate terminal window, run the benchmark script:
   ```bash
   node test-benchmark.js
   ```
   *Expected Output:* Runs 200 concurrent requests. Compares response latency and requests-per-second (RPS) of the direct database queries vs. cached queries, calculating and printing the exact performance gain factor.

### 📸 Solution Code
```javascript
// Promise-based simultaneous request benchmark execution
async function runBenchmark(testName, url) {
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(makeRequest(url));
  }

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;
  
  const avgDuration = (totalDuration / CONCURRENCY).toFixed(2);
  const rps = ((successCount / totalTime) * 1000).toFixed(2);
  
  return { rps, avgDuration, totalTime };
}
```
