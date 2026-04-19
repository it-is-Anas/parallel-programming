import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get(':userId')
  getCart(@Param('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post(':userId/add')
  addToCart(@Param('userId') userId: string, @Body() body: { productId: string; quantity: number }) {
    return this.cartService.addToCart(userId, body.productId, body.quantity);
  }
}
