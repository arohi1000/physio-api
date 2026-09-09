import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../http/authenticated-request';
import { RolesGuard } from './roles.guard';

function buildContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const staff: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Priya Nair',
  email: 'staff@physioclinic.local',
  role: UserRole.staff,
};

const doctor: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Dr. Meera Sharma',
  email: 'doctor@physioclinic.local',
  role: UserRole.doctor_admin,
};

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function requireRoles(roles: UserRole[] | undefined): void {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  it('allows any authenticated user when no roles are declared', () => {
    requireRoles(undefined);
    expect(guard.canActivate(buildContext(staff))).toBe(true);
  });

  it('allows a user holding a required role', () => {
    requireRoles([UserRole.doctor_admin]);
    expect(guard.canActivate(buildContext(doctor))).toBe(true);
  });

  it('rejects staff on a doctor_admin-only route', () => {
    requireRoles([UserRole.doctor_admin]);
    expect(() => guard.canActivate(buildContext(staff))).toThrow(
      ForbiddenException,
    );
  });

  it('allows either role when both are listed', () => {
    requireRoles([UserRole.doctor_admin, UserRole.staff]);
    expect(guard.canActivate(buildContext(staff))).toBe(true);
  });

  it('rejects an unauthenticated request on a role-restricted route', () => {
    requireRoles([UserRole.staff]);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
