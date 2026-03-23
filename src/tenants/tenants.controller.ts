import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { Role } from '@prisma/client/edge';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('tenants')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tenants for the current user' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.findAllForUser(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single tenant with members' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @UseGuards(RolesGuard)
  @Roles(Role.MEMBER)
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post(':id/invite')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantsService.inviteMember(id, dto, user.sub);
  }

  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a tenant invite' })
  acceptInvite(@Param('token') token: string, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.acceptInvite(token, user.sub);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from the tenant' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantsService.removeMember(id, memberId, user.sub);
  }
}
