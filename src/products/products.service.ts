import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ConcurrencyService } from '../concurrency/concurrency.service';
import { RedisService } from '../db/redis.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly db: DbService,
    private readonly concurrencyService: ConcurrencyService,
    private readonly redis: RedisService,
  ) {}

  findAll() {
    return Array.from(this.db.products.values());
  }

  findOne(id: string) {
    return this.db.products.get(id);
  }

  // Cache-Aside Pattern
  async findOneCached(id: string) {
    const cacheKey = `product:${id}`;
    
    // 1. Try to get from Redis
    const cachedData = await this.redis.get(cacheKey);
    if (cachedData) {
      return {
        source: 'Cache (Redis)',
        data: JSON.parse(cachedData),
      };
    }

    // 2. Cache Miss: Get from DB (Simulated delay of 500ms)
    const product = await this.db.findProductWithDelay(id);
    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // 3. Save to Redis Cache (60 seconds TTL)
    await this.redis.set(cacheKey, JSON.stringify(product), 60);

    return {
      source: 'Database',
      data: product,
    };
  }

  // 1. القفل المتفائل (Optimistic Locking)
  async updateStockOptimistic(productId: string, quantity: number, clientVersion: number) {
    const product = this.db.products.get(productId);
    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // محاكاة تأخير بسيط لجعل التعارض يظهر بوضوح تحت الضغط المتوازي
    await new Promise((resolve) => setTimeout(resolve, 300));

    // التحقق من الإصدار (Version check)
    if (product.version !== clientVersion) {
      throw new ConflictException(
        `Optimistic lock failed: Version mismatch! Product ID ${productId} has version ${product.version}, but client submitted version ${clientVersion}.`
      );
    }

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock for product ${productId}`);
    }

    // تحديث المخزون وزيادة رقم الإصدار
    product.stock -= quantity;
    product.version += 1;

    // Cache Invalidation: Invalidate product cache upon update to prevent stale data (Scenario 2)
    const cacheKey = `product:${productId}`;
    await this.redis.del(cacheKey);

    return {
      message: 'Stock updated successfully using Optimistic Locking',
      newStock: product.stock,
      newVersion: product.version,
    };
  }

  // 2. القفل التشاؤمي (Pessimistic Locking)
  async updateStockPessimistic(productId: string, quantity: number) {
    const mutex = this.concurrencyService.getProductMutex(productId);
    
    // حجز القفل بشكل تشاؤمي (يمنع أي خيوط أو مستطلبات أخرى من المضي قدماً)
    const release = await mutex.acquire();

    try {
      const product = this.db.products.get(productId);
      if (!product) {
        throw new BadRequestException('Product not found');
      }

      // محاكاة معالجة أو دفع
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (product.stock < quantity) {
        throw new BadRequestException(`Insufficient stock for product ${productId}`);
      }

      product.stock -= quantity;
      product.version += 1;

      // Cache Invalidation: Invalidate product cache upon update to prevent stale data (Scenario 2)
      const cacheKey = `product:${productId}`;
      await this.redis.del(cacheKey);

      return {
        message: 'Stock updated successfully using Pessimistic Locking',
        newStock: product.stock,
        newVersion: product.version,
      };
    } finally {
      // تحرير القفل
      release();
    }
  }
}
