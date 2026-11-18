import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // DECISION: scaffold placeholder until Step 2 (Auth) replaces it with real routes.
  getHello(): string {
    return 'KarGah API';
  }

  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
