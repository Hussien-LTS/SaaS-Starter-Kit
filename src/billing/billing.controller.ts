import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  UseGuards,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client/edge';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ── Stripe webhook — must be public, no JWT, needs raw body ───────────────
  @Post('webhook')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body is missing');
    }
    return this.billingService.handleWebhook(rawBody, signature);
  }

  // ── Protected billing routes ───────────────────────────────────────────────
  @Get('plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER)
  @ApiBearerAuth('access-token')
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiOperation({ summary: 'Get current plan and limits for the tenant' })
  @ApiResponse({ status: 200, description: 'Plan info returned' })
  getPlan(@TenantId() tenantId: string) {
    return this.billingService.getPlan(tenantId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiOperation({ summary: 'Create a Stripe checkout session' })
  @ApiResponse({ status: 201, description: 'Checkout URL returned' })
  createCheckout(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(tenantId, user.sub, dto);
  }
}
