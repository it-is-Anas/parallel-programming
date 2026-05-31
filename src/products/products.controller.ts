import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post(':id/buy-optimistic')
  buyOptimistic(
    @Param('id') id: string,
    @Body() body: { quantity: number; version: number },
  ) {
    return this.productsService.updateStockOptimistic(id, body.quantity, body.version);
  }

  @Post(':id/buy-pessimistic')
  buyPessimistic(
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ) {
    return this.productsService.updateStockPessimistic(id, body.quantity);
  }
}
