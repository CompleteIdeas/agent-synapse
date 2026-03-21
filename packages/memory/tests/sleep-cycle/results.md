# Sleep Cycle Test — 2026-03-09T21:23:43.281Z

## Summary
| Phase | Single-Topic | Cross-Topic | Noise | Overall |
|-------|-------------|-------------|-------|---------|
| Before Sleep #1 | 5/6 | 3/6 | 1/2 | 64.3% |
| After Sleep #1 | 5/6 | 5/6 | 1/2 | 78.6% |
| Before Sleep #2 | 5/6 | 4/6 | 1/2 | 71.4% |
| After Sleep #2 | 5/6 | 4/6 | 1/2 | 71.4% |
| After Sleep #3 | 5/6 | 4/6 | 1/2 | 71.4% |

## Sleep Cycle Stats
| Cycle | Clusters | Strengthened | Created | Decayed | Pruned |
|-------|----------|-------------|---------|---------|--------|
| #1 | 1 | 0 | 1 | 0 | 172 |
| #2 | 4 | 4 | 0 | 0 | 1199 |
| #3 | 4 | 3 | 1 | 0 | 482 |

## Cross-Topic Improvement
- Before sleep: 4/6
- After sleep #2: 4/6 (+0)
- After sleep #3: 4/6 (+0)

## Detailed Results
### Before Sleep #1
- [PASS] [single-topic] How long do JWT access tokens last? (762ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (816ms)
- [PASS] [single-topic] How much does a horse transfer cost? (602ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (677ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (866ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (885ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (706ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (848ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (967ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (935ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (996ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (909ms)
- [FAIL] [noise] What color is the office building? (807ms)
- [PASS] [noise] What was discussed at the team lunch? (686ms)

### After Sleep #1
- [PASS] [single-topic] How long do JWT access tokens last? (830ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (843ms)
- [PASS] [single-topic] How much does a horse transfer cost? (661ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (762ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (846ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (831ms)
- [PASS] [cross-topic] What security measures protect payment processing from replay attacks? (718ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (943ms)
- [PASS] [cross-topic] What compliance checks are required before a horse can compete at Training level? (872ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (778ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (944ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (871ms)
- [FAIL] [noise] What color is the office building? (719ms)
- [PASS] [noise] What was discussed at the team lunch? (633ms)

### Before Sleep #2
- [PASS] [single-topic] How long do JWT access tokens last? (808ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (872ms)
- [PASS] [single-topic] How much does a horse transfer cost? (707ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (756ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (934ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (872ms)
- [FAIL] [cross-topic] What security measures protect payment processing from replay attacks? (750ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (906ms)
- [PASS] [cross-topic] What compliance checks are required before a horse can compete at Training level? (923ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (876ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (982ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (913ms)
- [FAIL] [noise] What color is the office building? (844ms)
- [PASS] [noise] What was discussed at the team lunch? (772ms)

### After Sleep #2
- [PASS] [single-topic] How long do JWT access tokens last? (876ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (897ms)
- [PASS] [single-topic] How much does a horse transfer cost? (785ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (788ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (916ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (982ms)
- [PASS] [cross-topic] What security measures protect payment processing from replay attacks? (840ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (936ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (975ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (908ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (895ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (939ms)
- [FAIL] [noise] What color is the office building? (862ms)
- [PASS] [noise] What was discussed at the team lunch? (764ms)

### After Sleep #3
- [PASS] [single-topic] How long do JWT access tokens last? (875ms)
- [PASS] [single-topic] What connection pooler is used for PostgreSQL? (881ms)
- [PASS] [single-topic] How much does a horse transfer cost? (736ms)
- [FAIL] [single-topic] What platform fee percentage does Stripe Connect charge? (811ms)
- [PASS] [single-topic] What are the horse registration levels from lowest to highest? (945ms)
- [PASS] [single-topic] What transaction isolation level is used for payment processing? (1001ms)
- [PASS] [cross-topic] What security measures protect payment processing from replay attacks? (797ms)
- [PASS] [cross-topic] How does the authentication system prevent brute force and token theft? (969ms)
- [FAIL] [cross-topic] What compliance checks are required before a horse can compete at Training level? (932ms)
- [PASS] [cross-topic] How are organizer finances tracked from payment to payout? (864ms)
- [FAIL] [cross-topic] What database features ensure data integrity for concurrent financial operations? (930ms)
- [PASS] [cross-topic] What audit and logging exists across authentication and payment events? (948ms)
- [FAIL] [noise] What color is the office building? (819ms)
- [PASS] [noise] What was discussed at the team lunch? (736ms)
