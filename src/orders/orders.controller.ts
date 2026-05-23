import { Controller, Post, Body, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout/:userId')
  checkout(@Param('userId') userId: string) {
    return this.ordersService.checkout(userId);
  }

  // ==========================================
  // BAD ENDPOINT (To show the problem of NOT using Req 3)
  // ==========================================
  @Post('checkout-bad/:userId')
  checkoutBad(@Param('userId') userId: string) {
    return this.ordersService.checkoutBad(userId);
  }
}
