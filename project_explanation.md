# شرح حلول متطلبات المشروع وطرق الاختبار

يحتوي هذا الملف على شرح مفصل لكيفية تنفيذ كل متطلب من المتطلبات غير الوظيفية لمشروع **"محرك المعالجة عالي الأداء لنظام التجارة الإلكترونية"**، مع عرض الكود المرتبط بكل متطلب، وشرح المشكلة وكيف تم حلها، وكيفية تشغيل الاختبارات.

**التقنيات المستخدمة:** NestJS (TypeScript) + Redis (ioredis-mock) + async-mutex + EventEmitter

---

## 🏗️ البنية العامة للمشروع (Architecture)

### مراقبة الأداء باستخدام AOP (Aspect-Oriented Programming)
تم تطبيق مفهوم البرمجة الموجهة للجوانب عن طريق `PerformanceInterceptor` وهو Interceptor عام يتم تسجيله على مستوى التطبيق بالكامل. يقوم بقياس زمن تنفيذ كل طلب HTTP تلقائياً دون الحاجة لتعديل أي Controller.

**الملف:** `src/common/interceptors/performance.interceptor.ts`
```typescript
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PerformanceMonitor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const executionTime = Date.now() - now;
        this.logger.log(`[AOP] Route: ${method} ${url} - Execution Time: ${executionTime}ms`);
      }),
    );
  }
}
```

**التسجيل في `app.module.ts`:**
```typescript
providers: [
  {
    provide: APP_INTERCEPTOR,
    useClass: PerformanceInterceptor,  // يتم تطبيقه على جميع الطلبات تلقائياً (AOP)
  },
],
```

---

## 1. حماية البيانات المشتركة من التضارب (Concurrent Access & Data Integrity)

### ❌ المشكلة (Race Condition):
عندما يحاول 50 مستخدماً شراء نفس المنتج (الذي يتوفر منه قطعة واحدة فقط) في نفس اللحظة، قد يقرأ أكثر من مستخدم أن المخزون = 1، فيتم خصم المنتج عدة مرات ويصبح المخزون سالباً.

### ✅ الحل:
استخدمنا `Mutex` (قفل حصري) من مكتبة `async-mutex` لكل منتج. عند محاولة أي مستخدم تعديل مخزون منتج معين، يجب عليه أولاً الحصول على القفل الخاص بذلك المنتج. هذا يضمن أن مستخدماً واحداً فقط يمكنه تعديل المخزون في كل لحظة.

**الملف:** `src/concurrency/concurrency.service.ts`
```typescript
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
```

**استخدامه في `orders.service.ts` (عملية الـ Checkout):**
```typescript
for (const item of sortedCart) {
  const mutex = this.concurrencyService.getProductMutex(item.productId);
  const release = await mutex.acquire();  // حجز القفل
  releases.push(release);
}
// ... تعديل المخزون بأمان ...
// في finally:
for (const release of releases.reverse()) {
  release();  // تحرير القفل
}
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-concurrency.js
```
**ماذا يفعل الاختبار:** ينشئ 50 سلة شراء لـ 50 مستخدم، كلهم يريدون شراء المنتج رقم 3 (المتوفر بقطعة واحدة فقط)، ثم يرسل 50 طلب checkout متزامن. النتيجة المتوقعة: مستخدم واحد فقط ينجح والباقي يفشلون، والمخزون النهائي = 0.

---

## 2. إدارة الموارد الحاسوبية (Resource Management & Capacity Control)

### ❌ المشكلة:
إذا وصل 1000 طلب checkout في نفس اللحظة بدون أي تحكم، سيحاول السيرفر معالجتها جميعاً في نفس الوقت، مما يستهلك كافة الموارد (CPU/Memory) ويؤدي للانهيار.

### ✅ الحل:
استخدمنا `Semaphore` (إشارة مرور) بسعة 2 فتحات فقط. هذا يعني أن السيرفر يعالج فقط 2 عمليات checkout في وقت واحد، والباقي ينتظر في الطابور حتى تتحرر فتحة.

