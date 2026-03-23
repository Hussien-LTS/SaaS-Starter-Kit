import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Get current user profile ───────────────────────────────────────────────
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        tenants: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── Update profile ─────────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        updatedAt: true,
      },
    });
    return user;
  }

  // ── Change password ────────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const passwordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(
      dto.newPassword,
      parseInt(this.config.get('BCRYPT_ROUNDS') ?? '12'),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens — force re-login on all devices
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Password changed for user ${userId}`);
    return { message: 'Password changed successfully. Please log in again.' };
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  async deleteAccount(userId: string) {
    // Check user is not the sole owner of any tenant
    const ownedTenants = await this.prisma.userTenant.findMany({
      where: { userId, role: 'OWNER' },
      include: {
        tenant: {
          include: {
            users: { where: { role: 'OWNER' } },
          },
        },
      },
    });

    const soloOwnedTenants = ownedTenants.filter(
      (m) => m.tenant.users.length === 1,
    );

    if (soloOwnedTenants.length > 0) {
      throw new UnauthorizedException(
        'Transfer ownership before deleting your account',
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.log(`Account deleted for user ${userId}`);
    return { message: 'Account deleted successfully' };
  }
}
