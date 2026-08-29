export const roles = [
  "GUEST",
  "USER",
  "PHOTOGRAPHER",
  "VERIFIED_PHOTOGRAPHER",
  "EXPERT",
  "EXPERT_JUDGE",
  "ORGANIZER",
  "BRAND",
  "MODERATOR",
  "ADMIN",
  "SUPER_ADMIN"
] as const;

export type RoleKey = (typeof roles)[number];

export const permissions = [
  "analytics:track",
  "battle:create",
  "battle:moderate",
  "battle:vote",
  "category:manage",
  "challenge:create",
  "challenge:join",
  "expert:manage_services",
  "expert:request_review",
  "feature_flag:manage",
  "leaderboard:read",
  "marketplace:manage_products",
  "marketplace:view",
  "notification:read",
  "photo:create",
  "photo:delete_own",
  "photo:manage_any",
  "photo:publish_own",
  "photo:read_private_own",
  "profile:manage_own",
  "provenance:read_own",
  "report:create",
  "report:moderate",
  "season:manage",
  "user:admin",
  "verification:review"
] as const;

export type PermissionKey = (typeof permissions)[number];

export const rolePermissions: Record<RoleKey, readonly PermissionKey[]> = {
  ADMIN: [
    "battle:moderate",
    "category:manage",
    "challenge:create",
    "feature_flag:manage",
    "leaderboard:read",
    "photo:manage_any",
    "report:moderate",
    "season:manage",
    "user:admin",
    "verification:review"
  ],
  BRAND: ["leaderboard:read", "marketplace:view", "notification:read", "report:create"],
  EXPERT: [
    "battle:vote",
    "expert:manage_services",
    "expert:request_review",
    "leaderboard:read",
    "marketplace:view",
    "notification:read",
    "photo:create",
    "photo:delete_own",
    "photo:publish_own",
    "photo:read_private_own",
    "profile:manage_own",
    "provenance:read_own",
    "report:create"
  ],
  EXPERT_JUDGE: [
    "battle:vote",
    "leaderboard:read",
    "notification:read",
    "photo:create",
    "photo:delete_own",
    "photo:publish_own",
    "photo:read_private_own",
    "profile:manage_own",
    "provenance:read_own",
    "report:create"
  ],
  GUEST: ["leaderboard:read", "marketplace:view"],
  MODERATOR: [
    "battle:moderate",
    "leaderboard:read",
    "photo:manage_any",
    "report:moderate",
    "verification:review"
  ],
  ORGANIZER: [
    "battle:create",
    "challenge:create",
    "leaderboard:read",
    "marketplace:view",
    "notification:read",
    "report:create"
  ],
  PHOTOGRAPHER: [
    "battle:vote",
    "challenge:join",
    "expert:request_review",
    "leaderboard:read",
    "marketplace:manage_products",
    "marketplace:view",
    "notification:read",
    "photo:create",
    "photo:delete_own",
    "photo:publish_own",
    "photo:read_private_own",
    "profile:manage_own",
    "provenance:read_own",
    "report:create"
  ],
  SUPER_ADMIN: permissions,
  USER: [
    "battle:vote",
    "challenge:join",
    "expert:request_review",
    "leaderboard:read",
    "marketplace:view",
    "notification:read",
    "photo:create",
    "photo:delete_own",
    "photo:publish_own",
    "photo:read_private_own",
    "profile:manage_own",
    "provenance:read_own",
    "report:create"
  ],
  VERIFIED_PHOTOGRAPHER: [
    "battle:vote",
    "challenge:join",
    "expert:request_review",
    "leaderboard:read",
    "marketplace:manage_products",
    "marketplace:view",
    "notification:read",
    "photo:create",
    "photo:delete_own",
    "photo:publish_own",
    "photo:read_private_own",
    "profile:manage_own",
    "provenance:read_own",
    "report:create"
  ]
};

export function hasPermission(
  assignedRoles: readonly RoleKey[],
  permission: PermissionKey
): boolean {
  return assignedRoles.some((role) => rolePermissions[role].includes(permission));
}

