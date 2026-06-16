# مشروع مادة البرمجة المتوازية - توثيق متطلبات المشروع 2026

يحتوي هذا الملف على توثيق وشرح تفصيلي لتنفيذ متطلبات المشروع، بما يشمل تحقيق حماية البيانات من التضارب (التحكم في الأقفال)، إدارة الموارد والموازنة، معالجة البيانات غير المتزامنة وعلى دفعات، قياس ومراقبة الأداء (AOP)، بالإضافة إلى سيناريوهات اختبار التحمل (Stress Testing).

---

## 1. حماية البيانات من التضارب (Concurrent Access & Data Integrity)

### كيف تم تحقيقها:
لمنع مشكلة الـ **Race Condition** عند محاولة عدة مستخدمين شراء نفس المنتج في نفس اللحظة (حيث قد تكون الكمية المتوفرة غير كافية للجميع)، تم استخدام **Mutex (قفل ثنائي)** لكل منتج بشكل منفصل من مكتبة `async-mutex`.
* عندما يبدأ مستخدم عملية الدفع (`checkout`)، يستعلم عن الـ Mutex الخاص بالمنتج الذي يريد شراءه ويقوم بحجزه (`acquire`).
* يمنع هذا القفل أي مستخدم آخر من قراءة أو تعديل مخزون هذا المنتج حتى ينتهي المستخدم الحالي تماماً ويتم تحرير القفل في كتلة `finally`.
* **منع المأزق (Deadlock Prevention):** تم ترتيب المنتجات في السلة أبجدياً حسب المعرف `productId` قبل حجز الأقفال. هذا يضمن أنه إذا كان هناك مستخدمان يحتويان على سلال تحتوي على نفس المنتجات (مثلاً المنتج A والمنتج B)، سيقوم كلاهما بطلب قفل A أولاً ثم قفل B، مما يمنع حدوث دائرية الانتظار (Circular Wait) المسببة للـ Deadlock.

