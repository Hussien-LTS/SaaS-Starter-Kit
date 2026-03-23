import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() makes PrismaService available everywhere without importing
// PrismaModule in every feature module — just import it once in AppModule.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
