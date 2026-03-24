# Sleep Cycle Test — 2026-03-24T12:36:35.717Z

## Summary
| Phase | Single-Topic | Cross-Topic | Noise | Overall |
|-------|-------------|-------------|-------|---------|
| Before Sleep #1 | 5/6 | 3/6 | 2/2 | 71.4% |
| After Sleep #1 | 5/6 | 4/6 | 2/2 | 78.6% |
| Before Sleep #2 | 5/6 | 4/6 | 2/2 | 78.6% |
| After Sleep #2 | 5/6 | 3/6 | 2/2 | 71.4% |
| After Sleep #3 | 5/6 | 3/6 | 2/2 | 71.4% |

## Sleep Cycle Stats
| Cycle | Clusters | Strengthened | Created | Decayed | Pruned |
|-------|----------|-------------|---------|---------|--------|
| #1 | 1 | 0 | 1 | 45 | 24 |
| #2 | 4 | 5 | 1 | 222 | 1189 |
| #3 | 4 | 6 | 0 | 0 | 1046 |

## Cross-Topic Improvement
- Before sleep: 4/6
- After sleep #2: 3/6 (-1)
- After sleep #3: 3/6 (-1)

## Detailed Results
### Before Sleep #1
- [PASS] [single-topic] How long do JWT access tokens last? (2492ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (3515ms)
- [PASS] [single-topic] How much does a horse transfer cost? (3115ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (3332ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (2180ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (2329ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (2510ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (2342ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (2802ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (2083ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (3564ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (3377ms)
- [PASS] [noise] What color is the office building? (2746ms)
- [PASS] [noise] What was discussed at the team lunch? (2796ms)

### After Sleep #1
- [PASS] [single-topic] How long do JWT access tokens last? (5444ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (3276ms)
- [PASS] [single-topic] How much does a horse transfer cost? (2925ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (2083ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (3110ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (3922ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (1977ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (2687ms)
- [PASS] [cross-topic] What compliance checks are required before a horse can compete at Training level? (3344ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (2695ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (3126ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (2896ms)
- [PASS] [noise] What color is the office building? (3163ms)
- [PASS] [noise] What was discussed at the team lunch? (2395ms)

### Before Sleep #2
- [PASS] [single-topic] How long do JWT access tokens last? (3631ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (4095ms)
- [PASS] [single-topic] How much does a horse transfer cost? (2497ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (3550ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (4022ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (2399ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (3055ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (2922ms)
- [PASS] [cross-topic] What compliance checks are required before a horse can compete at Training level? (6356ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (4512ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (2998ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (3703ms)
- [PASS] [noise] What color is the office building? (3352ms)
- [PASS] [noise] What was discussed at the team lunch? (2997ms)

### After Sleep #2
- [PASS] [single-topic] How long do JWT access tokens last? (3341ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (4245ms)
- [PASS] [single-topic] How much does a horse transfer cost? (2560ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (2321ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (3248ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (4307ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (2664ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (4495ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (5270ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (3133ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (3928ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (3742ms)
- [PASS] [noise] What color is the office building? (3790ms)
- [PASS] [noise] What was discussed at the team lunch? (4039ms)

### After Sleep #3
- [PASS] [single-topic] How long do JWT access tokens last? (4778ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (4987ms)
- [PASS] [single-topic] How much does a horse transfer cost? (4477ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (7236ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (3110ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (5105ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (5947ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (5508ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (7761ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (7387ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (4565ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (5953ms)
- [PASS] [noise] What color is the office building? (5371ms)
- [PASS] [noise] What was discussed at the team lunch? (5766ms)
