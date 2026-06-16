# توثيق متطلبات الأداء واختبار التحمل (Requirements 9 & 10)

يحتوي هذا الملف على شرح مفصل لكيفية تحقيق واختبار المتطلبات التالية:
1. **الطلب التاسع (Requirement 9):** اختبار التحمل وتوليد الضغط المتزامن (Stress & Concurrent Testing).
2. **الطلب العاشر (Requirement 10):** قياس الأداء وتحديد الاختناقات وتحسينها (Benchmarking, Bottleneck Identification & Optimization).

---

## 1. الطلب التاسع: اختبار التحمل وتوليد الضغط المتزامن (Stress Testing)

### أ) فكرة التطبيق:
الهدف هو إثبات قدرة النظام على التعامل مع الطلبات الضخمة المتزامنة (**Concurrent Load**) وليس المتتالية (Sequential)، والتحقق من عدم حدوث تضارب في البيانات أو انهيار للنظام.
* تم إعداد اختبار يرسل **100 طلب متزامن في نفس اللحظة** لمحاكاة 100 مستخدم حقيقي يقومون بالشراء في نفس الثانية.
* يتم تتبع النتائج وطباعة تقرير دقيق يحتوي على المقاييس التالية:
  1. **إجمالي الطلبات (Total Requests):** عدد المحاولات الكلية المرسلة (100 طلب).
  2. **الطلبات الناجحة (Success Requests):** الطلبات التي نجحت وحصلت على استجابة (HTTP 201).
  3. **الطلبات الفاشلة (Failed Requests):** الطلبات التي تم رفضها بسبب قيود المخزون أو رقم الإصدار (HTTP 400 أو 409).
  4. **متوسط زمن الاستجابة (Average Response Time):** الوقت المتوسط الذي استغرقه الطلب الواحد بالملي ثانية.
  5. **حالة انهيار النظام (System crashed or not):** التحقق مما إذا كانت الخوادم قد توقفت أو سقطت تحت الضغط (crashes).