### الكود المسؤول عن تحقيقها:
* **خدمة المزامنة:** [concurrency.service.ts](file:///c:/Users/Zaid/parallel-programming/src/concurrency/concurrency.service.ts)
```typescript
import { Injectable } from '@nestjs/common';
import { Mutex, Semaphore } from 'async-mutex';

@Injectable()
export class ConcurrencyService {
  private readonly productMutexes: Map<string, Mutex> = new Map();
  // ...
  getProductMutex(productId: string): Mutex {
    if (!this.productMutexes.has(productId)) {
      this.productMutexes.set(productId, new Mutex());
    }
    return this.productMutexes.get(productId)!;
  }
}
```

* **حجز الأقفال وتعديل المخزون بأمان:** [orders.service.ts](file:///c:/Users/Zaid/parallel-programming/src/orders/orders.service.ts)
```typescript
// ترتيب المنتجات لمنع حدوث الـ Deadlock
const sortedCart = [...cart].sort((a, b) =>
  a.productId.localeCompare(b.productId),
);
const releases: Array<() => void> = [];

try {
  // حجز قفل متفرد لكل منتج في السلة لمنع الـ Race Condition
  for (const item of sortedCart) {
    const mutex = this.concurrencyService.getProductMutex(item.productId);
    const release = await mutex.acquire(); 
    releases.push(release);
  }

  // التحقق من المخزون وخصمه بشكل آمن
  for (const item of cart) {
    const product = this.db.products.get(item.productId);
    if (!product || product.stock < item.quantity) {
      throw new BadRequestException(`Insufficient stock for product ${item.productId}`);
    }
  }

  for (const item of cart) {
    const product = this.db.products.get(item.productId);
    if (product) {
      product.stock -= item.quantity;
    }
  }
  // ...
} finally {
  // فك الأقفال بالترتيب المعاكس لتمكين الطلبات الأخرى من العمل
  for (const release of releases.reverse()) {
    release();
  }
}
```

---

## 2. إدارة الموارد الحاسوبية (Resource Management & Capacity Control)

### كيف تم تحقيقها:
للتحكم في استهلاك النظام للموارد وتجنب حدوث انهيار (Crash) أو بطء شديد تحت الضغط المتزامن العالي، تم تطبيق مفهوم **Capacity Control** باستخدام **Semaphore** بحد أقصى يُسمح له بالمعالجة المتزامنة.
* تم إعداد Semaphore بسعة **2** كحد أقصى للمستندات المتوازية لمعالجة عمليات الدفع (`checkout`).
* عند تدفق عدد كبير من الطلبات المتزامنة (مثلاً 50 طلباً)، يقوم الـ Semaphore بالسماح لطلبين فقط بالدخول إلى المسار الحرج للمعالجة.
* بقية الطلبات تنتظر في طابور (Queue) مبني داخلياً بشكل آمن دون أن تستهلك موارد الخادم بكثافة أو تؤدي إلى استهلاك ذاكرة مفرط.
* بعد انتهاء أي من الطلبين الجاري معالجتهما، يتم تحرير خانة في الـ Semaphore ليدخل الطلب التالي في الطابور تلقائياً.

### الكود المسؤول عن تحقيقها:
* **تعريف الـ Semaphore:** [concurrency.service.ts](file:///c:/Users/Zaid/parallel-programming/src/concurrency/concurrency.service.ts)
```typescript
// Semaphore للتحكم بالقدرة الاستيعابية وتحديد العمليات المتزامنة بـ 2
public readonly checkoutSemaphore = new Semaphore(2);
```

* **تطبيقه على عملية الدفع:** [orders.service.ts](file:///c:/Users/Zaid/parallel-programming/src/orders/orders.service.ts)
```typescript
return await this.concurrencyService.checkoutSemaphore.runExclusive(
  async () => {
    this.logger.log(`User ${userId} started processing (Semaphore slot acquired)`);
    // كود معالجة الطلب والدفع...
  }
);
```

---

## 3. المعالجة غير المتزامنة (Asynchronous Queues)

### كيف تم تحقيقها:
تم نقل العمليات المرافقة لإتمام الطلب والتي لا تؤثر على قرار الشراء الفوري للمستخدم (مثل توليد فاتورة PDF وإرسال إيميل تأكيدي) خارج المسار الحرج (Main Thread) باستخدام **الأحداث غير المتزامنة (Asynchronous Events)** المدعومة بـ `@nestjs/event-emitter`.
* بمجرد نجاح الشراء وتأكيد خصم المخزون، يُطلق الخادم حدثاً باسم `order.completed` ويقوم بإرجاع استجابة نجاح فورية (HTTP 200 OK) للمستخدم دون انتظار العمليات المرافقة.
* يتلقى معالج الحدث (Event Listener) الحدث ويقوم بتشغيل المهام بشكل خلفي وغير متزامن (`async: true`).
* **تحسين التوازي:** بدلاً من تشغيل المهام الخلفية بشكل متسلسل، تم تشغيلها بالتوازي باستخدام `Promise.all` مما يجعل الزمن الإجمالي للمهام الخلفية مساوياً لزمن أطول مهمة فقط (2 ثانية) بدلاً من مجموع أوقاتها (3 ثوانٍ).

### الكود المسؤول عن تحقيقها:
* **إطلاق الحدث في خدمة الطلبات:** [orders.service.ts](file:///c:/Users/Zaid/parallel-programming/src/orders/orders.service.ts)
```typescript
this.eventEmitter.emit('order.completed', {
  userId,
  itemsCount: cart.length,
});
```

* **الاستماع للحدث ومعالجته غير المتزامنة بالتوازي:** [notifications.service.ts](file:///c:/Users/Zaid/parallel-programming/src/notifications/notifications.service.ts)
```typescript
@OnEvent('order.completed', { async: true })
async handleOrderCompletedEvent(payload: { userId: string; itemsCount: number }) {
  this.logger.log(`[ASYNC JOB] Starting background tasks for User ${payload.userId} concurrently...`);
  
  // تشغيل توليد الفاتورة وإرسال الإيميل معاً بالتوازي لتقليل زمن المعالجة الخلفية
  await Promise.all([
    this.generateInvoice(payload.userId),
    this.sendEmailNotification(payload.userId),
  ]);
}
```

### ماذا لو انهار الخادم؟ وكيف نضمن بقاء البيانات؟ (Server Crash Resilience & Durability):
* **الوضع الحالي في المشروع:**
  بما أن هذا المشروع هو نموذج محاكاة أكاديمي، فقد تم استخدام **طابور أحداث في الذاكرة (In-Memory Queue)** عبر `@nestjs/event-emitter`. بالتالي، إذا انهار الخادم (Server Crash) أو أُعيد تشغيله أثناء وجود مهام خلفية تنتظر المعالجة، **ستضيع هذه الأحداث والبيانات المخزنة في الذاكرة العشوائية (RAM)**.
* **الحلول الهندسية في بيئات الإنتاج الحقيقية (Production):**
  لحل هذه المشكلة وضمان عدم ضياع أي مهمة خلفية (مثل الفواتير أو الإشعارات)، يجب استخدام **طوابير رسائل دائمة (Durable / Persistent Message Queues)** خارج ذاكرة التطبيق:
  1. **نظام BullMQ (المستند إلى Redis):**
     * نقوم بحفظ المهام داخل قاعدة بيانات **Redis** (والتي تقوم بكتابة البيانات على القرص الصلب).
     * إذا انهار خادم NestJS، تظل المهام محفوظة بأمان في Redis. بمجرد عودة الخادم للعمل، يعيد الاتصال بـ Redis ويستأنف معالجة المهام المتبقية من حيث توقفت.
  2. **وسطاء الرسائل (Message Brokers) مثل RabbitMQ أو Apache Kafka:**
     * يتم إرسال الحدث إلى وسيط الرسائل الخارجي.
     * لا يقوم الوسيط بحذف الرسالة إلا بعد تلقي **تأكيد معالجة (Acknowledgment - ACK)** من الخادم.
     * إذا انهار الخادم أثناء معالجة المهمة، يلاحظ الوسيط انقطاع الاتصال ويعيد توجيه الرسالة (Re-queue) لخادم آخر أو لنفس الخادم بعد إعادة تشغيله.
  3. **نمط صندوق الصادر (Transactional Outbox Pattern):**
     * نقوم بحفظ بيانات المهمة الخلفية في جدول خاص في قاعدة البيانات الأساسية (مثلاً `outbox_events`) كجزء من نفس العملية المالية (Database Transaction) الخاصة بحفظ الطلب.
     * يقوم خيط معالجة خلفي (Background Worker) بقراءة الجدول ومعالجة المهام غير المنفذة وتحديث حالتها إلى "مكتملة"، مما يضمن عدم ضياع أي مهمة نهائياً حتى في حال الانهيار الكامل للنظام.

---

## 4. معالجة البيانات الضخمة على دفعات (Batch Processing)

### كيف تم تحقيقها:
عند معالجة كمية ضخمة من البيانات (مثل جرد 100,000 عملية بيع يومية)، فإن معالجتها دفعة واحدة قد يؤدي إلى نفاد الذاكرة (Out of Memory) وتجميد خيط المعالجة الرئيسي للغة جافاسكريبت (Event Loop Blocking).
* تم حل هذه المشكلة بتقسيم الـ 100,000 سجل إلى دفعات أصغر (**Chunks**) بحجم **5000** سجل في المرة الواحدة.
* يتم تكرار المعالجة على هذه الدفعات بالتتابع (باستخدام حلقة `for` العادية).
* داخل كل دفعة، يتم استخدام `Promise.all` لتشغيل المهام لـ 5000 سجل بالتوازي لتحقيق أقصى استفادة من السرعة دون إثقال الذاكرة.
* تم دمج جدولة المهام (Cron Job) باستخدام `@nestjs/schedule` لتعمل تلقائياً كل منتصف ليل.

### الكود المسؤول عن تحقيقها:
* **معالجة الدفعات وجدولة الـ Cron:** [batch.service.ts](file:///c:/Users/Zaid/parallel-programming/src/batch/batch.service.ts)
```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processDailySalesInChunks() {
  const totalRecords = 100_000;
  const dailySales = Array.from({ length: totalRecords }, (_, i) => ({
    orderId: `ORD-${i + 1}`,
    amount: Math.random() * 1000,
  }));

  const chunkSize = 5000; 
  let processedCount = 0;

  for (let i = 0; i < dailySales.length; i += chunkSize) {
    const chunk = dailySales.slice(i, i + chunkSize);
    
    // معالجة 5000 سجل معاً بالتوازي داخل الدفعة الحالية
    await Promise.all(
      chunk.map(async (sale) => {
        await new Promise((resolve) => setTimeout(resolve, 2)); 
      })
    );

    processedCount += chunk.length;
  }
}
```

---

## 5. توزيع الأحمال (Load Distribution)

### كيف تم تحقيقها:
تمت محاكاة طبقة توزيع الأحمال (Load Balancer) التي تتلقى الطلبات من العناوين البريدية للمستخدمين (IPs) وتوجهها إلى خوادم خلفية وهمية متعددة (Server-Alpha، Server-Beta، Server-Gamma). تم تطبيق وتبرير استراتيجيتين رئيسيتين لتوزيع الأحمال:

1. **Round Robin (التناوب الدائري):**
   * **الآلية:** يوزع الطلبات بالتناوب وبشكل متساوٍ على الخوادم بالتسلسل (مثال: الطلب الأول للخادم 1، الثاني للخادم 2، الثالث للخادم 3، الرابع للخادم 1، وهكذا).
   * **التبرير:** استراتيجية ممتازة ومثالية عندما تكون الخوادم الخلفية متطابقة في المواصفات (CPU/RAM) والمهام المطلوب معالجتها متشابهة في استهلاك الموارد.

2. **Least Connections (الأقل اتصالاً):**
   * **الآلية:** يوجه الطلب الجديد دائماً إلى الخادم الذي يمتلك حالياً أقل عدد من الاتصالات النشطة (Active Connections).
   * **التبرير:** استراتيجية متقدمة وديناميكية تمنع زيادة العبء على خادم معين إذا كانت بعض الطلبات التي يعالجها تأخذ وقتاً طويلاً (مثل توليد تقرير كبير أو معالجة معقدة)، بينما الخوادم الأخرى فارغة، مما يضمن توازن حقيقي للضغط الفعلي.

### الكود المسؤول عن تحقيقها:
* **خدمة الموازنة والتحكم:** [load-balancer.service.ts](file:///c:/Users/Zaid/parallel-programming/src/load-balancer/load-balancer.service.ts)
* **المتحكم ومنافذ الـ API:** [load-balancer.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/load-balancer/load-balancer.controller.ts)

مثال على خوارزمية **Least Connections** في الخدمة:
```typescript
async handleRequestLeastConnections(clientIp: string) {
  // البحث عن الخادم الذي يحتوي على أقل عدد اتصالات نشطة حالياً
  let targetServer = this.servers[0];
  for (let i = 1; i < this.servers.length; i++) {
    if (this.servers[i].activeConnections < targetServer.activeConnections) {
      targetServer = this.servers[i];
    }
  }

  targetServer.activeConnections++;
  targetServer.requestCount++;
  const currentActive = targetServer.activeConnections;

  // محاكاة معالجة الطلب بتأخير عشوائي
  const processingTime = Math.floor(Math.random() * 500) + 100;
  await new Promise((resolve) => setTimeout(resolve, processingTime));

  targetServer.activeConnections--;
  return { serverName: targetServer.name, activeConnections: currentActive };
}
```

---

## 7. التحكم في الأقفال (Concurrency Control / Locking)

### كيف تم تحقيقها:
تمت إضافة دعم كامل لنوعي الأقفال عند تحديث كميات المخزون الحساسة:

1. **القفل المتفائل (Optimistic Locking):**
   * **الفكرة:** لا يحظر السجل ولكن يفحص حقل الإصدار `version`. إذا تطابق رقم الإصدار الذي أرسله العميل مع الرقم الحالي في قاعدة البيانات، يكتمل الطلب ويزداد رقم الإصدار. وإلا يفشل الطلب برميه لـ `ConflictException (HTTP 409)`.
   * **التبرير:** ممتاز في الحالات التي يكون فيها التعديل المتزامن على نفس السجل نادراً، مما يحفظ أداء وسرعة النظام.

2. **القفل التشاؤمي (Pessimistic Locking):**
   * **الفكرة:** يقوم بحجز قفل متفرد (Mutex) فوراً عند بدء معالجة الطلب، مما يجبر أي طلب متزامن آخر على الانتظار حتى تنتهي العملية تماماً ويتم تحرير القفل.
   * **التبرير:** ممتاز جداً للعمليات شديدة الحساسية ولتجنب إرجاع أخطاء للمستخدمين بشكل متكرر عند تعديل نفس المنتج.

### الكود المسؤول عن تحقيقها:
* **تعديل كود الخدمة:** [products.service.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.service.ts)
* **نقاط الوصول:** [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
* **ملف الاختبار:** [test-locking.js](file:///c:/Users/Zaid/parallel-programming/test-locking.js)

---

## 8. سلامة المعاملات (Transaction Integrity / ACID)

### كيف تم تحقيقها:
لضمان سلامة العمليات المركبة (تخفيض المخزون + الدفع + إتمام الطلب) ككتلة واحدة غير قابلة للتجزئة (خاصية Atomicity في ACID):
* تم تطبيق نظام **لقطة الحالة (Snapshot)** قبل أي تعديل على المخزون.
* في حال فشل أي خطوة (مثل فشل عملية الدفع الإلكتروني)، يلتقط النظام الاستثناء في كتلة `catch` ويقوم بإرجاع قيم المخزون الأصلية المحفوظة في اللقطة (عملية **Rollback**)، مما يحافظ على اتساق البيانات.
* في حال نجاح كل الخطوات، يتم إتمام الطلب وتفريغ سلة الشراء (عملية **Commit**).

### الكود المسؤول عن تحقيقها:
* **تعديل كود خدمة الطلبات:** [orders.service.ts](file:///c:/Users/Zaid/parallel-programming/src/orders/orders.service.ts)
* **المتحكم:** [orders.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/orders/orders.controller.ts)
* **ملف الاختبار:** [test-acid.js](file:///c:/Users/Zaid/parallel-programming/test-acid.js)

---

## 9. توليد ضغط متزامن واختبار التحمل (Stress Testing & Concurrent Load)

### كيف تم تحقيقها:
لإثبات كفاءة النظام تحت الضغط والتأكد من عدم حدوث أعطال (Crashes) أو مشاكل في تضارب البيانات، تم إنشاء أداة اختبار (Stress Test Script) تولد ضغطاً متزامناً (Concurrent) وليس متسلسلاً (Sequential).
* تقوم الأداة بإرسال 100 طلب متزامن في نفس اللحظة لمحاكاة 100 مستخدم يحاولون شراء نفس المنتج.
* يتم مراقبة نتائج هذا الاختبار وطباعة مخرجات واضحة تتضمن:
  - إجمالي الطلبات (Total Requests)
  - الطلبات الناجحة (Success Requests)
  - الطلبات الفاشلة (Failed Requests)
  - متوسط وقت الاستجابة (Average Response Time)
  - حالة انهيار النظام من عدمه (System crashed or not)

### الكود المسؤول عن تحقيقها:
* **سكربت اختبار التحمل:** [stress-test.js](file:///c:/Users/Zaid/parallel-programming/stress-test.js)

---

## 10. قياس الأداء (Benchmarking) وتحليل الاختناقات (Bottlenecks)

### كيف تم تحقيقها (السيناريو قبل وبعد التحسين):
تم تطبيق سيناريو قياس ومقارنة متكامل للتعرف على نقاط الاختناق في النظام (Bottlenecks) وتحسينها:

1. **القياس المبدئي (Benchmark):** 
   تم توجيه عدد كبير من الطلبات المتزامنة لنقطة الوصول المباشرة لقاعدة البيانات لمحاكاة القراءة الكثيفة (Heavy I/O).
   
2. **تحديد الاختناق (Monitoring & Tracing):**
   تم تطبيق البرمجة الموجهة للجوانب (**AOP**) لمراقبة الأداء كأداة للـ Tracing و Logs. تم إنشاء `PerformanceInterceptor` (كـ Global Interceptor) لاعتراض الطلبات وتسجيل زمن تنفيذ كل مسار. من خلال السجلات (Logs)، لاحظنا بطء الاستجابة في الاستعلام المتكرر من قاعدة البيانات.

3. **إجراء التحسين (Optimization):**
   تم تطبيق نمط **Cache-Aside** باستخدام ذاكرة تخزين مؤقت (مثل Redis/In-Memory Cache). يتم أولاً البحث عن المنتج في الـ Cache، وإذا لم يوجد، يتم جلبه من قاعدة البيانات وتخزينه في الـ Cache للطلبات القادمة، مما يزيل عبء الاتصال المباشر بقاعدة البيانات.

4. **القياس بعد التحسين (Before & After):**
   تم إعادة نفس الاختبار على نقطة الوصول المحسنة (`/cached`)، وتظهر الأداة مقارنة واضحة توضح الفارق في:
   - عدد الطلبات في الثانية (Requests Per Second)
   - متوسط زمن الاستجابة (Average Latency)
   - وقت التنفيذ الإجمالي (Total Execution Time)

### الكود المسؤول عن تحقيقها:
* **سكربت القياس والمقارنة:** [test-benchmark.js](file:///c:/Users/Zaid/parallel-programming/test-benchmark.js)
* **تطبيق التحسين (Caching):** [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
* **نظام المراقبة (AOP Performance Interceptor):** [performance.interceptor.ts](file:///c:/Users/Zaid/parallel-programming/src/common/interceptors/performance.interceptor.ts)
```typescript
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PerformanceMonitor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(`[AOP] Route: ${request.method} ${request.url} - Execution Time: ${Date.now() - now}ms`);
      }),
    );
  }
}
```
