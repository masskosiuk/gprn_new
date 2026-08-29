# Database Design

The database is PostgreSQL with PostGIS. Prisma owns the relational model, with raw SQL migrations used where Prisma does not fully model database-specific features such as extensions and future geospatial indexes.

## Core Entity Groups

- Identity: `User`, `Profile`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`, `ExternalConnection`.
- Geography: `Country`, `Region`, `City`, `Place`.
- Photography: `Photo`, `PhotoAsset`, `PhotoMetadata`, `PhotoHash`, `PhotoLocation`, `PhotoProvenance`, `ProvenanceEvent`, `PhotoVersion`.
- Competition: `Category`, `Season`, `SeasonParticipant`, `Challenge`, `ChallengeEntry`, `Battle`, `BattleEntry`, `BattleVote`, `Rating`, `RatingEvent`, `LeaderboardSnapshot`, `LeaderboardEntry`.
- Social: `Follow`, `PhotoLike`, `SavedPhoto`, `Comment`, `Notification`.
- Reputation: `Achievement`, `UserAchievement`.
- Marketplace and Expert foundations: `SellerProfile`, `MarketplaceProduct`, `MarketplaceOrder`, `MarketplaceOrderItem`, `ExpertProfile`, `ExpertService`, `ExpertOrder`, `ExpertOrderPhoto`, `ExpertReview`, `Payment`, `Payout`.
- Trust and operations: `Report`, `CopyrightDispute`, `AuditLog`, `AnalyticsEvent`, `FeatureFlag`, `Translation`.

## Indexing Strategy

Indexes are based on expected query paths:

- public photo discovery by status, visibility, category and publish time;
- user profile lookup by username;
- photo hashes by algorithm and value;
- photo location by country, region, city, visibility and future PostGIS point;
- battle lookup by status, category and season;
- unique vote prevention by battle and voter;
- rating and leaderboard lookup by scope and scope key;
- notifications by user, status and date;
- audit logs by actor and target.

## Deletion Strategy

Do not blindly cascade-delete historical records. Users, photos, products and orders support soft deletion or restricted references where disputes, moderation, financial records or provenance history may need retention.

## Money

All monetary values use integer minor units plus ISO currency code. No floating-point arithmetic is used for financial data.

## Seed Strategy

Seeds create:

- roles and permissions;
- translations baseline;
- categories;
- disabled feature flags;
- Season 01 draft configuration;
- development-safe achievements.

Seeds must not create fake users, fake votes, fake purchases or fake rankings unless a future fixture is explicitly development-only.

