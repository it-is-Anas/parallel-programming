import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  version: number; // For optimistic locking
}

@Injectable()
export class DbService {
  private readonly productsFilePath = path.join(process.cwd(), 'shared_db_products.json');
  private readonly cartsFilePath = path.join(process.cwd(), 'shared_db_carts.json');

  private _products: Map<string, Product> = new Map();
  private _carts: Map<string, any[]> = new Map();

  constructor() {
    this.initializeDb();
  }

  private initializeDb() {
    // Write initial products list if it does not exist
    if (!fs.existsSync(this.productsFilePath)) {
      const initialProducts = {
        '1': { id: '1', name: 'Laptop', stock: 10, price: 1000, version: 1 },
        '2': { id: '2', name: 'Phone', stock: 5, price: 500, version: 1 },
        '3': { id: '3', name: 'RaceConditionItem', stock: 1, price: 100, version: 1 },
        '100': { id: '100', name: 'StressTestItem', stock: 100, price: 150, version: 1 },
      };
      fs.writeFileSync(this.productsFilePath, JSON.stringify(initialProducts, null, 2), 'utf8');
    }

    // Write initial empty carts dictionary if it does not exist
    if (!fs.existsSync(this.cartsFilePath)) {
      fs.writeFileSync(this.cartsFilePath, '{}', 'utf8');
    }
  }

  private loadProducts(): Map<string, Product> {
    try {
      if (fs.existsSync(this.productsFilePath)) {
        const data = fs.readFileSync(this.productsFilePath, 'utf8');
        const parsed = JSON.parse(data);
        const map = new Map<string, Product>();
        for (const [k, v] of Object.entries(parsed)) {
          map.set(k, v as Product);
        }
        return map;
      }
    } catch (err) {}
    return this._products;
  }

  private saveProducts(map: Map<string, Product>) {
    try {
      const obj = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.productsFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {}
  }

  private loadCarts(): Map<string, any[]> {
    try {
      if (fs.existsSync(this.cartsFilePath)) {
        const data = fs.readFileSync(this.cartsFilePath, 'utf8');
        const parsed = JSON.parse(data);
        const map = new Map<string, any[]>();
        for (const [k, v] of Object.entries(parsed)) {
          map.set(k, v as any[]);
        }
        return map;
      }
    } catch (err) {}
    return this._carts;
  }

  private saveCarts(map: Map<string, any[]>) {
    try {
      const obj = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.cartsFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {}
  }

  public get products(): Map<string, Product> {
    const self = this;
    const map = this.loadProducts();

    return new Proxy(map, {
      get(target, prop, receiver) {
        if (prop === 'get') {
          return function (key: string) {
            const freshMap = self.loadProducts();
            const product = freshMap.get(key);
            if (!product) return undefined;

            // Return a proxy of the product object to intercept direct property mutations (e.g. stock / version changes)
            return new Proxy(product, {
              set(prodTarget, prodProp, value) {
                Reflect.set(prodTarget, prodProp, value);
                // Save changes back to the shared file
                freshMap.set(key, prodTarget);
                self.saveProducts(freshMap);
                return true;
              },
            });
          };
        }

        if (prop === 'has' || prop === 'values' || prop === 'entries' || prop === 'keys') {
          const freshMap = self.loadProducts();
          const method = freshMap[prop];
          if (typeof method === 'function') {
            return method.bind(freshMap);
          }
        }

        if (prop === 'set' || prop === 'delete' || prop === 'clear') {
          return function (...args: any[]) {
            const freshMap = self.loadProducts();
            const method = freshMap[prop];
            const result = method.apply(freshMap, args);
            self.saveProducts(freshMap);
            return result;
          };
        }

        const freshMap = self.loadProducts();
        const value = Reflect.get(freshMap, prop, receiver);
        return typeof value === 'function' ? value.bind(freshMap) : value;
      },
    });
  }

  public get carts(): Map<string, any[]> {
    const self = this;
    const map = this.loadCarts();

    return new Proxy(map, {
      get(target, prop, receiver) {
        if (prop === 'get' || prop === 'has' || prop === 'values' || prop === 'entries') {
          const freshMap = self.loadCarts();
          const method = freshMap[prop];
          if (typeof method === 'function') {
            return method.bind(freshMap);
          }
        }

        if (prop === 'set' || prop === 'delete' || prop === 'clear') {
          return function (...args: any[]) {
            const freshMap = self.loadCarts();
            const method = freshMap[prop];
            const result = method.apply(freshMap, args);
            self.saveCarts(freshMap);
            return result;
          };
        }

        const freshMap = self.loadCarts();
        const value = Reflect.get(freshMap, prop, receiver);
        return typeof value === 'function' ? value.bind(freshMap) : value;
      },
    });
  }

  reset() {
    const initialProducts = {
      '1': { id: '1', name: 'Laptop', stock: 10, price: 1000, version: 1 },
      '2': { id: '2', name: 'Phone', stock: 5, price: 500, version: 1 },
      '3': { id: '3', name: 'RaceConditionItem', stock: 1, price: 100, version: 1 },
      '100': { id: '100', name: 'StressTestItem', stock: 100, price: 150, version: 1 },
    };
    fs.writeFileSync(this.productsFilePath, JSON.stringify(initialProducts, null, 2), 'utf8');
    fs.writeFileSync(this.cartsFilePath, '{}', 'utf8');
  }

  async findProductWithDelay(id: string): Promise<Product | undefined> {
    // Simulate high database query cost (500ms)
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.products.get(id);
  }
}
