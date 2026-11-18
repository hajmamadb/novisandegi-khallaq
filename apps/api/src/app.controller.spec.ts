import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns KarGah API', () => {
      expect(appController.getHello()).toBe('KarGah API');
    });
  });

  describe('health', () => {
    it('returns ok status with a valid ISO timestamp', () => {
      const result = appController.health();
      expect(result.status).toBe('ok');
      expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
