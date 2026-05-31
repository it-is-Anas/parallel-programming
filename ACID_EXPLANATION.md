# توثيق حل متطلب سلامة المعاملات (Transaction Integrity / ACID)

يحتوي هذا الملف على شرح مفصل لكيفية ضمان سلامة العمليات المركبة (تخفيض المخزون + معالجة الدفع + إتمام الطلب) بحيث تنجح كلها معاً (Commit) أو تفشل وتتراجع كلها معاً (Rollback) لمنع حدوث أي تضارب أو عدم اتساق في البيانات، وكيفية تشغيل وفحص هذا الحل.

---

## 1. مفهوم سلامة المعاملات (ACID) في المشروع

في العمليات المالية والتجارية المركبة، لا يمكننا السماح بخصم كمية المنتج من المخزون إذا كانت عملية الدفع الإلكتروني قد فشلت في النهاية. يجب أن نضمن خاصية **الذرية (Atomicity)** (الكل أو لا شيء).

بما أن المشروع يستخدم قاعدة بيانات وهمية في الذاكرة (`DbService` المستندة إلى JavaScript `Map`)، قمنا بمحاكاة هذه الميزة من خلال:
1. **أخذ لقطة للحالة (Snapshot):** قبل إجراء أي تعديل على مخزون المنتجات المتأثرة بالطلب، يتم حفظ كمياتها الحالية في خريطة مؤقتة (`stockSnapshot`).
2. **إجراء التعديلات:** نقوم بخصم المخزون والتحقق من الكميات بشكل اعتيادي.
3. **تنفيذ الدفع:** يتم استدعاء بوابة الدفع (محاكاة).
4. **تثبيت العملية (Commit):** في حال نجاح الدفع، يتم تصفير سلة المشتريات وإتمام الطلب.
5. **التراجع عن العملية (Rollback):** في حال حدوث أي خطأ أو فشل في الدفع، يتم التقاط الخطأ في كتلة `catch` وإرجاع كميات المخزون المحفوظة في الـ `stockSnapshot` إلى قيمتها الأصلية تماماً لمنع حدوث خلل.

---

## 2. هيكلية التعليمات البرمجية (Code Structure)

تم تطبيق وضمان سلامة المعاملة داخل ملفات الطلبات:

### 1. في خدمة الطلبات: [orders.service.ts](file:///C:/Users/admin/Desktop/New%20folder%20%282%29/parallel-programming/src/orders/orders.service.ts)

* **دالة الدفع الآمنة (ACID Mode):**
```typescript
async checkout(userId: string, simulatePaymentFailure = false) {
  // ...
  const stockSnapshot = new Map<string, number>();

  try {
    for (const item of sortedCart) {
      // حفظ الحالة الأصلية للمخزون لكل منتج
      const product = this.db.products.get(item.productId);
      if (product) {
        stockSnapshot.set(item.productId, product.stock);
      }
    }

    // خصم الكمية من المخزون
    for (const item of cart) {
      const product = this.db.products.get(item.productId);
      if (product) product.stock -= item.quantity;
    }

    // محاكاة الدفع الإلكتروني
    if (simulatePaymentFailure) {
      throw new BadRequestException('Payment failed!');
    }

    // إفراغ السلة (Commit)
    this.db.carts.set(userId, []);
  } catch (error) {
    // التراجع (Rollback) في حال فشل أي خطوة
    for (const [productId, oldStock] of stockSnapshot.entries()) {
      const product = this.db.products.get(productId);
      if (product) {
        product.stock = oldStock; // استعادة المخزون الأصلي
      }
    }
    throw error;
  }
}
```

* **دالة الدفع غير الآمنة (NON-ACID Mode):**
تقوم بخصم المخزون فوراً دون القدرة على التراجع في حال فشل الدفع، مما يؤدي لسرقة المخزون من العميل دون إتمام الطلب.

### 2. في متحكم الطلبات: [orders.controller.ts](file:///C:/Users/admin/Desktop/New%20folder%20%282%29/parallel-programming/src/orders/orders.controller.ts)
* `POST /orders/checkout/:userId?simulatePaymentFailure=true` لاختبار التراجع التلقائي (ACID).
* `POST /orders/checkout-no-acid/:userId?simulatePaymentFailure=true` لاختبار الخلل وضياع المخزون عند غياب المعاملات (NON-ACID).

---

## 3. كيفية تشغيل وفحص الكود (How to Run)

### الخطوة 1: تشغيل خادم NestJS الرئيسي
تأكد من تشغيل السيرفر في نافذة ترمينال مستقلة:
```bash
npm run start
```

### الخطوة 2: تشغيل نص محاكاة ACID
افتح نافذة ترمينال ثانية وشغّل الأمر التالي:
```bash
node test-acid
```

---

## 4. المخرجات المتوقعة (Expected Output)

عند تشغيل الاختبار، ستشاهد التالي:
1. **في وضع ACID:** يفشل الدفع، ويقوم السيرفر بإعادة المخزون فوراً إلى 10 (النجاح في الحفاظ على سلامة واتساق البيانات).
2. **في وضع NON-ACID:** يفشل الدفع، ولكن المخزون يبقى 9 (حدوث تضارب وعدم اتساق في البيانات بسبب غياب آلية الـ Rollback).
