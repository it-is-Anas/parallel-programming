# المتطلب السادس: استراتيجية التخزين المؤقت الموزع (Redis Caching Layer)

يشرح هذا المستند التصميم والهيكلية والتحقق من صحة استراتيجية التخزين المؤقت الموزع التي تم تنفيذها في هذا المشروع لتلبية **المتطلب السادس**.

---

## 1. التصميم والاستراتيجية الهيكلية

في الأنظمة ذات الطلبات المتزامنة العالية، يؤدي الاستعلام من محركات قواعد البيانات مباشرة لكل طلب إلى خلق اختناقات في الأداء (Bottlenecks) وزيادة الحمل على النظام. لتحسين أداء القراءة، قمنا بدمج طبقة تخزين مؤقت (Caching Layer) تحاكي **Redis** باستخدام نمط **Cache-Aside Pattern**.

### أ. نمط Cache-Aside (التحميل المتأخر - Lazy Loading)
1. **استعلام التخزين المؤقت:** عندما يطلب مستخدم تفاصيل منتج (`GET /products/:id/cached`)، يقوم النظام بالاستعلام من طبقة التخزين المؤقت أولاً.
2. **العثور في الذاكرة المؤقتة (Cache Hit):** إذا تم العثور على المنتج في التخزين المؤقت، يتم إرجاعه فوراً (وقت الاستجابة ~2ms).
3. **عدم العثور في الذاكرة المؤقتة (Cache Miss):** إذا لم يكن المنتج في التخزين المؤقت، يقوم النظام بالاستعلام من قاعدة البيانات (والذي يتضمن تأخيراً محاكياً للاستعلام `500ms`). ثم يقوم بتخزين المنتج المسترد في التخزين المؤقت مع **مدة صلاحية (TTL) تبلغ 60 ثانية**، وبعدها يعيده للمستخدم.

### ب. إبطال التخزين المؤقت (منع البيانات القديمة - Cache Invalidation)
المشكلة الشائعة في التخزين المؤقت هي **البيانات القديمة (Stale Data)** (على سبيل المثال، يشتري عميل منتجاً مما يقلل المخزون، لكن المستخدمين الآخرين ما زالوا يرون المخزون القديم من التخزين المؤقت).
لحل هذه المشكلة:
- كلما تم تحديث مخزون المنتج (عبر **القفل المتفائل (Optimistic Locking)** أو **القفل المتشائم (Pessimistic Locking)**)، يقوم النظام تلقائياً **بإبطال (حذف)** الإدخال الخاص بالمنتج من التخزين المؤقت (`redis.del(productId)`).
- جلب المنتج في المرة القادمة سيؤدي إلى **Cache Miss**، مما يضطره إلى جلب المخزون الجديد من قاعدة البيانات، وإعادة تخزين البيانات المُحدثة.

### ج. اختيار التقنيات: `ioredis` و `ioredis-mock`
- **الجاهزية للإنتاج:** تستخدم شيفرة المشروع `ioredis`، وهو العميل القياسي لـ Redis لبيئة Node.js.
- **تسهيل التطوير:** من أجل الاختبار والتقييم، قمنا بدمج `ioredis-mock`. هذا يُشغل خادماً وهمياً لـ Redis في الذاكرة بجميع ميزاته، مما يلغي الحاجة إلى تشغيل مثيل Redis حقيقي أو حاوية Docker على الجهاز المضيف. يمكنك التبديل إلى خادم Redis حقيقي عن طريق إزالة التعليق عن سطر واحد في [redis.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/redis.service.ts).

---

## 2. تعديلات الكود والهيكلية

تتكون وحدة التخزين المؤقت من التحديثات التالية:

1. **خدمة Redis:** [redis.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/redis.service.ts)
   تقوم بتهيئة عميل Redis (الوهمي/الحقيقي) وتوفر دوال أساسية نقية مثل `get`، `set` (مع تحديد TTL)، و `del`.
2. **محاكاة تأخير قاعدة البيانات:** [db.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/db.service.ts)
   تضيف الدالة `findProductWithDelay(id)` لمحاكاة تأخير في استجابة قاعدة البيانات بمقدار `500ms`.
3. **منطق التخزين المؤقت والإبطال:** [products.service.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.service.ts)
   - تطبيق نمط Cache-Aside.
   - حذف المنتج المُخزن مؤقتاً عند نجاح التحديثات.
4. **كشف نقطة النهاية (Endpoint Exposure):** [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
   - الكشف عن مسار `GET /products/:id/cached`.

---

## 3. كيفية تشغيل اختبارات التحقق قبل وبعد التطبيق

للتحقق من أن طبقة التخزين المؤقت تعمل وتبطل البيانات بشكل صحيح، اتبع الخطوات التالية:

### الخطوة الأولى: بدء تشغيل تطبيق NestJS
افتح الطرفية (Terminal) وشغل الخادم:
```bash
npm run start
```
*ملاحظة: تأكد من تشغيل `npm install` أولاً لتثبيت التبعيات الجديدة `ioredis` و `ioredis-mock`.*

### الخطوة الثانية: تشغيل سكربت اختبار التخزين المؤقت
في نافذة طرفية منفصلة، قم بتشغيل الاختبار الآلي:
```bash
node test-caching
```

### المخرجات المتوقعة وشرحها

```text
================================================================
   STARTING DISTRIBUTED CACHING VERIFICATION TESTS (REQ 6)      
================================================================

--- TEST 2: Cache-Aside Lifecycle (findOneCached) ---
Request 1: Fetching Laptop (ID: 1) for the first time...
Result: Source = "Database", Stock = 10, Version = 1
Response Time: 512ms (Expected: ~500ms due to Database delay)

Request 2: Fetching Laptop (ID: 1) again (should hit Cache)...
Result: Source = "Cache (Redis)", Stock = 10, Version = 1
Response Time: 3ms (Expected: <15ms - Fast Cache Hit)

Request 3: Fetching Laptop (ID: 1) third time (should hit Cache)...
Result: Source = "Cache (Redis)", Stock = 10, Version = 1
Response Time: 1ms (Expected: <15ms - Fast Cache Hit)

--- TEST 3: Cache Invalidation Scenario (Stock Update) ---
We will purchase 2 units of Laptop (ID: 1) using Optimistic Locking.
This should modify the stock in the database and INVALIDATE the cache.
Update Result: Stock updated successfully using Optimistic Locking
New Database Stock: 8, New Version: 2

Request 4: Fetching Laptop (ID: 1) immediately after update...
The cache was invalidated, so it must query the Database again.
Result: Source = "Database", Stock = 8, Version = 2
Response Time: 504ms (Expected: ~500ms - Database Query for fresh data)

Request 5: Fetching Laptop (ID: 1) again...
Result: Source = "Cache (Redis)", Stock = 8, Version = 2
Response Time: 2ms (Expected: <15ms - Cache Hit with updated stock)
```

- **قبل التخزين المؤقت (الطلب 1):** يستعلم التطبيق من قاعدة البيانات مباشرة، ويستغرق حوالي **~500ms**.
- **بعد التخزين المؤقت (الطلبات 2 و 3):** القراءات اللاحقة يتم جلبها من التخزين المؤقت (Redis cache)، وتخدم الطلبات على الفور في غضون **~1-3ms**.
- **حداثة البيانات / الإبطال (الطلب 4 و 5):** عندما يتغير المخزون، يتم إبطال التخزين المؤقت القديم. الاستعلام التالي يضطر لجلب البيانات من قاعدة البيانات (**~500ms**) لتحميل مستوى المخزون الجديد (من `10` إلى `8`)، مما يضمن تناسقاً تاماً للبيانات.
