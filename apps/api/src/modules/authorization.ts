import { hasPermission, roles, type PermissionKey, type RoleKey } from "@gprn/rbac";
import { ForbiddenException } from "@nestjs/common";

import type { CurrentUser } from "./auth.service.js";

const roleSet = new Set<string>(roles);

export function requirePermission(user: CurrentUser, permission: PermissionKey): void {
  if (userHasPermission(user, permission)) {
    return;
  }

  throw new ForbiddenException({
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action."
  });
}

export function userHasPermission(user: CurrentUser, permission: PermissionKey): boolean {
  return hasPermission(user.roles.filter(isRoleKey), permission);
}

function isRoleKey(role: string): role is RoleKey {
  return roleSet.has(role);
}
