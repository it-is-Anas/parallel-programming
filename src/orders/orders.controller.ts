import { Controller, Post, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout/:userId')
  checkout(@Param('userId') userId: string) {
    return this.ordersService.checkout(userId);
  }

  @Post('checkout-unsafe/:userId')
  checkoutUnsafe(@Param('userId') userId: string) {
    return this.ordersService.checkoutUnsafe(userId);
  }
}
