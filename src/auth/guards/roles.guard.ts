import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client/edge';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;
    const tenantId = request.headers['x-tenant-id'] as string;

    if (!tenantId) throw new ForbiddenException('Tenant context required');

    const membership = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: user.sub, tenantId } },
    });

    if (!membership)
      throw new ForbiddenException('Not a member of this tenant');

    const roleHierarchy: Role[] = [
      Role.VIEWER,
      Role.MEMBER,
      Role.ADMIN,
      Role.OWNER,
    ];

    const userRoleLevel = roleHierarchy.indexOf(membership.role);
    const hasRole = requiredRoles.some(
      (r) => roleHierarchy.indexOf(r) <= userRoleLevel,
    );

    if (!hasRole) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
