# التحكم في العمليات المتزامنة وحجز الأقفال (Concurrency Control & Locking)

يواجه مطورو الأنظمة الحساسة (مثل أنظمة التجارة الإلكترونية وإدارة المخزون) تحديات كبيرة عند محاولة عدة مستخدمين تحديث نفس السجل في قاعدة البيانات في الوقت ذاته (Race Conditions). لحل هذه المشكلة ومنع تعارض البيانات أو بيع منتجات غير متوفرة في المخزون، تم تطبيق استراتيجيتين رئيسيتين للتحكم في الأقفال: **التحكم في الأقفال المتفائل (Optimistic Locking)** و**التحكم في الأقفال التشاؤمي (Pessimistic Locking)**.

يحتوي هذا الملف على شرح تفصيلي لكيفية تطبيق كلا المفهومين في مشروعنا، بالإضافة إلى كيفية تشغيل الاختبارات الخاصة بهما وتفسير مخرجاتها.

---

## 1. المفاهيم الهندسية للأقفال (Theoretical Concepts)

### أ. القفل المتفائل (Optimistic Concurrency Control / Locking)
* **الفكرة:** يفترض هذا الأسلوب أن التعارضات بين العمليات المتزامنة نادرة الحدوث. لذا، لا يتم حظر السجل أو منع الآخرين من القراءة أو التعديل أثناء تنفيذ العملية.
* **آلية العمل:** 
  1. يتم إضافة حقل رقم الإصدار (`version`) لكل منتج في قاعدة البيانات.
  2. عندما يقرأ العميل بيانات المنتج، يحصل على رقم الإصدار الحالي (مثلاً `version = 1`).
  3. عند إرسال طلب التحديث، يرسل العميل رقم الإصدار الذي قرأه معه.
  4. يتحقق النظام قبل الحفظ: إذا كان الإصدار في قاعدة البيانات لا يزال مطابِقاً للإصدار المرسل من العميل، يتم التحديث بنجاح ويتم زيادة رقم الإصدار بمقدار 1 (`version = 2`).
  5. إذا كان الإصدار في قاعدة البيانات قد تغير (لأن عميلاً آخر قام بالتحديث في هذه الأثناء)، يرفض النظام العملية ويرمي خطأ تعارض (`ConflictException - 409`).
* **حالات الاستخدام:** الأنظمة ذات القراءة المكثفة والكتابة المنخفضة، وحيث تكون احتمالية تعارض الطلبات ضئيلة جداً.

### ب. القفل التشاؤمي (Pessimistic Concurrency Control / Locking)
* **الفكرة:** يفترض هذا الأسلوب أن التعارضات شائعة الحدوث وقد تؤدي لنتائج غير مرغوبة، لذا يقوم بحظر السجل (Locking) بمجرد بدء العملية لمنع أي طلبات أخرى من الوصول إليه أو تعديله حتى تنتهي المعاملة الحالية تماماً.
* **آلية العمل:**
  1. نستخدم كائن حظر متفرد (مثل الـ `Mutex` أو الأقفال الخاصة بقاعدة البيانات).
  2. عند وصول طلب لتحديث منتج ما، يقوم النظام بحجز القفل الخاص بهذا المنتج (`acquire`).
  3. أي طلبات متزامنة أخرى تحاول الوصول لنفس المنتج يتم وضعها في طابور الانتظار (Queue) ولن يتم معالجتها حتى يقوم الطلب الأول بتحرير القفل (`release`).
* **حالات الاستخدام:** العمليات عالية الحساسية (مثل خصم الأرصدة المالية أو حجز المقاعد أو تحديث المخازن المحدودة جداً تحت ضغط طلبات متزامن وهائل).

---

## 2. تفاصيل التطبيق في الكود (Implementation Details)

تم تطبيق كلا المفهومين على مستوى قاعدة البيانات الوهمية وخدمة المنتجات والمتحكم:

### 1. إعداد هيكل المنتج (Product Schema)
تمت إضافة حقل `version` إلى واجهة المنتج لدعم القفل المتفائل.
* الملف المسؤول: [db.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/db.service.ts)
```typescript
export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  version: number; // حقل الإصدار لدعم القفل المتفائل
}
```

### 2. منطق خدمة المنتجات (Products Service)
يحتوي الملف [products.service.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.service.ts) على الدوال البرمجية التي تطبق كلا الأسلوبين:

#### أ. تطبيق القفل المتفائل (`updateStockOptimistic`):
```typescript
async updateStockOptimistic(productId: string, quantity: number, clientVersion: number) {
  const product = this.db.products.get(productId);
  if (!product) {
    throw new BadRequestException('Product not found');
  }

  // محاكاة تأخير بسيط (300ms) لإظهار التعارض بوضوح أثناء التوازي
  await new Promise((resolve) => setTimeout(resolve, 300));

  // التحقق من توافق الإصدار (Version Check)
  if (product.version !== clientVersion) {
    throw new ConflictException(
      `Optimistic lock failed: Version mismatch! Product ID ${productId} has version ${product.version}, but client submitted version ${clientVersion}.`
    );
  }

  if (product.stock < quantity) {
    throw new BadRequestException(`Insufficient stock for product ${productId}`);
  }

  // تحديث المخزون وزيادة رقم الإصدار
  product.stock -= quantity;
  product.version += 1;

  // إلغاء صلاحية التخزين المؤقت (Cache Invalidation) لمنع البيانات القديمة
  const cacheKey = `product:${productId}`;
  await this.redis.del(cacheKey);

  return {
    message: 'Stock updated successfully using Optimistic Locking',
    newStock: product.stock,
    newVersion: product.version,
  };
}
```

