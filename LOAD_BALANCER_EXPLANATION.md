# توثيق حل المتطلب الخامس: توزيع الأحمال (Load Distribution)

يحتوي هذا الملف على شرح مفصل لكيفية محاكاة موزع الأحمال (Load Balancer) وتوزيع الطلبات على عدة خوادم ويب خلفية وهمية، مع توضيح استراتيجيات التوزيع وتبريرها البرمجي، وكيفية تشغيل وفحص هذا الحل.

---

## 1. فكرة التصميم واستراتيجيات التوزيع المستخدمة

يهدف هذا القسم إلى محاكاة بيئة إنتاجية واقعية يتم فيها توزيع طلبات المستخدمين القادمة من عناوين IP مختلفة على 3 خوادم ويب خلفية وهمية:
* `Server-Alpha (Instance 1)`
* `Server-Beta (Instance 2)`
* `Server-Gamma (Instance 3)`

تم دعم خيارين لتوزيع الأحمال في الخدمة مع تقديم تبرير هندسي لكل منهما:

### أ. خوارزمية Round Robin (التناوب الدائري)
* **كيف تعمل:** يوزع الطلبات بالتناوب وبشكل متساوٍ على الخوادم المتاحة بالتسلسل (الطلب 1 إلى الخادم Alpha، الطلب 2 إلى Beta، الطلب 3 إلى Gamma، الطلب 4 يعود إلى Alpha، وهكذا).
* **التبرير الهندسي:** تعد هذه الخوارزمية مثالية عندما تكون الخوادم الخلفية متماثلة تماماً في مواصفاتها التقنية (قدرة المعالجة وسعة الذاكرة) وعندما تكون الطلبات متشابهة تقريباً في استهلاك الموارد ولا تتطلب معالجات زمنية متفاوتة.

### ب. خوارزمية Least Connections (الأقل اتصالاً)
* **كيف تعمل:** يتم توجيه الطلب الوارد فوراً إلى الخادم الذي يمتلك حالياً أقل عدد من الاتصالات الفعّالة والنشطة (`activeConnections`).
* **التبرير الهندسي:** تعد هذه الاستراتيجية أكثر ديناميكية وذكاءً في بيئات العمل الحقيقية؛ حيث تمنع حدوث تكدس للطلبات على خادم معين في حال كانت بعض الطلبات التي يعالجها تتطلب وقتاً طويلاً (مثل عمليات الحساب الثقيلة أو توليد التقارير الضخمة)، بينما الخوادم الأخرى متفرغة تماماً.

---

## 2. هيكلية التعليمات البرمجية (Code Structure)

تم تنظيم المحاكاة داخل وحدة (Module) مستقلة باسم `load-balancer` وتتألف من الملفات التالية:

