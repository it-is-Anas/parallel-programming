import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { DbModule } from './db/db.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    DbModule,
    AuthModule,
    WarehouseModule,
    ProductsModule,
    CartModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
