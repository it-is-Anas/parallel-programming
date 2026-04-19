import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthService {
  login(body: any) {
    if (body.username && body.password) {
      return { access_token: 'mock-jwt-token' };
    }
    throw new UnauthorizedException('Invalid credentials');
  }
}