### 1. الخدمة: [load-balancer.service.ts](file:///C:/Users/admin/Desktop/New%20folder%20%282%29/parallel-programming/src/load-balancer/load-balancer.service.ts)
تقوم بتخزين حالة الخوادم ومحاكاة عمليات المعالجة بتأخير زمني عشوائي لكل طلب لإظهار سلوك الخوارزميات بشكل ديناميكي وواقعي.
```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface VirtualServer {
  id: string;
  name: string;
  activeConnections: number;
  requestCount: number;
}

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);

  // محاكاة الخوادم
  private readonly servers: VirtualServer[] = [
    { id: 'srv-1', name: 'Server-Alpha (Instance 1)', activeConnections: 0, requestCount: 0 },
    { id: 'srv-2', name: 'Server-Beta (Instance 2)', activeConnections: 0, requestCount: 0 },
    { id: 'srv-3', name: 'Server-Gamma (Instance 3)', activeConnections: 0, requestCount: 0 },
  ];

  private roundRobinIndex = 0;

  getServersState() { return this.servers; }

  resetStats() {
    for (const server of this.servers) {
      server.activeConnections = 0;
      server.requestCount = 0;
    }
    this.roundRobinIndex = 0;
  }

  // خوارزمية التناوب الدائري
  async handleRequestRoundRobin(clientIp: string) {
    const server = this.servers[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.servers.length;

    server.activeConnections++;
    server.requestCount++;
    const currentActive = server.activeConnections;

    // محاكاة تأخير المعالجة
    const processingTime = Math.floor(Math.random() * 500) + 100;
    await new Promise((resolve) => setTimeout(resolve, processingTime));

    server.activeConnections--;
    return { serverName: server.name, activeConnections: currentActive };
  }

  // خوارزمية الأقل اتصالاً
  async handleRequestLeastConnections(clientIp: string) {
    let targetServer = this.servers[0];
    for (let i = 1; i < this.servers.length; i++) {
      if (this.servers[i].activeConnections < targetServer.activeConnections) {
        targetServer = this.servers[i];
      }
    }

    targetServer.activeConnections++;
    targetServer.requestCount++;
    const currentActive = targetServer.activeConnections;

    const processingTime = Math.floor(Math.random() * 500) + 100;
    await new Promise((resolve) => setTimeout(resolve, processingTime));

    targetServer.activeConnections--;
    return { serverName: targetServer.name, activeConnections: currentActive };
  }
}
```

### 2. المتحكم: [load-balancer.controller.ts](file:///C:/Users/admin/Desktop/New%20folder%20%282%29/parallel-programming/src/load-balancer/load-balancer.controller.ts)
يعرض مسارات الـ API لاستقبال الطلبات ومعاينة حالة الخوادم:
* `POST /load-balancer/request-rr` للمحاكاة بالتناوب الدائري.
* `POST /load-balancer/request-lc` للمحاكاة بالاعتماد على الأقل اتصالاً.
* `GET /load-balancer/status` للحصول على إحصائيات وحالة الخوادم الثلاثة.
* `POST /load-balancer/reset` لتصفير الإحصائيات وبدء اختبار جديد.

### 3. ملف الاختبار والمحاكاة: [test-load-balancer.js](file:///C:/Users/admin/Desktop/New%20folder%20%282%29/parallel-programming/test-load-balancer.js)
يقوم بإرسال 15 طلباً بشكل متتابع للتحقق من توزيع Round Robin، ثم يصفر الإحصائيات ويرسل 15 طلباً بشكل متزامن (بالتوازي) للتحقق من خوارزمية Least Connections ديناميكياً.

---

## 3. كيفية تشغيل وفحص الكود (How to Run)

لتشغيل المحاكاة بنجاح، يُرجى اتباع الخطوات التالية:

### الخطوة 1: تشغيل خادم NestJS الرئيسي
افتح نافذة سطر أوامر (Terminal) في المجلد الرئيسي للمشروع، وقم بتشغيل الأمر التالي لبدء تشغيل سيرفر الويب:
```bash
npm run start
```
تأكد من بقاء هذا الترمينال مفتوحاً ومستقراً على المنفذ `3000`.

### الخطوة 2: تشغيل نص المحاكاة والاختبار
افتح نافذة سطر أوامر (Terminal) ثانية وجديدة في نفس مجلد المشروع، وقم بتشغيل الأمر التالي:
```bash
node test-load-balancer
```

---

## 4. المخرجات المتوقعة (Expected Output)

عند تشغيل ملف الاختبار، ستظهر لك المخرجات التالية في نافذة سطر الأوامر:

1. **في اختبار Round Robin:** ستلاحظ توزيع الطلبات الـ 15 بشكل دوري متماثل تماماً على السيرفرات الثلاثة (كل سيرفر استقبل 5 طلبات بالتساوي).
2. **في اختبار Least Connections:** ستلاحظ كيف يتم توجيه الطلبات بالتوازي للمواقع الأقل اتصالاً بناءً على زمن المعالجة الفعلي المتغير واللحظي لكل سيرفر.
