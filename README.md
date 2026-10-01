# QuickHire 3.0

QuickHire is a full-stack marketplace where people can publish services/products and customers can discover, chat, hire, pay and review providers.

## Version 3 additions

- Real-time messaging with Socket.IO
- Provider profile pages
- Portfolio/service gallery
- Service detail pages
- Review and rating flow tied to completed hires
- Customer payment/order history
- Provider transaction history API
- Improved dashboard
- Real-time notification events
- Existing Paystack integration
- Existing admin moderation
- Existing security controls
- Existing image uploads
- Docker + Render deployment files

## Setup

Install Node.js 20+:

```bash
npm install
```

Copy `.env.example` to `.env` and fill in:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
APP_URL=http://localhost:5000
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_CURRENCY=NGN
CORS_ORIGIN=http://localhost:5000
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:5000
```

## Real-time chat

The browser authenticates Socket.IO using the same JWT used by the REST API.

Messages are persisted in MongoDB and delivered immediately to both users in a conversation room.

For a larger production system, consider Redis-backed Socket.IO adapters when running multiple server instances.

## Provider profiles

Each provider has:

- Name
- Avatar URL
- Bio
- Location
- Phone
- Published services
- Portfolio images through service listings

Provider profile endpoint:

```text
GET /api/profile/:id
```

Current-user profile update:

```text
PUT /api/profile/me
```

## Service gallery

A listing can contain up to 5 images, each limited to 5MB and restricted to image MIME types.

Images currently live under `/uploads`.

For production at scale, move them to S3-compatible storage or Cloudinary. Store only URLs in MongoDB.

## Reviews

A customer can review a service only after a completed hire.

Endpoints:

```text
GET /api/reviews/:serviceId
POST /api/reviews
```

The review contains a 1-5 rating and optional comment.

## Orders / payment history

Customer:

```text
GET /api/orders/mine
```

Provider:

```text
GET /api/orders/provider
```

Payments use Paystack initialization and server-side verification.

For a real-money production launch, add and verify Paystack webhooks as the authoritative payment event source, then reconcile payment records.

## Admin

Set a user's MongoDB `role` to `admin` for development.

The admin can:

- View platform statistics
- See pending service listings
- Approve or reject listings
- Manage user roles through the admin API

Use a controlled admin bootstrap process for production.

## Deployment

### Docker

```bash
docker compose up --build
```

### Render

The included `render.yaml` is a starting point. Set production secrets in the hosting provider rather than committing them.

For a scalable deployment, use:

- MongoDB Atlas
- Object storage for images
- Redis if scaling Socket.IO horizontally
- HTTPS
- Paystack webhooks
- Monitoring/logging
- Backups

## Production checklist

Before public launch:

- Use HTTPS
- Keep secrets out of source control
- Use a strong JWT secret
- Add email verification
- Add password reset
- Add HTTP-only refresh-token cookies
- Add stricter request validation
- Add CSRF protection if cookie-based auth is used
- Add image malware/content scanning
- Move uploads to object storage
- Verify Paystack webhook signatures
- Add fraud/abuse controls
- Add audit logs
- Add database backups
- Add privacy policy and terms
- Add dispute/refund workflows
- Add platform fee/payout logic if QuickHire will take commission
- Consider escrow or controlled payment release for high-value jobs
- Add Redis Socket.IO adapter if running multiple server instances

## Provider earnings & OPay/bank payouts

QuickHire 3.0 now includes a provider payout module at **Dashboard → Earnings & Payouts**. It loads Paystack's current Nigerian transfer banks, lets a provider choose a supported bank (including OPay when Paystack exposes it), creates a transfer recipient, calculates available earnings from successful customer payments, and submits withdrawals through Paystack Transfers.

Paystack Transfers are subject to Paystack account eligibility and configuration. As of September 28, 2026, Paystack states that Transfers are available only to registered businesses. Enable Transfers on the Paystack business account before using live withdrawals. Never put the Paystack secret key in frontend code or GitHub.

For production, add Paystack webhook handling for transfer status changes and reconciliation rather than relying only on the immediate API response.

## Secure Nigerian payouts

QuickHire now supports payouts to the current Nigerian `nuban` transfer destinations exposed by Paystack rather than hard-coding a short list. This can include eligible commercial banks and digital/fintech institutions when Paystack exposes them for NGN transfers.

Security controls added:
- Paystack Resolve Account Number verification before a payout account can be used.
- Full account numbers are not stored in QuickHire; only the last four digits and Paystack recipient code are retained.
- The resolved bank account name is used rather than trusting a user-supplied account name.
- A configurable payout-account change cooldown (default 24 hours).
- QuickHire password confirmation for every withdrawal.
- One pending/review withdrawal at a time.
- Configurable daily payout limit (default NGN 500,000).
- Name-risk detection. Material mismatch between the user's profile name and the verified payout account places the payout into admin security review instead of automatically sending it.
- Admin approve/reject endpoints and dashboard controls for security-review payouts.
- Payout references are generated with cryptographically secure random bytes.
- Paystack remains the money movement provider, so QuickHire never handles raw card credentials.

These controls reduce common payout fraud risks but do not guarantee that every scam or fraudulent account can be detected. For production, enable Paystack's transfer approval/security controls and complete any required business/KYC onboarding.
