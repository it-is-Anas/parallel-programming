import { Controller, Post } from '@nestjs/common';
import { BatchService } from './batch.service';

@Controller('batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post('trigger-daily-sales')
  async triggerDailySalesProcessing() {
    // We run it in the background without awaiting so the user isn't blocked
    this.batchService.processDailySalesInChunks();
    return { message: 'Batch processing of daily sales started in the background.' };
  }
}
