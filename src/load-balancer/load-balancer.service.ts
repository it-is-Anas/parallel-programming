import { Injectable, Logger } from '@nestjs/common';

export interface VirtualServer {
  id: string;
  name: string;
  activeConnections: number;
  requestCount: number;
}

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);

  // محاكاة لثلاثة خوادم ويب خلفية
  private readonly servers: VirtualServer[] = [
    { id: 'srv-1', name: 'Server-Alpha (Instance 1)', activeConnections: 0, requestCount: 0 },
    { id: 'srv-2', name: 'Server-Beta (Instance 2)', activeConnections: 0, requestCount: 0 },
    { id: 'srv-3', name: 'Server-Gamma (Instance 3)', activeConnections: 0, requestCount: 0 },
  ];

  private roundRobinIndex = 0;

  getServersState(): VirtualServer[] {
    return this.servers;
  }

  resetStats() {
    for (const server of this.servers) {
      server.activeConnections = 0;
      server.requestCount = 0;
    }
    this.roundRobinIndex = 0;
    this.logger.log('Load Balancer stats reset.');
  }

  // 1. خوارزمية Round Robin (التناوب الدائري)
  async handleRequestRoundRobin(clientIp: string): Promise<{ serverName: string; activeConnections: number }> {
    const server = this.servers[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.servers.length;

    server.activeConnections++;
    server.requestCount++;
    const currentActive = server.activeConnections;
    
    this.logger.log(
      `[Round-Robin] Client IP: ${clientIp} -> Routed to ${server.name} (Active: ${currentActive}, Total Routed: ${server.requestCount})`
    );

    // محاكاة معالجة الطلب بتأخير عشوائي لمحاكاة اختلاف المهام
    const processingTime = Math.floor(Math.random() * 500) + 100; // 100ms - 600ms
    await new Promise((resolve) => setTimeout(resolve, processingTime));

    server.activeConnections--;
    return { serverName: server.name, activeConnections: currentActive };
  }

  // 2. خوارزمية Least Connections (الأقل اتصالاً)
  async handleRequestLeastConnections(clientIp: string): Promise<{ serverName: string; activeConnections: number }> {
    // البحث عن الخادم الذي يحتوي على أقل عدد اتصالات نشطة حالياً
    let targetServer = this.servers[0];
    for (let i = 1; i < this.servers.length; i++) {
      if (this.servers[i].activeConnections < targetServer.activeConnections) {
        targetServer = this.servers[i];
      }
    }

    targetServer.activeConnections++;
    targetServer.requestCount++;
    const currentActive = targetServer.activeConnections;

    this.logger.log(
      `[Least-Connections] Client IP: ${clientIp} -> Routed to ${targetServer.name} (Active: ${currentActive}, Total Routed: ${targetServer.requestCount})`
    );

    // محاكاة معالجة الطلب بتأخير عشوائي
    const processingTime = Math.floor(Math.random() * 500) + 100;
    await new Promise((resolve) => setTimeout(resolve, processingTime));

    targetServer.activeConnections--;
    return { serverName: targetServer.name, activeConnections: currentActive };
  }
}
