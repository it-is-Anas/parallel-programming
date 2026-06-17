import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { DbService } from './db/db.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dbService: DbService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('process')
  processRequest() {
    const port = process.env.PORT || 3000;
    return { message: `Handled by node on port ${port}` };
  }

  @Post('reset')
  reset() {
    this.dbService.reset();
    return { message: 'Database reset successful' };
  }
}
