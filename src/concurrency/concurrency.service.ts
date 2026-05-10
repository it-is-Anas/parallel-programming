import { Injectable } from '@nestjs/common';
import { Mutex, Semaphore } from 'async-mutex';

@Injectable()
export class ConcurrencyService {
  private readonly productMutexes: Map<string, Mutex> = new Map();

  // Semaphore to limit concurrent checkout operations (Capacity Control)
  public readonly checkoutSemaphore = new Semaphore(2);

  getProductMutex(productId: string): Mutex {
    if (!this.productMutexes.has(productId)) {
      this.productMutexes.set(productId, new Mutex());
    }
    return this.productMutexes.get(productId)!;
  }
}
