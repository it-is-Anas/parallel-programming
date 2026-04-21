import { Injectable } from '@nestjs/common';
import { Mutex, Semaphore } from 'async-mutex';

export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
}

@Injectable()
export class DbService {
  // In-memory data
  public products: Map<string, Product> = new Map([
    ['1', { id: '1', name: 'Laptop', stock: 10, price: 1000 }],
    ['2', { id: '2', name: 'Phone', stock: 5, price: 500 }],
    ['3', { id: '3', name: 'RaceConditionItem', stock: 1, price: 100 }], // Specifically for testing race conditions
  ]);

  public carts: Map<string, any[]> = new Map();

  // Mutex per product to prevent race conditions during checkout/stock updates
  public productMutexes: Map<string, Mutex> = new Map();

  // Semaphore to limit concurrent checkout operations (Capacity Control)
  // Let's limit it to 2 concurrent checkouts for demonstration
  public checkoutSemaphore = new Semaphore(2);

  constructor() {
    // Initialize mutexes for existing products
    for (const key of this.products.keys()) {
      this.productMutexes.set(key, new Mutex());
    }
  }

  getProductMutex(productId: string): Mutex {
    if (!this.productMutexes.has(productId)) {
      this.productMutexes.set(productId, new Mutex());
    }
    return this.productMutexes.get(productId)!;
  }

  reset() {
    this.products = new Map([
      ['1', { id: '1', name: 'Laptop', stock: 10, price: 1000 }],
      ['2', { id: '2', name: 'Phone', stock: 5, price: 500 }],
      ['3', { id: '3', name: 'RaceConditionItem', stock: 1, price: 100 }],
    ]);
    this.carts.clear();
    // No need to reset mutexes as they just guard access to IDs
  }
}
