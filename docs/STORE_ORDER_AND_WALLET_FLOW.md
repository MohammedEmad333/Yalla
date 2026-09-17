# Store Order & Wallet Reservation Flow

This document describes the current backend flow for store/restaurant orders in Yalla Delivery, including wallet reservation, merchant approval, captain dispatch, delivery settlement, cancellation, inventory restoration, coupon rollback, and idempotency rules.

## Overview

Store orders follow this sequence:

```text
Customer creates order
        ↓
Server validates restaurant, menu items, prices, options and stock
        ↓
Reward points / discounts are calculated
        ↓
Estimated payable amount is reserved in the customer wallet
        ↓
Merchant receives the order
        ↓
Merchant accepts or rejects
        ↓
If accepted → captain broadcast / auto assignment starts
        ↓
Merchant prepares order
        ↓
Merchant marks order ready
        ↓
Captain picks up the order
        ↓
Merchant confirms handover
        ↓
Captain delivers and enters final delivery price + delivery code
        ↓
Reserved wallet amount is captured using the actual final total
        ↓
Merchant earning, captain earning and admin commission are settled
```

## Wallet Model

The customer wallet contains three important values:

- `balance`: actual money currently stored in the wallet.
- `reservedBalance`: money reserved for active orders.
- `availableBalance`: money the customer can still spend.

```text
availableBalance = balance - reservedBalance
```

Example:

```text
balance          = 100 ₪
reservedBalance  = 40 ₪
availableBalance = 60 ₪
```

The reserved amount cannot be consumed by another order or ordinary debit operation.

## Creating a Store Order

The backend validates all commerce data on the server and does not trust client-submitted prices.

The payable reservation is based on:

```text
items total
+ estimated delivery fee
- applicable reward discount
```

The amount is stored through a `WalletHold` linked to the order.

Each order can have only one wallet hold. This makes reservation operations idempotent and prevents duplicate holds when a request is retried.

If there is not enough `availableBalance`, order creation fails and no amount is reserved.

## Wallet Hold States

`WalletHold` uses the following states:

```text
reserving
active
capturing
releasing
released
```

Typical successful lifecycle:

```text
reserving → active → capturing → released
```

Cancellation lifecycle:

```text
reserving → active → releasing → released
```

## Merchant Flow

Supported merchant states:

```text
new
accepted
preparing
ready
handed_over
rejected
```

Allowed transitions:

```text
new → accepted
new → rejected
accepted → preparing
preparing → ready
ready → handed_over
```

A store order is not allowed to reach captain assignment states before merchant acceptance.

## Captain Dispatch

Store orders are not broadcast or automatically assigned to captains while the merchant status is `new`.

Captain dispatch becomes allowed only after merchant acceptance.

Allowed merchant states for dispatch:

```text
accepted
preparing
ready
handed_over
```

When the merchant changes:

```text
new → accepted
```

the backend starts the configured dispatch mode:

- broadcast mode, or
- automatic captain assignment.

Scheduled orders continue to respect their scheduled activation time.

## Captain Claim Protection

Captain claim is protected directly inside the atomic database query.

For store orders, a captain cannot claim an order unless the merchant has already accepted it.

This protection is implemented at the database update level so it cannot be bypassed by skipping model validation.

## Pickup Protection

A captain cannot change a store order to `picked_up` until the merchant has marked it ready.

Allowed merchant states for pickup:

```text
ready
handed_over
```

This prevents a captain from claiming to have collected food before the restaurant has completed preparation.

## Merchant Handover

The merchant cannot mark the order as `handed_over` unless:

- a captain is assigned, and
- the captain has already confirmed pickup.

This keeps both merchant and captain state consistent.

## Delivery Settlement

At delivery, the captain enters:

- the real delivery price, and
- the customer delivery code.

The real delivery price cannot exceed the estimated delivery price.

The final charge is calculated as:

```text
actual delivery price
+ store items total
- applied reward discount
```

For store orders with an active hold, settlement uses `captureOrderHold()` instead of a normal wallet debit.

The operation:

1. deducts the actual final amount from `balance`;
2. removes the full estimated amount from `reservedBalance`;
3. releases any unused difference back into `availableBalance`.

Example:

```text
Reserved total: 50 ₪
Final total:    47 ₪

balance decreases by 47 ₪
reservedBalance decreases by 50 ₪
3 ₪ becomes available again
```

The payment transaction uses an idempotency key based on the order ID, so repeated delivery confirmation cannot charge the customer twice.

## Financial Distribution

For a successfully delivered store order:

- store item value becomes merchant credit;
- captain receives the configured share of the delivery fee;
- admin receives the delivery commission.

Merchant earnings are recorded through `MerchantEarning` using the order as a unique reference to prevent duplicates.

## Cancellation

When an order reaches `CANCELLED`, the wallet hold is released centrally.

This covers cancellation by:

- customer;
- admin;
- merchant rejection;
- system flows that persist the order as cancelled.

The release operation is idempotent, so retrying cancellation does not release the same amount twice.

## Merchant Rejection

When the merchant rejects a new store order:

- `merchantStatus` becomes `rejected`;
- order status becomes `CANCELLED`;
- reserved wallet funds are released;
- reserved reward points are returned;
- tracked inventory is restored;
- coupon usage is rolled back when applicable.

## Inventory Restoration

Store items using inventory tracking are decremented only after order creation and wallet reservation succeed.

If the merchant rejects the order, tracked item quantities are restored and unavailable items become available again where appropriate.

## Coupon Rollback

Coupon usage is counted when a valid store order is created.

If that order is later cancelled in a flow eligible for rollback, the coupon usage count is restored.

The coupon stores restored order references to make rollback idempotent and prevent decrementing `usedCount` more than once for the same order.

## Reward Points

Reward points reserved for an order are released when the order is cancelled before settlement.

During delivery, the applicable reward discount is finalized before the wallet capture is calculated.

## Ordinary Wallet Debits

Generic wallet debits use `availableBalance`, not raw `balance`.

This means funds reserved for active orders cannot be consumed by unrelated wallet operations.

## Wallet API Response

Wallet summaries expose:

```json
{
  "balance": 100,
  "reservedBalance": 40,
  "availableBalance": 60,
  "currency": "ILS"
}
```

Frontend clients may display all three values, but the backend reservation and protection logic works even if an older app version only displays `balance`.

## Important Backend Files

Main implementation files:

```text
backend/src/models/Wallet.js
backend/src/models/WalletHold.js
backend/src/models/Order.js
backend/src/models/Coupon.js
backend/src/models/MerchantEarning.js

backend/src/services/wallet.service.js
backend/src/services/walletHold.service.js
backend/src/services/order.service.js
backend/src/services/merchant.service.js
backend/src/services/commerce.service.js
```

Integration coverage is located under:

```text
backend/tests/integration/
```

## Deployment

After backend changes are merged into `main`, update the Oracle server with:

```bash
cd ~/Yalla
git pull origin main
bash deploy.sh
```

No mobile application update is required for backend-only flow changes.

A mobile release is only needed when the Flutter UI itself is changed, for example to visibly show `reservedBalance` and `availableBalance`.

## CI Expectations

Before production deployment, the following should remain green:

```text
admin-build
backend unit tests
backend integration tests
```

Any failure in wallet, settlement, cancellation, merchant flow or restaurant-order integration tests should block deployment until investigated.