### ب) الكود المسؤول عن الاختبار:
يتم تشغيل الاختبار من خلال ملف السكربت: [stress-test.js](file:///c:/Users/Zaid/parallel-programming/stress-test.js)

أهم أجزاء منطق فحص النتائج في السكربت:
```javascript
// قياس النتائج في اختبار القفل التشاؤمي
const successPess = resultsPess.filter(r => r.status === 201).length;
const failPess = resultsPess.filter(r => r.status === 400).length;
const crashPess = resultsPess.filter(r => r.status === 'FAILED_CONNECTION').length;

console.log(`\n📊 Results:`);
console.log(`   - Total Requests: ${CONCURRENT_USERS}`);
console.log(`   - Success Requests: ${successPess}`);
console.log(`   - Failed Requests: ${failPess}`);
console.log(`   - Average Response Time: ${(timePess / CONCURRENT_USERS).toFixed(2)} ms`);
console.log(`   - System crashed or not: ${crashPess > 0 ? 'Yes (Crashed)' : 'No (Did not crash)'}`);
```

### ج) كيفية تشغيل الاختبار والمخرجات المتوقعة:
1. تأكد من تشغيل الخادم الرئيسي للمشروع:
   ```bash
   npm run start
   ```
2. قم بتشغيل سكربت اختبار الضغط في نافذة أخرى:
   ```bash
   node stress-test.js
   ```

**المخرجات المتوقعة في منفذ الأوامر:**
```text
================================================================================
🚀 STRESS TEST: 100 SYNCHRONIZED USERS
================================================================================

--------------------------------------------------------------------------------
TEST 1: Pessimistic Locking (Initial Stock: 100)
--------------------------------------------------------------------------------
🔄 Database reset. Stock set to 100.
🚀 Sending 100 concurrent purchase requests...

📊 Results:
   - Total Requests: 100
   - Success Requests: 100
   - Failed Requests: 0
   - Average Response Time: 12.50 ms
   - System crashed or not: No (Did not crash)
✅ SUCCESS: Served all 100 users concurrently. Stock is exactly 0.
```

---

## 2. الطلب العاشر: قياس الأداء وتحديد الاختناقات (Benchmarking & Bottlenecks)

### أ) سيناريو العمل والتجربة (قبل وبعد التحسين):
لتحقيق هذا المتطلب، قمنا بمحاكاة دورة حياة تحسين الأداء الكاملة:

1. **القياس المبدئي (First Measure - Benchmark Before):**
   * نقوم بتوجيه **200 طلب متزامن** مباشرة إلى قاعدة البيانات الوهمية لقراءة معلومات منتج معين (Heavy DB I/O simulation).
   * نقوم بقياس الأداء والزمن المستغرق ومعدل الطلبات في الثانية (Requests Per Second).

2. **تحديد نقطة الاختناق (Identify Bottleneck):**
   * نستخدم مفهوم **البرمجة الموجهة للجوانب (AOP)** لمراقبة أداء الخادم وقياس زمن معالجة كل مسار.
   * تم بناء [PerformanceInterceptor](file:///c:/Users/Zaid/parallel-programming/src/common/interceptors/performance.interceptor.ts) لاعتراض الطلبات وحساب الفارق الزمني وطباعته في السجلات (Logs) دون تعديل كود العمل الأساسي.
   * من خلال السجلات المطبوعة، نلاحظ بوضوح زمن التأخير العالي المترتب على القراءة المباشرة من قاعدة البيانات عند تكرار الاستعلام لنفس السجل.

3. **تطبيق التحسين (Optimization - Cache-Aside Pattern):**
   * قمنا بتحسين نقطة الوصول عبر تطبيق التخزين المؤقت (Redis/In-Memory Cache).
   * عند طلب معلومات المنتج، يبحث النظام أولاً في الـ Cache، فإذا وجده (Cache Hit) يرجعه فوراً، وإلا (Cache Miss) يجلبه من قاعدة البيانات ويخزنه في الـ Cache للمرات القادمة.

4. **القياس بعد التحسين (Measure Again - Benchmark After):**
   * نقوم بإعادة نفس الـ 200 طلب متزامن ولكن على نقطة الوصول المحسنة والمخزنة مؤقتاً (`/cached`).
   * تظهر مقارنة واضحة (Before vs After) توضح حجم القفزة الكبيرة في الأداء.

### ب) الأكواد المسؤولة عن المراقبة والتحسين:
* **نظام التتبع والمراقبة (AOP Tracing Interceptor):** [performance.interceptor.ts](file:///c:/Users/Zaid/parallel-programming/src/common/interceptors/performance.interceptor.ts)
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
* **تطبيق التحسين (Products Controller Cached Route):** [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
```typescript
@Get(':id/cached')
async getProductCached(@Param('id') id: string) {
  return this.productsService.findOneCached(id);
}
```

### ج) كيفية تشغيل المقارنة والمخرجات المتوقعة:
1. قم بتشغيل الخادم الرئيسي: `npm run start`
2. قم بتشغيل أداة قياس الأداء في نافذة أخرى:
   ```bash
   node test-benchmark.js
   ```

**المخرجات المتوقعة في منفذ الأوامر (مقارنة واضحة للـ Before & After):**
```text
================================================================================
🚀 RUNNING BENCHMARK: BEFORE (No Cache)
   URL: http://127.0.0.1:3000/products/1
   Concurrency: 200 simultaneous requests
================================================================================
📊 RESULTS:
   - Total Requests:    200
   - Successes (200s):  200
   - Errors/Failures:   0
   - Total Time Taken:  820 ms
   - Requests/Second:   243.90 req/sec

⏱️  LATENCY:
   - Average Latency:   650.00 ms
   - Min Latency:       400 ms
   - Max Latency:       810 ms
================================================================================

================================================================================
🚀 RUNNING BENCHMARK: AFTER (Redis Cache)
   URL: http://127.0.0.1:3000/products/1/cached
   Concurrency: 200 simultaneous requests
================================================================================
📊 RESULTS:
   - Total Requests:    200
   - Successes (200s):  200
   - Errors/Failures:   0
   - Total Time Taken:  45 ms
   - Requests/Second:   4444.44 req/sec

⏱️  LATENCY:
   - Average Latency:   15.20 ms
   - Min Latency:       5 ms
   - Max Latency:       42 ms
================================================================================

================================================================================
🏆 FINAL COMPARISON (BOTTLENECK vs. OPTIMIZED)
================================================================================
                       | Before (No Cache) | After (Redis Cache) |
------------------------------------------------------------------
 Requests Per Second   | 243.90            | 4444.44             |
 Average Latency       | 650.00 ms         | 15.20 ms            |
 Total Execution Time  | 820 ms            | 45 ms               |

🚀 PERFORMANCE GAIN: The optimized endpoint is 18.22x faster!
================================================================================
```
