import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RedisService } from '../db/redis.service';
import * as fs from 'fs';
import * as path from 'path';
import { Mutex, Semaphore } from 'async-mutex';

@Injectable()
export class ConcurrencyService implements OnModuleInit {
  private readonly logger = new Logger(ConcurrencyService.name);

  // Semaphore to limit concurrent checkout operations (Capacity Control - remains process-local)
  public readonly checkoutSemaphore = new Semaphore(2);

  private readonly locksDir = path.join(process.cwd(), 'distributed_locks');
  private readonly ownerId = `${process.pid}_${Math.random().toString(36).substring(2, 9)}`;
  private isRedisReal = false;

  // Local mutexes to serialize requests per instance before hitting the distributed lock
  private readonly localMutexes: Map<string, Mutex> = new Map();

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    this.logger.log('Initializing Distributed Concurrency Service...');
    
    // Check if the redis client is a real Redis instance or a mock
    const redisClient = (this.redisService as any).client;
    if (redisClient) {
      const constructorName = redisClient.constructor.name;
      if (!constructorName.toLowerCase().includes('mock')) {
        this.isRedisReal = true;
        this.logger.log('Detected real Redis server. Distributed locks will use Redis.');
      } else {
        this.logger.log(
          'Detected ioredis-mock. Distributed locks will use filesystem fallback for multi-instance support.'
        );
      }
    } else {
      this.logger.log('No Redis client detected. Distributed locks will use filesystem.');
    }

    // Ensure locks directory exists and is clean on startup
    try {
      if (fs.existsSync(this.locksDir)) {
        fs.rmSync(this.locksDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.locksDir, { recursive: true });
      this.logger.log(`Initialized locks directory at: ${this.locksDir}`);
    } catch (err) {
      this.logger.error(`Failed to initialize locks directory: ${err.message}`);
    }
  }

  private getLocalMutex(lockKey: string): Mutex {
    if (!this.localMutexes.has(lockKey)) {
      this.localMutexes.set(lockKey, new Mutex());
    }
    return this.localMutexes.get(lockKey)!;
  }

  /**
   * Acquire a distributed lock for a given key.
   * Returns a release function that must be called to release the lock.
   */
  async acquireLock(
    lockKey: string,
    ttlMs = 15000,
    timeoutMs = 60000,
    retryIntervalMs = 50,
  ): Promise<() => Promise<void>> {
    // 1. Serialize requests locally within this process first to prevent I/O storm / threadpool saturation
    const localMutex = this.getLocalMutex(lockKey);
    const releaseLocal = await localMutex.acquire();

    // 2. Once we hold the local lock, acquire the distributed lock
    try {
      const startTime = Date.now();
      const lockName = `lock:${lockKey}`;
      const safeFileKey = lockKey.replace(/[^a-zA-Z0-9_-]/g, '_');

      while (Date.now() - startTime < timeoutMs) {
        let acquired = false;

        if (this.isRedisReal) {
          acquired = await this.acquireRedisLock(lockName, this.ownerId, ttlMs);
        } else {
          acquired = await this.acquireFileLock(safeFileKey, this.ownerId, ttlMs);
        }

        if (acquired) {
          return async () => {
            try {
              if (this.isRedisReal) {
                await this.releaseRedisLock(lockName, this.ownerId);
              } else {
                await this.releaseFileLock(safeFileKey, this.ownerId);
              }
            } finally {
              // Always release the local mutex
              releaseLocal();
            }
          };
        }

        // Spin lock / wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
      }

      throw new Error(`Timeout acquiring distributed lock for key: ${lockKey}`);
    } catch (err) {
      releaseLocal();
      throw err;
    }
  }

  /**
   * Returns a Mutex-like object for compatibility with existing code.
   */
  getProductMutex(productId: string) {
    return {
      acquire: async (): Promise<() => Promise<void>> => {
        return await this.acquireLock(`product:${productId}`, 15000, 60000);
      },
      runExclusive: async <T>(callback: () => Promise<T>): Promise<T> => {
        const release = await this.acquireLock(`product:${productId}`, 15000, 60000);
        try {
          return await callback();
        } finally {
          await release();
        }
      },
    };
  }

  // --- Redis Lock implementation ---
  private async acquireRedisLock(lockName: string, owner: string, ttlMs: number): Promise<boolean> {
    try {
      const redisClient = (this.redisService as any).client;
      // SET lockName owner PX ttlMs NX
      const result = await redisClient.set(lockName, owner, 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.error(`Redis lock acquisition error: ${err.message}`);
      return false;
    }
  }

  private async releaseRedisLock(lockName: string, owner: string): Promise<void> {
    try {
      const redisClient = (this.redisService as any).client;
      // Atomically check owner and delete lock
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redisClient.eval(luaScript, 1, lockName, owner);
    } catch (err) {
      this.logger.error(`Redis lock release error: ${err.message}`);
    }
  }

  // --- Filesystem Lock implementation (Optimized to file instead of directory) ---
  private async acquireFileLock(safeLockKey: string, owner: string, ttlMs: number): Promise<boolean> {
    const lockPath = path.join(this.locksDir, `${safeLockKey}.lock`);

    try {
      const info = {
        owner,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };
      
      // Write file with wx (exclusive creation) flag - atomic at OS level
      await fs.promises.writeFile(lockPath, JSON.stringify(info), { flag: 'wx', encoding: 'utf8' });
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock exists, check if it has expired
        try {
          const infoData = await fs.promises.readFile(lockPath, 'utf8');
          const info = JSON.parse(infoData);

          if (Date.now() > info.expiresAt) {
            this.logger.warn(`Distributed file lock for ${safeLockKey} expired. Cleaning up...`);
            await fs.promises.unlink(lockPath);
          }
        } catch (readErr) {
          // If we fail to read (e.g. file is deleted or being rewritten), just retry next time
        }
        return false;
      }
      this.logger.error(`Filesystem lock acquisition error for ${safeLockKey}: ${err.message}`);
      return false;
    }
  }

  private async releaseFileLock(safeLockKey: string, owner: string): Promise<void> {
    const lockPath = path.join(this.locksDir, `${safeLockKey}.lock`);

    try {
      if (fs.existsSync(lockPath)) {
        const infoData = await fs.promises.readFile(lockPath, 'utf8');
        const info = JSON.parse(infoData);

        if (info.owner === owner) {
          await fs.promises.unlink(lockPath);
        }
      }
    } catch (err) {
      this.logger.error(`Filesystem lock release error for ${safeLockKey}: ${err.message}`);
    }
  }
}