**الكود في `concurrency.service.ts`:**
```typescript
public readonly checkoutSemaphore = new Semaphore(2);  // فقط 2 عمليات متزامنة
```

**استخدامه في `orders.service.ts`:**
```typescript
async checkout(userId: string, simulatePaymentFailure = false) {
  this.logger.log(
    `User ${userId} waiting in queue (Semaphore slots: ${this.concurrencyService.checkoutSemaphore.getValue()} available)`,
  );
  return await this.concurrencyService.checkoutSemaphore.runExclusive(async () => {
    this.logger.log(`User ${userId} started processing (Semaphore slot acquired)`);
    // ... معالجة الطلب ...
  });
}
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-concurrency.js
```
**ماذا يفعل الاختبار:** نفس اختبار المتطلب 1. عند مراقبة الـ logs في السيرفر، سترى أن الطلبات تنتظر في الطابور (`waiting in queue`) ثم تدخل واحدة تلو الأخرى (`slot acquired`). الزمن الكلي سيكون طويلاً (لأن الطلبات تمر 2 في كل مرة) وهذا يثبت أن الـ Semaphore يعمل.

---

## 3. المعالجة غير المتزامنة (Asynchronous Queues)

### ❌ المشكلة:
في الكود السيء (`checkoutBad`)، يتم إجبار المستخدم على الانتظار حتى تنتهي عملية إصدار فاتورة PDF (2 ثانية) وإرسال إيميل (1 ثانية) قبل أن يحصل على الاستجابة. أي أن المستخدم ينتظر 3.5 ثانية بدون سبب!

**الكود السيء في `orders.service.ts`:**
```typescript
async checkoutBad(userId: string) {
  await new Promise((resolve) => setTimeout(resolve, 500));  // خصم المخزون
  this.db.carts.set(userId, []);

  // المشكلة: نجبر المستخدم على الانتظار!
  await new Promise((resolve) => setTimeout(resolve, 2000)); // فاتورة PDF
  await new Promise((resolve) => setTimeout(resolve, 1000)); // إيميل

  return { message: 'Checkout successful but you waited 3.5 seconds for no reason!' };
}
```

### ✅ الحل:
استخدمنا `EventEmitter` لنقل المهام الثقيلة (الفاتورة والإيميل) إلى الخلفية. المستخدم يحصل على استجابة فورية، والمهام تعمل بشكل غير متزامن بعد ذلك.

**إطلاق الحدث في `orders.service.ts` (الكود الجيد):**
```typescript
// بعد نجاح الشراء:
this.eventEmitter.emit('order.completed', { userId, itemsCount: cart.length });
return { message: 'Checkout successful and committed' };
// المستخدم يحصل على الاستجابة فوراً!
```

**الاستماع للحدث في `notifications.service.ts`:**
```typescript
@OnEvent('order.completed', { async: true })  // async: true = لا يحجز المسار الرئيسي
async handleOrderCompletedEvent(payload: { userId: string; itemsCount: number }) {
  // تشغيل المهمتين بالتوازي (Promise.all) بدلاً من التسلسل
  await Promise.all([
    this.generateInvoice(payload.userId),     // 2 ثانية
    this.sendEmailNotification(payload.userId), // 1 ثانية
  ]);
  // الوقت الإجمالي = 2 ثانية فقط (أطول مهمة) بدلاً من 3 ثوانٍ
}
```

### 🧪 كيفية تشغيل الاختبار:
```bash
# اختبار الطريقة السيئة (المستخدم ينتظر 3.5 ثانية):
node test-req3-fail.js

# اختبار الطريقة السيئة مع 50 مستخدم متزامن (النظام يصبح بطيئاً جداً):
node test-req3-fail-concurrency.js
```
**المقارنة:** عند استخدام المسار الطبيعي `/orders/checkout/:userId`، المستخدم يحصل على الاستجابة في أقل من ثانية، بينما المسار السيء `/orders/checkout-bad/:userId` يجبره على الانتظار 3.5+ ثانية.

