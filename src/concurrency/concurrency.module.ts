import { Global, Module } from '@nestjs/common';
import { ConcurrencyService } from './concurrency.service';
import { DbModule } from '../db/db.module';

@Global()
@Module({
  imports: [DbModule],
  providers: [ConcurrencyService],
  exports: [ConcurrencyService],
})
export class ConcurrencyModule {}
