import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // ==============================================================================
  // المتطلب غير الوظيفي 3: المعالجة غير المتزامنة (Asynchronous Queues)
  // ==============================================================================
  // نقل المهام الثقيلة التي لا يحتاج المستخدم لانتظارها (مثل إصدار الفواتير، إرسال الإيميلات)
  // خارج المسار الرئيسي للطلب باستخدام الأحداث غير المتزامنة.
  @OnEvent('order.completed', { async: true })
  async handleOrderCompletedEvent(payload: { userId: string; itemsCount: number }) {
    this.logger.log(`[ASYNC JOB] Starting background tasks for User ${payload.userId}...`);
    
    // محاكاة عمليات تأخذ وقت طويل وتستهلك موارد (مثل معالجة PDF وإرسال إيميلات)
    await this.generateInvoice(payload.userId);
    await this.sendEmailNotification(payload.userId);

    this.logger.log(`[ASYNC JOB] Background tasks for User ${payload.userId} completed successfully.`);
  }

  private async generateInvoice(userId: string) {
    this.logger.log(`[Invoice] Generating PDF invoice for User ${userId}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // تأخير 2 ثانية لمحاكاة إصدار الفاتورة
    this.logger.log(`[Invoice] PDF generated for User ${userId}`);
  }

  private async sendEmailNotification(userId: string) {
    this.logger.log(`[Email] Sending confirmation email to User ${userId}...`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // تأخير 1 ثانية لمحاكاة إرسال إيميل
    this.logger.log(`[Email] Email sent to User ${userId}`);
  }
}
