import { Controller, Put, Body, Param } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';

@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Put('stock/:productId')
  updateStock(
    @Param('productId') productId: string,
    @Body() body: { stock: number },
  ) {
    return this.warehouseService.updateStock(productId, body.stock);
  }
}
