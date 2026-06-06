import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.logger.log('Initializing Redis Service...');
    
    // We are using ioredis-mock for local simulation without a running Redis server.
    // If you want to use a real Redis server, replace the line below with:
    // this.client = new Redis({ host: 'localhost', port: 6379 });
    
    try {
      const RedisMock = require('ioredis-mock');
      this.client = new RedisMock();
      this.logger.log('Redis Service initialized with ioredis-mock successfully (In-Memory Simulation).');
    } catch (error) {
      this.logger.error('Failed to load ioredis-mock. Falling back to real ioredis client (requires running Redis server).');
      this.client = new Redis({ host: 'localhost', port: 6379 });
    }
  }

  async get(key: string): Promise<string | null> {
    this.logger.log(`Redis GET: ${key}`);
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<string> {
    this.logger.log(`Redis SET: ${key} (TTL: ${ttlSeconds || 'None'}s)`);
    if (ttlSeconds) {
      return await this.client.set(key, value, 'EX', ttlSeconds);
    }
    return await this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    this.logger.log(`Redis DEL: ${key}`);
    return await this.client.del(key);
  }

  async flushall(): Promise<string> {
    this.logger.log('Redis FLUSHALL (Clearing cache)');
    return await this.client.flushall();
  }

  onModuleDestroy() {
    this.client.disconnect();
    this.logger.log('Redis connection closed.');
  }
}
