import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  // ==============================================================================
  // المتطلب غير الوظيفي 4: معالجة البيانات الضخمة على دفعات (Batch Processing)
  // ==============================================================================
  // الوظيفة: معالجة عدد هائل من السجلات (مثل المبيعات اليومية) بدون التسبب
  // في استهلاك كل الذاكرة (Out of Memory) أو إيقاف السيرفر (Event Loop Blocking).

  // هذه الدالة المجدولة (Cron Job) ستعمل تلقائياً كل منتصف ليل (أو كل فترة محددة)
  // يمكنك أيضاً استدعاؤها يدوياً عن طريق الـ Controller للاختبار
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDailySalesInChunks() {
    this.logger.log('--- Starting Daily Sales Batch Job ---');
    
    // 1. توليد بيانات ضخمة وهمية (100 ألف عملية بيع)
    const totalRecords = 100_000;
    const dailySales = Array.from({ length: totalRecords }, (_, i) => ({
      orderId: `ORD-${i + 1}`,
      amount: Math.random() * 1000,
    }));

    this.logger.log(`[Batch Job] Fetched ${dailySales.length} total records from database.`);

    // 2. تقسيم البيانات إلى دفعات (Chunks) لضمان عدم استهلاك الذاكرة
    const chunkSize = 5000; 
    let processedCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < dailySales.length; i += chunkSize) {
      // استخراج الدفعة الحالية
      const chunk = dailySales.slice(i, i + chunkSize);
      
      this.logger.log(`[Batch Job] Processing chunk ${i / chunkSize + 1} (${chunk.length} items)...`);
      
      // معالجة عناصر الدفعة الحالية بالتوازي (لزيادة السرعة)
      // نستخدم Promise.all لمعالجة 5000 سجل في نفس الوقت داخل هذه الدفعة فقط
      await Promise.all(
        chunk.map(async (sale) => {
          // محاكاة عملية معقدة أو استعلام قاعدة بيانات لكل سجل (مثل حساب الضرائب، أو الترحيل)
          // setTimeout مع تأخير بسيط لمحاكاة العمل
          await new Promise((resolve) => setTimeout(resolve, 2)); 
        })
      );

      processedCount += chunk.length;
      
      // اختيارياً: يمكن إضافة تأخير بسيط بين كل دفعة وأخرى للسماح للسيرفر بالتقاط أنفاسه (Yielding to Event Loop)
      // await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const endTime = Date.now();
    this.logger.log(`[Batch Job] Successfully processed ${processedCount} records in ${(endTime - startTime) / 1000} seconds.`);
    this.logger.log('--- Finished Daily Sales Batch Job ---');
  }

  // ==============================================================================
  // دالة سيئة (BAD FUNCTION): لغرض العرض والاختبار فقط (لإثبات أهمية المتطلب 4)
  // ==============================================================================
  async processDailySalesBad() {
    this.logger.warn('--- Starting BAD Daily Sales Job (NO CHUNKS) ---');
    
    // محاولة جلب 100 ألف سجل دفعة واحدة ومعالجتهم في نفس اللحظة
    const totalRecords = 100_000;
    const dailySales = Array.from({ length: totalRecords }, (_, i) => ({
      orderId: `ORD-${i + 1}`,
      amount: Math.random() * 1000,
    }));

    const startTime = Date.now();
    this.logger.warn(`[BAD Job] Processing ALL ${totalRecords} items AT ONCE... Brace yourself.`);
    
    try {
      // الكارثة هنا: فتح 100,000 عملية في نفس الوقت يستهلك الذاكرة ويجمد السيرفر
      await Promise.all(
        dailySales.map(async (sale) => {
          await new Promise((resolve) => setTimeout(resolve, 2)); 
        })
      );
    } catch (e) {
      this.logger.error('CRASH: Out of memory or event loop blocked too long!', e);
    }

    const endTime = Date.now();
    this.logger.warn(`[BAD Job] Finished in ${(endTime - startTime) / 1000} seconds. (Notice the massive memory/CPU spike)`);
  }
}
