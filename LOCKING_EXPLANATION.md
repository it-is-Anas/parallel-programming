# توثيق حل متطلب التحكم في الأقفال (Concurrency Control)

يحتوي هذا الملف على شرح مفصل لكيفية تطبيق مفهومي **القفل المتفائل (Optimistic Locking)** و **القفل التشاؤمي (Pessimistic Locking)** عند تحديث كميات المخزون الحساسة لمنع التعارض وحماية سلامة البيانات، بالإضافة إلى كيفية تشغيل وفحص هذا الحل.

---

## 1. ما الفرق بين القفل المتفائل والتشاؤمي هندسياً؟

عندما يحاول عدة مستخدمين تعديل نفس كمية المخزون لمنتج حساس في نفس الوقت، يتوفر لدينا استراتيجيتان للتعامل مع هذا التزامن:

### أ. القفل المتفائل (Optimistic Locking)
* **الفكرة:** يفترض النظام أن التعارضات نادرة الحدوث، لذلك لا يقوم بحجز أقفال تمنع الآخرين من القراءة أو التعديل أثناء القراءة. وبدلاً من ذلك، يتم إضافة حقل **رقم الإصدار (Version)** لكل سجل.
* **آلية التحقق:** عند تحديث المخزون، يتحقق النظام من أن رقم الإصدار الحالي في قاعدة البيانات يطابق رقم الإصدار الذي قرأه العميل في البداية.
  * إذا تطابقا، ينجح التحديث ويتم زيادة رقم الإصدار بمقدار 1.
  * إذا لم يتطابقا (لأن عميلاً آخر قام بالتحديث في هذه الأثناء)، يرفض النظام التحديث ويرمي خطأ تعارض (`ConflictException`).
* **التبرير الهندسي:** ممتاز في الأنظمة التي تكون فيها القراءة أكثر بكثير من الكتابة، وتكون نسبة التعارضات فيها منخفضة، مما يوفر أداءً أفضل لعدم وجود حظر للعمليات.

### ب. القفل التشاؤمي (Pessimistic Locking)
* **الفكرة:** يفترض النظام أن حدوث التعارضات أمر وارد جداً وخطير، لذلك يقوم بحظر المورد بالكامل (حجز قفل متفرد) بمجرد بدء العملية لمنع أي مستخدم آخر من الوصول إليه حتى تنتهي المعاملة تماماً.
* **آلية التحقق:** يستخدم النظام أداة قفل (مثل الـ Mutex في كودنا) لحماية السجل. أي عملية متزامنة أخرى ستنتظر في الطابور حتى يتم تحرير القفل بالكامل.
* **التبرير الهندسي:** ممتاز للعمليات الحساسة جداً التي لا يمكن تحمل الأخطاء فيها مطلقاً أو عند وجود ضغط تحديث كتابة مكثف جداً على نفس السجل لمنع حدوث أخطاء التعارض وإفشال طلبات المستخدمين بشكل متكرر.

---

## 2. هيكلية التعليمات البرمجية (Code Structure)

تم دمج الحل وتعديله على مستوى قاعدة البيانات الوهمية وخدمة المنتجات:

### 1. إضافة حقل الإصدار في قاعدة البيانات: [db.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/db.service.ts)
تم تعديل واجهة المنتج `Product` لتشمل حقل `version: number`:
```typescript
export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  version: number; // حقل الإصدار لدعم القفل المتفائل
}
```

### 2. معالجة القفل المتفائل والتشاؤمي في الخدمة: [products.service.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.service.ts)
* **كود القفل المتفائل (`updateStockOptimistic`):**
```typescript
async updateStockOptimistic(productId: string, quantity: number, clientVersion: number) {
  const product = this.db.products.get(productId);
  
  // التحقق من توافق رقم الإصدار (Version Check)
  if (product.version !== clientVersion) {
    throw new ConflictException("Optimistic lock failed: Version mismatch!");
  }
  
  product.stock -= quantity;
  product.version += 1; // زيادة الإصدار
  return { message: 'Stock updated successfully', newStock: product.stock };
}
```

* **كود القفل التشاؤمي (`updateStockPessimistic`):**
```typescript
async updateStockPessimistic(productId: string, quantity: number) {
  const mutex = this.concurrencyService.getProductMutex(productId);
  const release = await mutex.acquire(); // حجز القفل بشكل تشاؤمي

  try {
    const product = this.db.products.get(productId);
    product.stock -= quantity;
    product.version += 1;
    return { message: 'Stock updated successfully', newStock: product.stock };
  } finally {
    release(); // تحرير القفل في النهاية
  }
}
```

### 3. نقاط الوصول في المتحكم: [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
* `POST /products/:id/buy-optimistic` لاستدعاء القفل المتفائل.
* `POST /products/:id/buy-pessimistic` لاستدعاء القفل التشاؤمي.

---

## 3. كيفية تشغيل وفحص الكود (How to Run)

### الخطوة 1: تشغيل خادم NestJS الرئيسي
تأكد من تشغيل السيرفر في نافذة ترمينال مستقلة:
```bash
npm run start
```

### الخطوة 2: تشغيل نص محاكاة الأقفال
افتح نافذة ترمينال ثانية وشغّل الأمر التالي:
```bash
node test-locking.js
```

---

## 4. المخرجات المتوقعة (Expected Output)

عند تشغيل الاختبار، سترى التالي:
1. **في اختبار القفل المتفائل (Optimistic Locking):** ستنجح عملية واحدة فقط من أصل 5 طلبات متزامنة لأنها أول من قام بتعديل الإصدار، بينما ستفشل الـ 4 الأخرى بالخطأ `409 ConflictException` بسبب عدم تطابق رقم الإصدار.
2. **في اختبار القفل التشاؤمي (Pessimistic Locking):** ستنتظر جميع الطلبات في طابور، وستنجح العملية الأولى في الخصم (لأن المخزون = 1)، بينما ستفشل بقية الطلبات الـ 4 الأخرى بالخطأ `400 BadRequestException` (بسبب عدم كفاية المخزون) بعد أن يتم فك قفلها بالترتيب وبشكل متسلسل ومنظم.
