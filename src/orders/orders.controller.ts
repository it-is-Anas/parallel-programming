import { Controller, Post, Param, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout/:userId')
  checkout(
    @Param('userId') userId: string,
    @Query('simulatePaymentFailure') simulatePaymentFailure?: string,
  ) {
    const shouldFail = simulatePaymentFailure === 'true';
    return this.ordersService.checkout(userId, shouldFail);
  }

  @Post('checkout-no-acid/:userId')
  checkoutNoAcid(
    @Param('userId') userId: string,
    @Query('simulatePaymentFailure') simulatePaymentFailure?: string,
  ) {
    const shouldFail = simulatePaymentFailure === 'true';
    return this.ordersService.checkoutNoAcid(userId, shouldFail);
  }

  // ==========================================
  // BAD ENDPOINT (To show the problem of NOT using Req 3)
  // ==========================================
  @Post('checkout-bad/:userId')
  checkoutBad(@Param('userId') userId: string) {
    return this.ordersService.checkoutBad(userId);
  }
}
