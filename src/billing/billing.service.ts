import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client/edge';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

const PLAN_LIMITS: Record<Plan, { members: number; projects: number }> = {
  FREE: { members: 3, projects: 2 },
  PRO: { members: 20, projects: 20 },
  ENTERPRISE: { members: 999, projects: 999 },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!);
  }

  // ── Get current plan ───────────────────────────────────────────────────────
  async getPlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return { ...tenant, limits: PLAN_LIMITS[tenant.plan] };
  }

  // ── Create Stripe checkout session ─────────────────────────────────────────
  async createCheckout(
    tenantId: string,
    userId: string,
    dto: CreateCheckoutDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.plan === dto.plan) {
      throw new BadRequestException('Already on this plan');
    }
    if (dto.plan === Plan.FREE) {
      throw new BadRequestException(
        'Cannot checkout to free plan — cancel subscription instead',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const priceId = this.getPriceId(dto.plan);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user?.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.config.get('APP_URL')}/api/v1/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.get('APP_URL')}/api/v1/billing/cancel`,
      metadata: { tenantId, plan: dto.plan },
    });

    this.logger.log(
      `Checkout session created for tenant ${tenantId} → ${dto.plan}`,
    );
    return { checkoutUrl: session.url };
  }

  // ── Handle Stripe webhook ──────────────────────────────────────────────────
  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get<string>('STRIPE_WEBHOOK_SECRET')!,
      );
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as unknown as Stripe.Checkout.Session;
        const { tenantId, plan } = session.metadata ?? {};
        if (tenantId && plan) {
          await this.activatePlan(tenantId, plan as Plan);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data
          .object as unknown as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenantId;
        if (tenantId) {
          await this.downgradeToFree(tenantId);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice: Stripe.Invoice = event.data
          .object as unknown as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : (invoice.customer?.id ?? 'unknown');
        this.logger.warn(`Payment failed for customer: ${customerId}`);
        break;
      }
      default:
        this.logger.log(`Unhandled webhook event: ${event.type}`);
    }

    return { received: true };
  }

  // ── Checkout success redirect ──────────────────────────────────────────────
  async handleSuccess(sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return {
      message: 'Payment successful',
      plan: session.metadata?.plan,
      tenantId: session.metadata?.tenantId,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async activatePlan(tenantId: string, plan: Plan) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan },
    });
    this.logger.log(`Tenant ${tenantId} upgraded to ${plan}`);
  }

  private async downgradeToFree(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: Plan.FREE },
    });
    this.logger.log(`Tenant ${tenantId} downgraded to FREE`);
  }

  private getPriceId(plan: Plan): string {
    const priceIds: Partial<Record<Plan, string>> = {
      [Plan.PRO]: this.config.get<string>('STRIPE_PRO_PRICE_ID')!,
      [Plan.ENTERPRISE]: this.config.get<string>('STRIPE_ENTERPRISE_PRICE_ID')!,
    };
    const priceId = priceIds[plan];
    if (!priceId)
      throw new BadRequestException(`No price configured for plan: ${plan}`);
    return priceId;
  }

  getPlanLimits(plan: Plan) {
    return PLAN_LIMITS[plan];
  }
}
