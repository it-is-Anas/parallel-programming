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

  async checkout(userId: string) {
    this.logger.log(`User ${userId} attempting to checkout...`);

    // ==============================================================================
    // المتطلب غير الوظيفي 2: إدارة الموارد الحاسوبية (Resource Management & Capacity Control)
    // ==============================================================================
    // لاختبار هذا المتطلب: قم بإرسال 50 طلب شراء في نفس اللحظة.
    // ستلاحظ أن النظام سيقوم بمعالجة طلبين فقط في نفس الوقت (بناءً على حجم الـ Semaphore).
    // بقية الطلبات لن تسبب انهيار (Crash) للنظام ولن تستهلك الذاكرة بشكل مفرط،
    // بل ستنتظر في طابور (Queue) حتى ينتهي أحد الطلبين الحاليين.
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

        // ترتيب المنتجات لمنع حدوث الـ Deadlock إذا كان هناك عدة سلات تحتوي على نفس المنتجات
        const sortedCart = [...cart].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );
        const releases: Array<() => void> = [];

        try {
          // ==============================================================================
          // المتطلب غير الوظيفي 1: حماية البيانات من التضارب (Data Integrity & Concurrent Access)
          // ==============================================================================
          // لاختبار هذا المتطلب (Race Condition): قم بإنشاء منتج كميته 1 فقط في المخزون.
          // ثم اجعل 50 مستخدم يحاولون شراء هذا المنتج في نفس اللحظة (بشكل متوازٍ).
          // بفضل الـ Mutex (القفل)، مستخدم واحد فقط سيتمكن من الدخول وتغيير الكمية إلى 0.
          // عندما يحاول المستخدم الثاني الدخول، سيجد أن الكمية أصبحت 0 وسيرفض النظام طلبه.
          // لو لم نستخدم Mutex، لكان جميع الـ 50 مستخدم رأوا الكمية 1 واشتروا المنتج،
          // مما يجعل المخزون بالسالب (-49) ويحدث تضارب في البيانات.
          for (const item of sortedCart) {
            const mutex = this.concurrencyService.getProductMutex(
              item.productId,
            );
            const release = await mutex.acquire(); // قفل المنتج (لا يمكن لأحد غيري تعديله الآن)
            releases.push(release);
          }

          // محاكاة تأخير وهمي لعملية الدفع (لإظهار أثر التوازي والانتظار بوضوح في الاختبار)
          await new Promise((resolve) => setTimeout(resolve, 500));

          // التحقق من أن المخزون كافي لكل المنتجات المطلوبة
          for (const item of cart) {
            const product = this.db.products.get(item.productId);
            if (!product || product.stock < item.quantity) {
              throw new BadRequestException(
                `Insufficient stock for product ${item.productId}`,
              );
            }
          }

          // خصم الكمية من المخزون بأمان (لأننا نمتلك القفل Mutex حالياً)
          for (const item of cart) {
            const product = this.db.products.get(item.productId);
            if (product) {
              product.stock -= item.quantity;
            }
          }

          // إفراغ السلة بعد نجاح الشراء
          this.db.carts.set(userId, []);
          this.logger.log(
            `User ${userId} checkout successful. Stock deducted.`,
          );

          // المتطلب الثالث: إطلاق حدث غير متزامن (Asynchronous Event)
          // المستخدم سيتلقى استجابة فورية (HTTP 200 OK) دون انتظار إرسال الإيميل أو طباعة الفاتورة.
          this.eventEmitter.emit('order.completed', {
            userId,
            itemsCount: cart.length,
          });

          return { message: 'Checkout successful' };
        } finally {
          // فك القفل (Mutex) عن جميع المنتجات ليتمكن المستخدمون الآخرون من محاولة شرائها
          for (const release of releases.reverse()) {
            release();
          }
          this.logger.log(
            `User ${userId} checkout processing finished (Semaphore released)`,
          );
        }
      },
    );
  }
}
