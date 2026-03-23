/* eslint-disable @typescript-eslint/require-await */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client/edge';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

// Plan limits — easy to extend as your SaaS grows
const PLAN_LIMITS: Record<Plan, { members: number; projects: number }> = {
  FREE: { members: 3, projects: 2 },
  PRO: { members: 20, projects: 20 },
  ENTERPRISE: { members: 999, projects: 999 },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Get current plan for a tenant ──────────────────────────────────────────
  async getPlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      ...tenant,
      limits: PLAN_LIMITS[tenant.plan],
    };
  }

  // ── Create checkout session (Stripe stub) ──────────────────────────────────
  // In production: create a real Stripe checkout session and return the URL.
  // The frontend redirects the user to Stripe's hosted checkout page.
  async createCheckout(tenantId: string, dto: CreateCheckoutDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.plan === dto.plan) {
      throw new BadRequestException('Already on this plan');
    }

    // ── Stripe integration goes here ─────────────────────────────────────────
    // const stripe = new Stripe(this.config.get('STRIPE_SECRET_KEY'));
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   line_items: [{ price: STRIPE_PRICE_IDS[dto.plan], quantity: 1 }],
    //   success_url: `${this.config.get('APP_URL')}/billing/success`,
    //   cancel_url:  `${this.config.get('APP_URL')}/billing/cancel`,
    //   metadata: { tenantId },
    // });
    // return { checkoutUrl: session.url };

    // Stub response — remove once Stripe is wired up
    this.logger.log(`Checkout stub: tenant ${tenantId} → plan ${dto.plan}`);
    return {
      checkoutUrl: `https://checkout.stripe.com/stub?tenant=${tenantId}&plan=${dto.plan}`,
      message: 'Stripe not yet configured — this is a stub response',
    };
  }

  // ── Handle Stripe webhook ──────────────────────────────────────────────────
  // Called by Stripe when a payment event occurs.
  // In production: verify the webhook signature before processing.
  async handleWebhook(rawBody: Buffer, signature: string) {
    // ── Stripe webhook verification goes here ────────────────────────────────
    // const stripe = new Stripe(this.config.get('STRIPE_SECRET_KEY'));
    // const event = stripe.webhooks.constructEvent(
    //   rawBody,
    //   signature,
    //   this.config.get('STRIPE_WEBHOOK_SECRET'),
    // );
    //
    // switch (event.type) {
    //   case 'checkout.session.completed':
    //     const session = event.data.object as Stripe.Checkout.Session;
    //     await this.activatePlan(session.metadata.tenantId, session);
    //     break;
    //   case 'customer.subscription.deleted':
    //     await this.downgradeToFree(event.data.object.metadata.tenantId);
    //     break;
    // }

    this.logger.log(
      `Webhook received — signature: ${signature.slice(0, 20)}...`,
    );
    return { received: true };
  }

  // ── Upgrade / downgrade plan ───────────────────────────────────────────────
  async updatePlan(tenantId: string, plan: Plan) {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan },
      select: { id: true, name: true, plan: true },
    });
    this.logger.log(`Tenant ${tenantId} plan updated to ${plan}`);
    return { ...tenant, limits: PLAN_LIMITS[plan] };
  }

  // ── Get plan limits ────────────────────────────────────────────────────────
  getPlanLimits(plan: Plan) {
    return PLAN_LIMITS[plan];
  }
}
