import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client/edge';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { v4 as uuid } from 'uuid';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── Create tenant ──────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateTenantDto) {
    const slug = dto.slug ?? this.generateSlug(dto.name);

    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Slug already taken');

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug,
        users: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
    });

    this.logger.log(`Tenant created: ${tenant.slug} by user ${userId}`);
    return tenant;
  }

  // ── Get all tenants for a user ─────────────────────────────────────────────
  async findAllForUser(userId: string) {
    const memberships = await this.prisma.userTenant.findMany({
      where: { userId },
      include: { tenant: true },
    });
    return memberships.map((m) => ({ ...m.tenant, role: m.role }));
  }

  // ── Get single tenant ──────────────────────────────────────────────────────
  async findOne(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // ── Invite member ──────────────────────────────────────────────────────────
  async inviteMember(
    tenantId: string,
    dto: InviteMemberDto,
    inviterId: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    // fetch inviter name
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { firstName: true, lastName: true, email: true },
    });

    const inviterName = inviter?.firstName
      ? `${inviter.firstName} ${inviter.lastName ?? ''}`.trim()
      : (inviter?.email ?? 'A team member');

    // Check if already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      const alreadyMember = await this.prisma.userTenant.findUnique({
        where: {
          userId_tenantId: { userId: existingUser.id, tenantId },
        },
      });
      if (alreadyMember)
        throw new ConflictException('User is already a member');
    }

    // Check for existing pending invite
    const existingInvite = await this.prisma.invite.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        tenantId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) throw new ConflictException('Invite already sent');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await this.prisma.invite.create({
      data: {
        email: dto.email.toLowerCase(),
        tenantId,
        role: dto.role ?? Role.MEMBER,
        token: uuid(),
        expiresAt,
      },
    });

    this.logger.log(`Invite sent to ${dto.email} for tenant ${tenantId}`);

    await this.mail.sendInviteEmail({
      toEmail: invite.email,
      inviterName, // replace with real user name once you have it in context
      tenantName: tenant.name,
      inviteToken: invite.token,
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
    console.log(
      '🚀 ~ TenantsService ~ inviteMember ~ inviterName:',
      inviterName,
    );

    return {
      message: 'Invite sent successfully',
      expiresAt: invite.expiresAt,
    };
  }

  // ── Accept invite ──────────────────────────────────────────────────────────
  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'PENDING')
      throw new ForbiddenException('Invite is no longer valid');
    if (invite.expiresAt < new Date())
      throw new ForbiddenException('Invite has expired');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.email !== invite.email)
      throw new ForbiddenException('Invite is for a different email');

    await this.prisma.$transaction([
      this.prisma.userTenant.create({
        data: { userId, tenantId: invite.tenantId, role: invite.role },
      }),
      this.prisma.invite.update({
        where: { token },
        data: { status: 'ACCEPTED' },
      }),
    ]);

    return { message: 'Invite accepted', tenantId: invite.tenantId };
  }

  // ── Remove member ──────────────────────────────────────────────────────────
  async removeMember(
    tenantId: string,
    memberId: string,
    requestingUserId: string,
  ) {
    if (memberId === requestingUserId) {
      throw new ForbiddenException('You cannot remove yourself');
    }

    const membership = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: memberId, tenantId } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.role === Role.OWNER)
      throw new ForbiddenException('Cannot remove the owner');

    await this.prisma.userTenant.delete({
      where: { userId_tenantId: { userId: memberId, tenantId } },
    });

    return { message: 'Member removed successfully' };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }
}
