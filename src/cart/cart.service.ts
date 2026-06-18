import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class CartService {
  constructor(private readonly db: DbService) {}

  getCart(userId: string): any[] {
    if (!this.db.carts.has(userId)) {
      this.db.carts.set(userId, []);
    }
    return this.db.carts.get(userId)!;
  }

  addToCart(userId: string, productId: string, quantity: number) {
    const product = this.db.products.get(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const cart = this.getCart(userId);
    const existingItem = cart.find((item) => item.productId === productId);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({ productId, quantity, price: product.price });
    }

    this.db.carts.set(userId, cart);
    return cart;
  }
}
