import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ConcurrencyService } from '../concurrency/concurrency.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly db: DbService,
    private readonly concurrencyService: ConcurrencyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkout(userId: string, simulatePaymentFailure = false) {
    this.logger.log(`User ${userId} attempting to checkout (ACID mode)...`);

    this.logger.log(
      `User ${userId} waiting in queue (Semaphore slots: ${this.concurrencyService.checkoutSemaphore.getValue()} available)`,
    );
    return await this.concurrencyService.checkoutSemaphore.runExclusive(
      async () => {
        this.logger.log(
          `User ${userId} started processing (Semaphore slot acquired)`,
        );

        const cart = this.db.carts.get(userId);
        if (!cart || cart.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        // ترتيب المنتجات لمنع حدوث الـ Deadlock
        const sortedCart = [...cart].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );
        const releases: Array<() => Promise<void>> = [];

        // أخذ لقطة (Snapshot) لحالة المخزون قبل التعديل لدعم الـ Rollback (ACID)
        const stockSnapshot = new Map<string, number>();

        try {
          for (const item of sortedCart) {
            const mutex = this.concurrencyService.getProductMutex(
              item.productId,
            );
            const release = await mutex.acquire();
            releases.push(release);

            // حفظ الحالة الأصلية
            const product = this.db.products.get(item.productId);
            if (product) {
              stockSnapshot.set(item.productId, product.stock);
            }
          }

          // محاكاة تأخير وهمي لعملية التحقق
          await new Promise((resolve) => setTimeout(resolve, 300));

          // التحقق من أن المخزون كافي
          for (const item of cart) {
            const product = this.db.products.get(item.productId);
            if (!product || product.stock < item.quantity) {
              throw new BadRequestException(
                `Insufficient stock for product ${item.productId}`,
              );
            }
          }

          // خصم الكمية من المخزون
          for (const item of cart) {
            const product = this.db.products.get(item.productId);
            if (product) {
              product.stock -= item.quantity;
            }
          }

          // محاكاة عملية الدفع الإلكتروني
          this.logger.log(`Processing payment for User ${userId}...`);
          await new Promise((resolve) => setTimeout(resolve, 200));

          if (simulatePaymentFailure) {
            // حدوث فشل في الدفع -> تراجع عن كل شيء (Rollback)
            throw new BadRequestException('Payment processing failed! Transaction rolled back.');
          }

          // إفراغ السلة بعد نجاح الشراء (Commit)
          this.db.carts.set(userId, []);
          this.logger.log(
            `User ${userId} checkout successful. Stock committed.`,
          );

          this.eventEmitter.emit('order.completed', {
            userId,
            itemsCount: cart.length,
          });

          return { message: 'Checkout successful and committed' };
        } catch (error) {
          // ==============================================================================
          // المتطلب غير الوظيفي 8: الـ Rollback عند حدوث فشل لضمان الـ ACID
          // ==============================================================================
          this.logger.error(`Checkout failed for User ${userId}. Initiating rollback...`);
          
          for (const [productId, oldStock] of stockSnapshot.entries()) {
            const product = this.db.products.get(productId);
            if (product) {
              product.stock = oldStock; // إعادة المخزون لحالته الأصلية
              this.logger.warn(`Rolled back Product ${productId} stock to ${oldStock}`);
            }
          }
          throw error;
        } finally {
          for (const release of releases.reverse()) {
            await release();
          }
          this.logger.log(
            `User ${userId} checkout processing finished (Semaphore released)`,
          );
        }
      },
    );
  }

  // دالة لا تطبق الـ ACID (تحديث مخزون دون القدرة على التراجع في حال فشل الدفع)
  async checkoutNoAcid(userId: string, simulatePaymentFailure = false) {
    this.logger.warn(`[NO-ACID] User ${userId} starting checkout without Transaction Integrity...`);

    const cart = this.db.carts.get(userId);
    if (!cart || cart.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // 1. خصم المخزون فوراً دون أخذ snapshot
    for (const item of cart) {
      const product = this.db.products.get(item.productId);
      if (product) {
        if (product.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for product ${item.productId}`);
        }
        product.stock -= item.quantity;
      }
    }

    // 2. محاكاة دفع يفشل
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (simulatePaymentFailure) {
      this.logger.error(`[NO-ACID] Payment failed for User ${userId}. BUT NO ROLLBACK OCCURRED!`);
      throw new BadRequestException('Payment failed. (Notice: Stock was already deducted and NOT rolled back!)');
    }

    this.db.carts.set(userId, []);
    return { message: 'Checkout successful (No ACID)' };
  }

  // ==============================================================================
  // دالة سيئة (BAD FUNCTION): لغرض العرض والاختبار فقط (لإثبات أهمية المتطلب 3)
  // ==============================================================================
  async checkoutBad(userId: string) {
    this.logger.warn(`[BAD] User ${userId} starting SYNCHRONOUS checkout...`);
    
    // محاكاة خصم المخزون
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.db.carts.set(userId, []);

    // المشكلة هنا: نجبر المستخدم على الانتظار حتى تنتهي المهام الثقيلة!
    this.logger.warn(`[BAD] Blocking user ${userId} while generating PDF...`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // فاتورة
    
    this.logger.warn(`[BAD] Blocking user ${userId} while sending Email...`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // إيميل

    this.logger.warn(`[BAD] User ${userId} finally gets response after waiting!`);
    return { message: 'Checkout successful but you waited 3.5 seconds for no reason!' };
  }
}