---

## 4. معالجة البيانات الضخمة على دفعات (Batch Processing)

### ❌ المشكلة:
عند محاولة معالجة 100,000 سجل مبيعات دفعة واحدة باستخدام `Promise.all` على كامل المصفوفة، يتم فتح 100,000 عملية في نفس الوقت مما يستهلك الذاكرة بالكامل ويجمد السيرفر.

**الكود السيء في `batch.service.ts`:**
```typescript
async processDailySalesBad() {
  const dailySales = Array.from({ length: 100_000 }, ...);
  // الكارثة: فتح 100,000 عملية في نفس الوقت!
  await Promise.all(
    dailySales.map(async (sale) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
    })
  );
}
```

### ✅ الحل:
تقسيم البيانات إلى دفعات صغيرة (Chunks) بحجم 5000 سجل، ومعالجة كل دفعة على حدة. هذا يحافظ على استقرار الذاكرة ويمنع تجميد السيرفر.

**الكود الجيد في `batch.service.ts`:**
```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processDailySalesInChunks() {
  const totalRecords = 100_000;
  const dailySales = Array.from({ length: totalRecords }, (_, i) => ({
    orderId: `ORD-${i + 1}`,
    amount: Math.random() * 1000,
  }));

  const chunkSize = 5000;
  for (let i = 0; i < dailySales.length; i += chunkSize) {
    const chunk = dailySales.slice(i, i + chunkSize);
    // معالجة 5000 سجل فقط في كل دورة
    await Promise.all(
      chunk.map(async (sale) => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      })
    );
  }
}
```

### 🧪 كيفية تشغيل الاختبار:
```bash
# اختبار الطريقة الجيدة (معالجة على دفعات):
node test-req4-success.js

# اختبار الطريقة السيئة (معالجة الكل دفعة واحدة):
node test-req4-fail.js
```
**المقارنة:** في الطريقة الجيدة، سترى في الـ Server Terminal أن البيانات تُعالج على شكل دفعات منظمة. في الطريقة السيئة، سترى تجمداً وارتفاعاً حاداً في استهلاك الذاكرة.

---

## 5. توزيع الأحمال (Load Distribution)

### ❌ المشكلة:
إذا تم توجيه جميع الطلبات إلى خادم واحد، فإن هذا الخادم سينهار تحت الضغط العالي بينما تبقى الخوادم الأخرى بدون عمل.

### ✅ الحل:
تم تشغيل النظام فعلياً على عدة منافذ مختلفة (8000، 8001، 8002) لمحاكاة عدة خوادم. يقوم سكربت الاختبار بدور موزع الأحمال (Load Balancer) باستخدام خوارزمية التناوب الدائري (Round Robin) لتوزيع الطلبات بالتساوي.

**تم إضافة مسار `/process` في `app.controller.ts`:**
```typescript
@Get('process')
processRequest() {
  const port = process.env.PORT || 3000;
  return { message: `Handled by node on port ${port}` };
}
```

**سكربت الاختبار `test-load-balancer.js` يقوم بـ:**
```javascript
const ports = [8000, 8001, 8002];
const servers = ports.map((p) => `http://localhost:${p}/process`);

// تشغيل 3 نسخ من المشروع على منافذ مختلفة
for (const port of ports) {
  spawn('npx', ['ts-node', 'src/main.ts'], {
    env: { ...process.env, PORT: port.toString() },
    shell: true,
  });
}

