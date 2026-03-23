import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Plan } from '@prisma/client/edge';

export class CreateCheckoutDto {
  @ApiProperty({ enum: Plan, example: Plan.PRO })
  @IsEnum(Plan)
  plan: Plan;
}