#### ب. تطبيق القفل التشاؤمي (`updateStockPessimistic`):
نستخدم هنا خدمة التحكم بالتزامن [concurrency.service.ts](file:///c:/Users/Zaid/parallel-programming/src/concurrency/concurrency.service.ts) التي توفر قفل `Mutex` لكل منتج بناءً على معرفه الفريد (`productId`) باستخدام مكتبة `async-mutex`.
```typescript
async updateStockPessimistic(productId: string, quantity: number) {
  const mutex = this.concurrencyService.getProductMutex(productId);
  
  // حجز القفل بشكل تشاؤمي (الطلبات الأخرى ستنتظر هنا في الطابور)
  const release = await mutex.acquire();

  try {
    const product = this.db.products.get(productId);
    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // محاكاة معالجة أو دفع
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock for product ${productId}`);
    }

    product.stock -= quantity;
    product.version += 1;

    // إلغاء صلاحية التخزين المؤقت (Cache Invalidation)
    const cacheKey = `product:${productId}`;
    await this.redis.del(cacheKey);

    return {
      message: 'Stock updated successfully using Pessimistic Locking',
      newStock: product.stock,
      newVersion: product.version,
    };
  } finally {
    // تحرير القفل بشكل حتمي عند انتهاء المعاملة (نجاحاً أو فشلاً)
    release();
  }
}
```

### 3. نقاط الوصول في المتحكم (Endpoints)
تم توفير نقاط وصول مخصصة في [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts) لاستدعاء العمليات:
* **القفل المتفائل:** `POST /products/:id/buy-optimistic` (يستقبل `quantity` و `version` في جسم الطلب).
* **القفل التشاؤمي:** `POST /products/:id/buy-pessimistic` (يستقبل `quantity` في جسم الطلب).

---

## 3. كيفية تشغيل الفحص والاختبار (How to Run Tests)

يحتوي ملف الاختبار [test-locking.js](file:///c:/Users/Zaid/parallel-programming/test-locking.js) على محاكاة لـ 5 طلبات متزامنة يتم إرسالها في نفس اللحظة لاختبار كلا المفهومين.

### الخطوات المطلوبة لتشغيل الاختبار:

1. **تشغيل الخادم الرئيسي (NestJS Server):**
   تأكد من تشغيل السيرفر أولاً عبر فتح نافذة ترمينال جديدة وتشغيل الأمر التالي في مجلد المشروع:
   ```bash
   npm run start
   ```

2. **تشغيل نص الاختبار (Locking Test Script):**
   افتح نافذة ترمينال أخرى وشغّل الأمر التالي لتشغيل محاكاة الطلبات المتزامنة:
   ```bash
   node test-locking.js
   ```

---

## 4. النتائج المتوقعة وكيفية تفسيرها (Expected Outputs)

عند تشغيل الاختبار بنجاح، ستظهر النتائج كالتالي في شاشة المخرجات:

### أولاً: نتائج القفل المتفائل (Optimistic Locking Results)
يقوم الاختبار بإرسال 5 طلبات متزامنة لشراء كمية `1` من المنتج رقم `3` (الذي يحتوي مخزون قدره `1` ورقم إصدار `1`) وكلها ترسل رقم الإصدار `1`:
* **النتيجة:** تنجح عملية واحدة فقط (الطلب الأسرع وصولاً لقاعدة البيانات) ويتم تعديل المخزون إلى `0` والإصدار إلى `2`.
* **الفشل المنظم:** تفشل الطلبات الأربعة الأخرى مباشرة وترمي خطأ `HTTP 409 Conflict` مع رسالة توضح عدم تطابق الإصدار (لأنها حاولت التحديث اعتماداً على الإصدار `1` بينما أصبح الإصدار الفعلي في قاعدة البيانات `2`).

### ثانياً: نتائج القفل التشاؤمي (Pessimistic Locking Results)
يتم إعادة تصفير حالة الخادم ثم إرسال 5 طلبات متزامنة لشراء كمية `1` من المنتج رقم `3` (المخزون = `1`):
* **الترتيب والتسلسل:** نظراً لاستخدام الـ `Mutex` يتم معالجة الطلبات بالتسلسل (واحداً تلو الآخر).
* **النتيجة:** الطلب الأول الذي حجز القفل ينجح في الشراء وتحديث المخزون ليصبح `0`.
* **التعامل المنظم:** الطلبات الأربعة التالية تدخل تباعاً بعد فك القفل وتتحقق من المخزون فتجده `0` وتفشل برمي خطأ `HTTP 400 Bad Request` (بسبب عدم كفاية المخزون) بدلاً من حدوث تعارض في الإصدارات أو بيع بالسالب.
