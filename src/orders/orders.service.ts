import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly db: DbService) {}

  async checkout(userId: string) {
    this.logger.log(`User ${userId} attempting to checkout...`);
    
    // ==============================================================================
    // Non-Functional Requirement 2: Computing Resource Management (Capacity Control)
    // ==============================================================================
    // To test this requirement: Send 50 checkout requests at the same moment.
    // You will notice that the system will process only two requests at the same time (based on the Semaphore size).
    // The rest of the requests will not cause a system crash and will not consume excessive memory,
    // but rather wait in a queue until one of the current two requests finishes.
    this.logger.log(`User ${userId} waiting in queue (Semaphore slots: ${this.db.checkoutSemaphore.getValue()} available)`);
    return await this.db.checkoutSemaphore.runExclusive(async () => {
      this.logger.log(`User ${userId} started processing (Semaphore slot acquired)`);
      
      const cart = this.db.carts.get(userId);
      if (!cart || cart.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      // Sort items to prevent Deadlock if multiple carts contain the same products
      const sortedCart = [...cart].sort((a, b) => a.productId.localeCompare(b.productId));
      const releases: Array<() => void> = [];

      try {
        // ==============================================================================
        // Non-Functional Requirement 1: Data Protection from Conflicts (Data Integrity)
        // ==============================================================================
        // To test this requirement (Race Condition): Create a product with stock quantity 1 only.
        // Then make 50 users try to buy this product at the same moment (in parallel).
        // Thanks to the Mutex (lock), only one user will be able to enter and change the quantity to 0.
        // When the second user tries to enter, they will find that the quantity has become 0 and the system will reject their request.
        // If we didn't use Mutex, all 50 users would see quantity 1 and buy the product,
        // which makes the stock negative (-49) and causes data inconsistency.
        for (const item of sortedCart) {
          const mutex = this.db.getProductMutex(item.productId);
          const release = await mutex.acquire(); // Lock the product (no one else can modify it now)
          releases.push(release);
        }

        // Simulate fake delay for checkout process (to show parallel and waiting effect clearly in testing)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check if stock is sufficient for all requested products
        for (const item of cart) {
          const product = this.db.products.get(item.productId);
          if (!product || product.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for product ${item.productId}`);
          }
        }

        // Deduct quantity from stock safely (since we own the Mutex lock now)
        for (const item of cart) {
          const product = this.db.products.get(item.productId);
          if (product) {
            product.stock -= item.quantity;
          }
        }

        // Empty the cart after successful checkout
        this.db.carts.set(userId, []);
        this.logger.log(`User ${userId} checkout successful. Stock deducted.`);

        return { message: 'Checkout successful' };
      } finally {
        // Release the lock (Mutex) for all products so other users can try to buy them
        for (const release of releases.reverse()) {
          release();
        }
        this.logger.log(`User ${userId} checkout processing finished (Semaphore released)`);
      }
    });
  }

  async checkoutUnsafe(userId: string) {
    this.logger.warn(`User ${userId} attempting UNSAFE checkout (No Mutex/Semaphore)...`);
    
    const cart = this.db.carts.get(userId);
    if (!cart || cart.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Simulate fake delay for checkout process
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if stock is sufficient
    for (const item of cart) {
      const product = this.db.products.get(item.productId);
      if (!product || product.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for product ${item.productId}`);
      }
    }

    // --- ARTIFICIAL DELAY TO FORCE RACE CONDITION ---
    // This allows multiple requests to pass the check before any of them update the stock
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Deduct quantity from stock (UNSAFE - Race conditions WILL occur here)
    for (const item of cart) {
      const product = this.db.products.get(item.productId);
      if (product) {
        product.stock -= item.quantity;
      }
    }

    this.db.carts.set(userId, []);
    this.logger.warn(`User ${userId} UNSAFE checkout finished. Stock deducted WITHOUT protection.`);
    return { message: 'Checkout successful (Unsafe)' };
  }
}
