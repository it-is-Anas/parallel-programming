import { Injectable } from '@nestjs/common';

export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  version: number; // For optimistic locking
}

@Injectable()
export class DbService {
  // In-memory data
  public products: Map<string, Product> = new Map([
    ['1', { id: '1', name: 'Laptop', stock: 10, price: 1000, version: 1 }],
    ['2', { id: '2', name: 'Phone', stock: 5, price: 500, version: 1 }],
    ['3', { id: '3', name: 'RaceConditionItem', stock: 1, price: 100, version: 1 }], // Specifically for testing race conditions
  ]);

  public carts: Map<string, any[]> = new Map();

  constructor() {}

  reset() {
    this.products = new Map([
      ['1', { id: '1', name: 'Laptop', stock: 10, price: 1000, version: 1 }],
      ['2', { id: '2', name: 'Phone', stock: 5, price: 500, version: 1 }],
      ['3', { id: '3', name: 'RaceConditionItem', stock: 1, price: 100, version: 1 }],
    ]);
    this.carts.clear();
  }
}
