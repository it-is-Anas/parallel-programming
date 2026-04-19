import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class ProductsService {
  constructor(private readonly db: DbService) {}

  findAll() {
    return Array.from(this.db.products.values());
  }

  findOne(id: string) {
    return this.db.products.get(id);
  }
}
