const fs = require('fs');
const path = require('path');

// Simulate ConcurrencyService local behavior
class MockRedisService {
  client = {
    constructor: { name: 'RedisMock' } // Simulates ioredis-mock
  };
}

class ConcurrencyService {
  constructor(redisService) {
    this.redisService = redisService;
    this.locksDir = path.join(process.cwd(), 'distributed_locks');
    this.isRedisReal = false;
  }

  init(ownerId) {
    this.ownerId = ownerId;
    if (!fs.existsSync(this.locksDir)) {
      fs.mkdirSync(this.locksDir, { recursive: true });
    }
  }

  async acquireLock(lockKey, ttlMs = 15000, timeoutMs = 20000, retryIntervalMs = 50) {
    const startTime = Date.now();
    const safeFileKey = lockKey.replace(/[^a-zA-Z0-9_-]/g, '_');

    while (Date.now() - startTime < timeoutMs) {
      let acquired = false;
      acquired = await this.acquireFileLock(safeFileKey, this.ownerId, ttlMs);

      if (acquired) {
        return async () => {
          await this.releaseFileLock(safeFileKey, this.ownerId);
        };
      }
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }
    throw new Error(`Timeout acquiring distributed lock for key: ${lockKey}`);
  }

  async acquireFileLock(safeLockKey, owner, ttlMs) {
    const lockPath = path.join(this.locksDir, `${safeLockKey}.lock`);
    const infoPath = path.join(lockPath, 'info.json');

    try {
      await fs.promises.mkdir(lockPath);
      const info = {
        owner,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };
      await fs.promises.writeFile(infoPath, JSON.stringify(info), 'utf8');
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const infoData = await fs.promises.readFile(infoPath, 'utf8');
          const info = JSON.parse(infoData);
          if (Date.now() > info.expiresAt) {
            console.log(`Lock ${safeLockKey} expired. Cleaning up...`);
            await fs.promises.rm(lockPath, { recursive: true, force: true });
          }
        } catch (readErr) {
          // Ignore read errors due to race condition
        }
        return false;
      }
      console.error(`Lock error for ${safeLockKey}:`, err.message);
      return false;
    }
  }

  async releaseFileLock(safeLockKey, owner) {
    const lockPath = path.join(this.locksDir, `${safeLockKey}.lock`);
    const infoPath = path.join(lockPath, 'info.json');

    try {
      if (fs.existsSync(infoPath)) {
        const infoData = await fs.promises.readFile(infoPath, 'utf8');
        const info = JSON.parse(infoData);
        if (info.owner === owner) {
          await fs.promises.rm(lockPath, { recursive: true, force: true });
          console.log(`Lock ${safeLockKey} released by owner ${owner}`);
        }
      }
    } catch (err) {
      console.error('Release error:', err.message);
    }
  }
}

async function runTest() {
  // Clear old locks directory
  const locksDir = path.join(process.cwd(), 'distributed_locks');
  if (fs.existsSync(locksDir)) {
    fs.rmSync(locksDir, { recursive: true, force: true });
  }

  const redis = new MockRedisService();
  
  const instance1 = new ConcurrencyService(redis);
  instance1.init('owner_1');

  const instance2 = new ConcurrencyService(redis);
  instance2.init('owner_2');

  console.log('Instance 1 acquiring lock for product_3...');
  const release1 = await instance1.acquireLock('product:3');
  console.log('Instance 1 successfully acquired lock!');

  console.log('Instance 2 trying to acquire lock for product_3 (should wait)...');
  const start = Date.now();
  
  // Set a timeout to release the lock in 1 second
  setTimeout(async () => {
    console.log('Instance 1 releasing lock after 1000ms...');
    await release1();
  }, 1000);

  const release2 = await instance2.acquireLock('product:3');
  const elapsed = Date.now() - start;
  console.log(`Instance 2 successfully acquired lock after ${elapsed}ms!`);

  if (elapsed >= 950) {
    console.log('✅ SUCCESS: Lock blocked instance 2 successfully until released!');
  } else {
    console.log('❌ FAILURE: Lock did not block instance 2!');
  }

  await release2();
}

runTest();
