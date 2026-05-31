import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ConcurrencyModule } from '../concurrency/concurrency.module';

@Module({
  imports: [ConcurrencyModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
