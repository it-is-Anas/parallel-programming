import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { DbModule } from './db/db.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { ConcurrencyModule } from './concurrency/concurrency.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchModule } from './batch/batch.module';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DbModule,
    AuthModule,
    WarehouseModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    ConcurrencyModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    BatchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PerformanceInterceptor,
    },
  ],
})
export class AppModule { }