// Round Robin: توزيع الطلبات بالتساوي
let currentIndex = 0;
for (let i = 1; i <= numTasks; i++) {
  const serverUrl = servers[currentIndex];
  currentIndex = (currentIndex + 1) % servers.length;
  const res = await fetch(serverUrl);
  const data = await res.json();
  console.log(`Task ${i} -> ${data.message}`);
}
```

**المخرجات المتوقعة:**
```
Task 1 -> Handled by node on port 8000
Task 2 -> Handled by node on port 8001
Task 3 -> Handled by node on port 8002
Task 4 -> Handled by node on port 8000
Task 5 -> Handled by node on port 8001
Task 6 -> Handled by node on port 8002
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-load-balancer.js
```
**ماذا يفعل الاختبار:** يشغل 3 نسخ من المشروع تلقائياً على المنافذ 8000/8001/8002، ثم يرسل الطلبات بالتناوب ويطبع أي خادم عالج كل طلب. عند الانتهاء يغلق جميع الخوادم تلقائياً.

---

## 6. استراتيجية التخزين المؤقت (Distributed Caching)

### ❌ المشكلة:
في كل مرة يطلب فيها مستخدم بيانات منتج، يتم الاستعلام من قاعدة البيانات (تأخير ~500ms). إذا كان المنتج شائعاً ويطلبه آلاف المستخدمين، فإن قاعدة البيانات تتعرض لضغط هائل.

### ✅ الحل:
تم تطبيق نمط **Cache-Aside** باستخدام Redis:
1. **عند الطلب:** نبحث أولاً في الـ Cache.
2. **Cache Hit:** إذا وُجد، نرجعه فوراً (< 15ms).
3. **Cache Miss:** إذا لم يوجد، نجلبه من قاعدة البيانات (~500ms)، ثم نخزنه في الـ Cache لمدة 60 ثانية.
4. **Cache Invalidation:** عند تحديث المخزون، نحذف المنتج من الـ Cache لمنع البيانات القديمة.

**الملف:** `src/db/redis.service.ts`
```typescript
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    // استخدام ioredis-mock لمحاكاة Redis بدون خادم حقيقي
    const RedisMock = require('ioredis-mock');
    this.client = new RedisMock();
  }

  async get(key: string): Promise<string | null> { return await this.client.get(key); }
  async set(key: string, value: string, ttlSeconds?: number): Promise<string> { ... }
  async del(key: string): Promise<number> { return await this.client.del(key); }
}
```

**الملف:** `src/products/products.service.ts`
```typescript
// Cache-Aside Pattern
async findOneCached(id: string) {
  const cacheKey = `product:${id}`;

  // 1. Try to get from Redis
  const cachedData = await this.redis.get(cacheKey);
  if (cachedData) {
    return { source: 'Cache (Redis)', data: JSON.parse(cachedData) };
  }

  // 2. Cache Miss: Get from DB (Simulated delay of 500ms)
  const product = await this.db.findProductWithDelay(id);

  // 3. Save to Redis Cache (60 seconds TTL)
  await this.redis.set(cacheKey, JSON.stringify(product), 60);
  return { source: 'Database', data: product };
}
```

**إبطال الـ Cache عند تحديث المخزون:**
```typescript
// عند تحديث المخزون (في updateStockOptimistic و updateStockPessimistic):
const cacheKey = `product:${productId}`;
await this.redis.del(cacheKey);  // Cache Invalidation
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-caching.js
```
**ماذا يفعل الاختبار:**
1. الطلب الأول: يجلب المنتج من الـ DB (زمن ~500ms).
2. الطلب الثاني والثالث: يجلبه من الـ Cache (زمن < 15ms).
3. يتم تحديث المخزون (Cache Invalidation).
4. الطلب الرابع: يجلب من الـ DB مجدداً (~500ms) لأن الـ Cache تم إبطاله.
5. الطلب الخامس: يجلب من الـ Cache بالبيانات المحدثة (< 15ms).

---

## 7. التحكم في الأقفال (Concurrency Control & Distributed Locking)

### ❌ المشكلة:
عند تشغيل خادم واحد، يمكن استخدام أقفال محلية في ذاكرة البرنامج (مثل `async-mutex`). ولكن في بيئة حقيقية موزعة (Distributed System) مع وجود عدة نسخ من الخادم تعمل خلف موزع أحمال (Load Balancer)، فإن الأقفال المحلية تفشل تماماً في منع التضارب لأن كل نسخة خادم لها ذاكرتها الخاصة والـ Mutex الخاص بها، مما يسمح لطلبين متزامنين على نسختين مختلفتين بتعديل نفس المنتج في نفس اللحظة.

### ✅ الحل (القفل الموزع - Distributed Lock):
قمنا بتطوير نظام أقفال موزعة متكامل في `ConcurrencyService` يدعم طريقتين للتشغيل حسب البيئة:
1. **تشغيل عبر Redis (قفل موزع حقيقي):** يستخدم أمر `SET key value NX PX` مع كتابة سكربت Lua مخصص لفك القفل بأمان والتأكد من أن صاحب القفل هو فقط من يقوم بفكّه.
2. **تشغيل عبر نظام الملفات المشترك (Filesystem Fallback):** في حال عدم وجود خادم Redis حقيقي (مثل بيئة التطوير المحاكية `ioredis-mock`)، يقوم النظام تلقائياً بالتحول إلى نظام أقفال الملفات المشتركة. يعتمد هذا النظام على إنشاء مجلدات بشكل ذري (Atomic Directory Creation) على مستوى نظام التشغيل (`fs.promises.mkdir`) وكتابة بيانات صاحب القفل ووقت الصلاحية (TTL) بداخلها لمنع التعارض بين العمليات المختلفة، مع آلية تنظيف تلقائي للأقفال منتهية الصلاحية.

#### أ. القفل المتفائل (Optimistic Locking):
يعتمد على تتبع حقل `version` لكل منتج. يتم تمرير الإصدار المقروء عند الشراء، وإذا تعارض مع الإصدار الحالي في قاعدة البيانات يتم إرجاع خطأ تعارض `409 Conflict`.
```typescript
async updateStockOptimistic(productId: string, quantity: number, clientVersion: number) {
  // التحقق من الإصدار
  if (product.version !== clientVersion) {
    throw new ConflictException(`Optimistic lock failed: Version mismatch!`);
  }
  product.stock -= quantity;
  product.version += 1;
}
```

#### ب. القفل التشاؤمي الموزع (Distributed Pessimistic Locking):
يتم حجز قفل موزع (سواء عبر Redis أو نظام الملفات المشترك) يمنع أي نسخة أخرى من الخادم أو أي خيط آخر من تعديل نفس المورد حتى انتهاء المعالجة.
```typescript
async updateStockPessimistic(productId: string, quantity: number) {
  // حجز قفل موزع خاص بالمنتج
  const mutex = this.concurrencyService.getProductMutex(productId);
  const release = await mutex.acquire();

  try {
    // تعديل المخزون بأمان تام عبر كل النسخ الموزعة
    const product = this.db.products.get(productId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    product.stock -= quantity;
    product.version += 1;
  } finally {
    // تحرير القفل بشكل غير متزامن
    await release();
  }
}
```

### 🧪 كيفية تشغيل الاختبارات:
* **اختبار الأقفال المحلية (على نسخة واحدة):**
```bash
node test-locking.js
```
* **اختبار الأقفال الموزعة بين خوادم متعددة (Distributed Locking Test):**
يقوم هذا الاختبار بتشغيل نسختين من السيرفر على منافذ مختلفة (8000 و 8001) وإرسال طلبين متزامنين لشراء نفس المنتج لإثبات أن العملية الثانية على النسخة الثانية تنتظر تماماً حتى تنتهي العملية الأولى وتحرر القفل الموزع:
```bash
node test-distributed-locking.js
```
**ماذا يفعل الاختبار:**
- **القفل التشاؤمي الموزع:** يرسل طلبين متزامنين لنسختين مختلفتين تشتركان في قاعدة بيانات موحدة (`shared_db_products.json`)، ويُثبت بالاختبار أن الطلب الثاني تم تعليقه وانتظر حتى انتهاء الأول، حيث ينجح الطلب الأول (HTTP 201) ويستهلك المنتج، بينما يفشل الطلب الثاني (HTTP 400 - Insufficient stock) لنفاد الكمية، مما يثبت مشاركة حالة المخزون ونجاح القفل المشترك الموزع.

---

## 8. سلامة المعاملات (Transaction Integrity / ACID)

### ❌ المشكلة:
في دالة `checkoutNoAcid`، يتم خصم المخزون أولاً ثم محاولة الدفع. إذا فشل الدفع، المخزون يبقى مخصوماً ولا يتم إرجاعه! هذا يعني بيانات غير متسقة.

**الكود السيء:**
```typescript
async checkoutNoAcid(userId: string, simulatePaymentFailure = false) {
  // 1. خصم المخزون فوراً دون أخذ snapshot
  for (const item of cart) {
    product.stock -= item.quantity;
  }

  // 2. محاكاة دفع يفشل
  if (simulatePaymentFailure) {
    // المخزون انخصم ولا يوجد Rollback! ❌
    throw new BadRequestException('Payment failed.');
  }
}
```

### ✅ الحل:
في دالة `checkout` الرئيسية، نأخذ **لقطة (Snapshot)** من المخزون قبل أي تعديل. إذا فشل أي جزء من العملية (الدفع مثلاً)، نقوم بإرجاع المخزون لحالته الأصلية (**Rollback**).

```typescript
async checkout(userId: string, simulatePaymentFailure = false) {
  // أخذ لقطة (Snapshot) لدعم الـ Rollback
  const stockSnapshot = new Map<string, number>();

  try {
    for (const item of sortedCart) {
      const product = this.db.products.get(item.productId);
      stockSnapshot.set(item.productId, product.stock);  // حفظ الحالة الأصلية
    }

    // خصم المخزون...
    // معالجة الدفع...

    if (simulatePaymentFailure) {
      throw new BadRequestException('Payment processing failed!');
    }

    return { message: 'Checkout successful and committed' };  // Commit ✅
  } catch (error) {
    // Rollback: إعادة المخزون لحالته الأصلية ✅
    for (const [productId, oldStock] of stockSnapshot.entries()) {
      const product = this.db.products.get(productId);
      if (product) {
        product.stock = oldStock;
      }
    }
    throw error;
  }
}
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-acid.js
```
**ماذا يفعل الاختبار:**
1. **اختبار الـ ACID:** يضيف Laptop للسلة ويحاول الدفع مع محاكاة فشل الدفع. المتوقع: المخزون يبقى 10 (تم عمل Rollback).
2. **اختبار بدون ACID:** نفس السيناريو لكن بدون Rollback. المتوقع: المخزون ينخفض إلى 9 رغم فشل الدفع! (بيانات غير متسقة).

---

## 9. اختبار الاستقرار تحت الضغط (Stress Testing)

### ❌ المشكلة:
يجب إثبات أن النظام قادر على تخديم **100 مستخدم متزامن على الأقل** دون انهيار أو فقدان بيانات.

### ✅ الحل:
تم كتابة سكربت يحاكي 100 مستخدم متزامن يحاولون شراء منتج (StressTestItem, مخزون = 100). يستخدم مجمع خيوط (Worker Pool) بسعة 20 عامل لإرسال الطلبات.

**الملف:** `stress-test.js`
```javascript
const CONCURRENT_USERS = 100;
const PRODUCT_ID = '100'; // StressTestItem (Initial Stock: 100)

// Concurrency pool runner (20 workers)
async function runConcurrentRequests(limit, url, getBody) {
  const results = new Array(CONCURRENT_USERS);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < CONCURRENT_USERS) {
      const index = nextIndex++;
      results[index] = await makeRequest(url, { method: 'POST', body: getBody() });
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);
  return results;
}
```

**الاختبار يشمل:**
- **القفل التشاؤمي:** 100 طلب متزامن → كلهم ينجحون → المخزون = 0 (لأن كل طلب ينتظر دوره).
- **القفل المتفائل:** 100 طلب متزامن بنفس الـ version → واحد فقط ينجح → المخزون = 99 (لأن الباقي يفشل بسبب تعارض الإصدارات).

### 🧪 كيفية تشغيل الاختبار:
```bash
node stress-test.js
# أو:
npm run test:stress
```

---

## 10. القياس وتحديد الاختناقات (Benchmarking & Bottleneck Analysis)

### ❌ المشكلة (الاختناق):
جلب بيانات المنتج مباشرة من قاعدة البيانات يستغرق ~500ms لكل طلب. مع 200 طلب متزامن، يصبح الأداء كارثياً.

### ✅ الحل:
استخدام **Redis Cache** (المتطلب 6) لإزالة هذا الاختناق. الطلب الأول يملأ الـ Cache، والباقي يحصلون على البيانات في < 15ms.

**الملف:** `test-benchmark.js`
```javascript
const CONCURRENCY = 200; // 200 طلب متزامن

