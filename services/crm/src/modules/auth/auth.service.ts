import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantUser, TenantUserRole } from '../../entities';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepository: Repository<TenantUser>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    // Check if email already exists
    const existingUser = await this.tenantUserRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Create tenant
    const tenant = this.tenantRepository.create({
      name: dto.tenantName,
      email: dto.email,
      subdomain: dto.subdomain,
      whatsapp_number: dto.whatsappNumber,
    });

    await this.tenantRepository.save(tenant);

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create tenant user (owner)
    const tenantUser = this.tenantUserRepository.create({
      tenant_id: tenant.id,
      name: dto.ownerName,
      email: dto.email,
      password_hash: passwordHash,
      role: TenantUserRole.OWNER,
      is_active: true,
    });

    await this.tenantUserRepository.save(tenantUser);

    // Generate JWT
    const payload = {
      sub: tenantUser.id,
      email: tenantUser.email,
      tenantId: tenant.id,
      role: tenantUser.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        subdomain: tenant.subdomain,
        whatsapp_number: tenant.whatsapp_number,
      },
      user: {
        id: tenantUser.id,
        name: tenantUser.name,
        email: tenantUser.email,
        role: tenantUser.role,
      },
    };
  }

  async login(dto: LoginDto) {
    // Find user by email
    const tenantUser = await this.tenantUserRepository.findOne({
      where: { email: dto.email, is_active: true },
      relations: ['tenant'],
    });

    if (!tenantUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, tenantUser.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    tenantUser.last_login_at = new Date();
    await this.tenantUserRepository.save(tenantUser);

    // Generate JWT
    const payload = {
      sub: tenantUser.id,
      email: tenantUser.email,
      tenantId: tenantUser.tenant_id,
      role: tenantUser.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      tenant: {
        id: tenantUser.tenant.id,
        name: tenantUser.tenant.name,
        email: tenantUser.tenant.email,
        subdomain: tenantUser.tenant.subdomain,
        whatsapp_number: tenantUser.tenant.whatsapp_number,
      },
      user: {
        id: tenantUser.id,
        name: tenantUser.name,
        email: tenantUser.email,
        role: tenantUser.role,
      },
    };
  }

  async validateUser(userId: string) {
    const tenantUser = await this.tenantUserRepository.findOne({
      where: { id: userId, is_active: true },
      relations: ['tenant'],
    });

    if (!tenantUser) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      userId: tenantUser.id,
      tenantId: tenantUser.tenant_id,
      email: tenantUser.email,
      role: tenantUser.role,
      tenant: tenantUser.tenant,
    };
  }

  async getMe(userId: string) {
    const result = await this.validateUser(userId);
    return {
      user: {
        id: result.userId,
        email: result.email,
        role: result.role,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        email: result.tenant.email,
        subdomain: result.tenant.subdomain,
        whatsapp_number: result.tenant.whatsapp_number,
        status: result.tenant.status,
      },
    };
  }
}
