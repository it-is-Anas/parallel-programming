import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ConcurrencyService } from '../concurrency/concurrency.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly db: DbService,
    private readonly concurrencyService: ConcurrencyService,
  ) {}

  findAll() {
    return Array.from(this.db.products.values());
  }

  findOne(id: string) {
    return this.db.products.get(id);
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