// [1] BEFORE: بدون Cache (استعلام مباشر من DB)
const beforeStats = await runBenchmark('BEFORE (No Cache)', `${BASE_URL}/products/${PRODUCT_ID}`);

// [2] AFTER: مع Redis Cache
await makeRequest(`${BASE_URL}/products/${PRODUCT_ID}/cached`); // ملء الـ Cache
const afterStats = await runBenchmark('AFTER (Redis Cache)', `${BASE_URL}/products/${PRODUCT_ID}/cached`);

// المقارنة:
//                        | Before (No Cache) | After (Redis Cache)
// Requests Per Second    | ~xxx req/sec      | ~xxx req/sec
// Average Latency        | ~500ms            | ~5ms
const rpsImprovement = (afterStats.rps / beforeStats.rps).toFixed(2);
console.log(`PERFORMANCE GAIN: The optimized endpoint is ${rpsImprovement}x faster!`);
```

### 🧪 كيفية تشغيل الاختبار:
```bash
node test-benchmark.js
# أو:
npm run test:benchmark
```
**المخرجات:** جدول مقارنة يعرض الفرق في عدد الطلبات في الثانية (Requests/Second)، متوسط زمن الاستجابة (Average Latency)، والزمن الكلي. سترى تحسناً بعدة أضعاف بعد استخدام الـ Cache.

---

## 📌 ملخص أوامر تشغيل جميع الاختبارات

| المتطلب | أمر التشغيل |
|---------|-------------|
| 1. حماية البيانات (Race Condition) | `node test-concurrency.js` |
| 2. إدارة الموارد (Semaphore) | `node test-concurrency.js` |
| 3. المعالجة غير المتزامنة (Async) | `node test-req3-fail.js` / `node test-req3-fail-concurrency.js` |
| 4. معالجة الدفعات (Batch) | `node test-req4-success.js` / `node test-req4-fail.js` |
| 5. توزيع الأحمال (Load Balancer) | `node test-load-balancer.js` |
| 6. التخزين المؤقت (Cache) | `node test-caching.js` |
| 7. التحكم بالأقفال (Locking - Local) | `node test-locking.js` |
| 7. التحكم بالأقفال الموزعة (Distributed Locking) | `node test-distributed-locking.js` |
| 8. سلامة المعاملات (ACID) | `node test-acid.js` |
| 9. اختبار الضغط (Stress Test) | `node stress-test.js` |
| 10. القياس (Benchmark) | `node test-benchmark.js` |

> **ملاحظة:** يجب تشغيل السيرفر أولاً قبل تشغيل أي اختبار (ما عدا اختبارات المتطلب 5 والمتطلب 7 الخاصة بالأقفال الموزعة والتي تقوم بتشغيل وإغلاق السيرفرات تلقائياً):
> ```bash
> npm run start:dev
> ```
