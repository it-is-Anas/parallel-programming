import { Controller, Get, Post, Ip, Query } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';

@Controller('load-balancer')
export class LoadBalancerController {
  constructor(private readonly loadBalancerService: LoadBalancerService) {}

  @Post('request-rr')
  async requestRoundRobin(@Ip() ip: string, @Query('clientIp') queryIp?: string) {
    const clientIp = queryIp || ip || '127.0.0.1';
    const result = await this.loadBalancerService.handleRequestRoundRobin(clientIp);
    return {
      message: 'Request processed successfully',
      routedTo: result.serverName,
      activeConnectionsOnServer: result.activeConnections,
    };
  }

  @Post('request-lc')
  async requestLeastConnections(@Ip() ip: string, @Query('clientIp') queryIp?: string) {
    const clientIp = queryIp || ip || '127.0.0.1';
    const result = await this.loadBalancerService.handleRequestLeastConnections(clientIp);
    return {
      message: 'Request processed successfully',
      routedTo: result.serverName,
      activeConnectionsOnServer: result.activeConnections,
    };
  }

  @Get('status')
  getStatus() {
    return this.loadBalancerService.getServersState();
  }

  @Post('reset')
  reset() {
    this.loadBalancerService.resetStats();
    return { message: 'Load balancer statistics reset successfully.' };
  }
}
