import { Global, Module } from '@nestjs/common';
import { ConcurrencyService } from './concurrency.service';

@Global()
@Module({
  providers: [ConcurrencyService],
  exports: [ConcurrencyService],
})
export class ConcurrencyModule {}
