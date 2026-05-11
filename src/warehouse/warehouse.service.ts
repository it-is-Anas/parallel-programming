import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ConcurrencyService } from '../concurrency/concurrency.service';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly db: DbService,
    private readonly concurrencyService: ConcurrencyService,
  ) {}

  async updateStock(productId: string, newStock: number) {
    const product = this.db.products.get(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // 1. Data Integrity & Concurrent Access
    // Acquire mutex to ensure warehouse update doesn't conflict with active checkouts
    const mutex = this.concurrencyService.getProductMutex(productId);
    return await mutex.runExclusive(async () => {
      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 300));
      product.stock = newStock;
      return { message: 'Stock updated', product };
    });
  }
}
