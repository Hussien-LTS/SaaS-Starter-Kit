import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');

    // ── Soft-delete middleware ───────────────────────────────────────────────
    // Automatically filters out records where deletedAt is set.
    // Extend this if you add soft-delete fields to your models.
    // this.$use(async (params, next) => {
    //   if (params.action === 'findMany') {
    //     params.args.where = { ...params.args.where, deletedAt: null };
    //   }
    //   return next(params);
    // });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  // ── Helper: clean DB for e2e tests ────────────────────────────────────────
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase() must never run in production');
    }
    const tableNames = [
      'refresh_tokens',
      'user_tenants',
      'invites',
      'users',
      'tenants',
    ];
    for (const table of tableNames) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    }
  }
}
