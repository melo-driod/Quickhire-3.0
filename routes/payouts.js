const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { auth, adminOnly } = require("../middleware/auth");
const Payment = require("../models/Payment");
const Withdrawal = require("../models/Withdrawal");
const PayoutAccount = require("../models/PayoutAccount");
const User = require("../models/User");

async function paystack(pathname, options = {}) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("Paystack is not configured");
  const response = await fetch(`https://api.paystack.co${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status) throw new Error(data.message || "Paystack request failed");
  return data;
}

function cleanAccountNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameTokens(value) {
  return new Set(normalizeName(value).split(/\s+/).filter(Boolean));
}

function nameMatch(userName, accountName) {
  const a = nameTokens(userName);
  const b = nameTokens(accountName);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common / Math.max(a.size, b.size);
}

// Fetches Paystack's current Nigerian transfer-bank list, so QuickHire can support
// commercial banks and eligible fintech/digital banks without hard-coding a stale list.
router.get("/banks", auth, async (req, res) => {
  try {
    const data = await paystack("/bank?country=nigeria&currency=NGN&perPage=1000");
    const banks = (data.data || []).filter(b => b.active !== false && b.is_deleted !== true && b.type === "nuban");
    res.json({ banks });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not load Nigerian banks" });
  }
});

router.get("/account", auth, async (req, res) => {
  const account = await PayoutAccount.findOne({ provider: req.user._id, active: true }).select("bankName bankCode accountName accountLast4 verifiedAt cooldownUntil active");
  res.json({ account });
});

// Verifies the bank account against Paystack before a recipient can ever receive money.
// Only the resolved account name is stored. The full account number is not stored by QuickHire.
router.post("/verify-account", auth, async (req, res) => {
  try {
    const accountNumber = cleanAccountNumber(req.body.accountNumber);
    const bankCode = String(req.body.bankCode || "").trim();
    if (!/^\d{10}$/.test(accountNumber)) return res.status(400).json({ message: "Enter a valid 10-digit Nigerian account number" });
    if (!/^\d+$/.test(bankCode)) return res.status(400).json({ message: "Select a valid bank" });

    const resolved = await paystack(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
    const accountName = String(resolved.data?.account_name || "").trim();
    if (!accountName) return res.status(400).json({ message: "The bank could not verify this account" });

    const banks = await paystack("/bank?country=nigeria&currency=NGN&perPage=1000");
    const bank = (banks.data || []).find(b => String(b.code) === bankCode);
    if (!bank) return res.status(400).json({ message: "Selected bank is not available for Nigerian transfers" });

    const recipient = await paystack("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
        metadata: { quickhireUserId: String(req.user._id), verification: "account-resolve" }
      })
    });

    const now = new Date();
    const cooldownHours = Math.max(1, Number(process.env.PAYOUT_ACCOUNT_COOLDOWN_HOURS || 24));
    const existing = await PayoutAccount.findOne({ provider: req.user._id });
    const accountChanged = !existing || existing.bankCode !== bankCode || existing.accountLast4 !== accountNumber.slice(-4);
    const cooldownUntil = accountChanged ? new Date(now.getTime() + cooldownHours * 60 * 60 * 1000) : (existing.cooldownUntil || now);

    const saved = await PayoutAccount.findOneAndUpdate(
      { provider: req.user._id },
      {
        provider: req.user._id,
        bankName: bank.name,
        bankCode,
        accountName,
        accountLast4: accountNumber.slice(-4),
        recipientCode: recipient.data.recipient_code,
        verifiedAt: now,
        cooldownUntil,
        active: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const match = nameMatch(req.user.name, accountName);
    const riskFlag = match < 0.5 ? "payout_account_name_differs_from_profile" : null;
    res.json({
      verified: true,
      account: {
        bankName: saved.bankName,
        accountName: saved.accountName,
        accountLast4: saved.accountLast4,
        verifiedAt: saved.verifiedAt,
        cooldownUntil: saved.cooldownUntil
      },
      security: {
        accountNameMatchesProfile: match >= 0.5,
        manualReviewRecommended: Boolean(riskFlag),
        riskFlag
      },
      message: accountChanged
        ? `Account verified. For security, withdrawals to a newly changed account are locked for ${cooldownHours} hours.`
        : "Account verified successfully."
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not verify payout account" });
  }
});

router.get("/balance", auth, async (req, res) => {
  try {
    const [payments, withdrawals] = await Promise.all([
      Payment.aggregate([
        { $match: { provider: req.user._id, status: "success", currency: "NGN" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Withdrawal.aggregate([
        { $match: { provider: req.user._id, status: { $in: ["pending", "success", "review"] }, currency: "NGN" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);
    const earned = payments[0]?.total || 0;
    const reserved = withdrawals[0]?.total || 0;
    res.json({ earned, withdrawn: reserved, available: Math.max(0, earned - reserved), currency: "NGN" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not calculate balance" });
  }
});

router.post("/withdraw", auth, async (req, res) => {
  try {
    const amount = Math.floor(Number(req.body.amount));
    const password = String(req.body.password || "");
    if (!Number.isFinite(amount) || amount < 100) return res.status(400).json({ message: "Minimum withdrawal is ₦100" });
    if (!password) return res.status(400).json({ message: "Enter your QuickHire password to confirm this withdrawal" });
    if (!(await bcrypt.compare(password, (await User.findById(req.user._id)).password))) {
      return res.status(401).json({ message: "Withdrawal confirmation failed" });
    }

    const payoutAccount = await PayoutAccount.findOne({ provider: req.user._id, active: true });
    if (!payoutAccount) return res.status(400).json({ message: "Verify a payout bank account before withdrawing" });
    if (payoutAccount.cooldownUntil > new Date()) {
      return res.status(400).json({ message: `For security, withdrawals are locked until ${payoutAccount.cooldownUntil.toLocaleString()}` });
    }

    const [earnedAgg, withdrawnAgg, pendingCount, dailyAgg] = await Promise.all([
      Payment.aggregate([{ $match: { provider: req.user._id, status: "success", currency: "NGN" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Withdrawal.aggregate([{ $match: { provider: req.user._id, status: { $in: ["pending", "success", "review"] }, currency: "NGN" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Withdrawal.countDocuments({ provider: req.user._id, status: { $in: ["pending", "review"] } }),
      Withdrawal.aggregate([
        { $match: { provider: req.user._id, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, status: { $in: ["pending", "success", "review"] }, currency: "NGN" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const available = Math.max(0, (earnedAgg[0]?.total || 0) - (withdrawnAgg[0]?.total || 0));
    const dailyLimit = Math.max(1000, Number(process.env.PAYOUT_DAILY_LIMIT_NGN || 500000));
    const dailyTotal = dailyAgg[0]?.total || 0;
    if (pendingCount >= 1) return res.status(409).json({ message: "You already have a withdrawal being processed. Wait for it to finish before starting another." });
    if (amount > available) return res.status(400).json({ message: `Insufficient available balance. Available: ₦${available.toLocaleString()}` });
    if (dailyTotal + amount > dailyLimit) return res.status(400).json({ message: `Daily payout limit is ₦${dailyLimit.toLocaleString()}` });

    const match = nameMatch(req.user.name, payoutAccount.accountName);
    const riskFlags = match < 0.5 ? ["payout_account_name_differs_from_profile"] : [];
    const reference = `qh_payout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`.toLowerCase();

    // If a payout account name differs materially from the profile, hold it for manual review
    // instead of automatically moving money.
    if (riskFlags.length) {
      const review = await Withdrawal.create({
        provider: req.user._id,
        amount,
        bankName: payoutAccount.bankName,
        accountName: payoutAccount.accountName,
        accountLast4: payoutAccount.accountLast4,
        recipientCode: payoutAccount.recipientCode,
        reference,
        status: "review",
        reason: "Manual review required before payout",
        riskFlags
      });
      return res.status(202).json({ message: "Withdrawal received and placed in security review because the payout account name differs from the profile name.", withdrawal: review });
    }

    const withdrawal = await Withdrawal.create({
      provider: req.user._id,
      amount,
      bankName: payoutAccount.bankName,
      accountName: payoutAccount.accountName,
      accountLast4: payoutAccount.accountLast4,
      recipientCode: payoutAccount.recipientCode,
      reference,
      status: "pending"
    });

    try {
      const transfer = await paystack("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: amount * 100,
          recipient: payoutAccount.recipientCode,
          reference,
          reason: "QuickHire provider payout",
          currency: "NGN"
        })
      });
      withdrawal.status = transfer.data?.status === "success" ? "success" : "pending";
      withdrawal.transferCode = transfer.data?.transfer_code || "";
      await withdrawal.save();
      return res.json({ message: "Withdrawal submitted securely", withdrawal });
    } catch (transferError) {
      withdrawal.status = "failed";
      withdrawal.reason = transferError.message || "Transfer failed";
      await withdrawal.save();
      throw transferError;
    }
  } catch (error) {
    res.status(400).json({ message: error.message || "Withdrawal failed" });
  }
});

router.get("/history", auth, async (req, res) => {
  const withdrawals = await Withdrawal.find({ provider: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ withdrawals });
});

// Admin review for high-risk payout requests.
router.get("/admin/review", auth, adminOnly, async (req, res) => {
  const withdrawals = await Withdrawal.find({ status: "review" }).populate("provider", "name email phone").sort({ createdAt: -1 }).limit(100);
  res.json({ withdrawals });
});

router.post("/admin/review/:id", auth, adminOnly, async (req, res) => {
  try {
    const decision = String(req.body.decision || "");
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: "Decision must be approve or reject" });
    const withdrawal = await Withdrawal.findOne({ _id: req.params.id, status: "review" });
    if (!withdrawal) return res.status(404).json({ message: "Review payout not found" });
    if (decision === "reject") {
      withdrawal.status = "failed";
      withdrawal.reason = "Rejected by QuickHire security review";
      await withdrawal.save();
      return res.json({ message: "Payout rejected", withdrawal });
    }

    const transfer = await paystack("/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: withdrawal.amount * 100,
        recipient: withdrawal.recipientCode,
        reference: withdrawal.reference,
        reason: "QuickHire provider payout - approved",
        currency: "NGN"
      })
    });
    withdrawal.status = transfer.data?.status === "success" ? "success" : "pending";
    withdrawal.transferCode = transfer.data?.transfer_code || "";
    withdrawal.reason = "Approved by QuickHire security review";
    await withdrawal.save();
    res.json({ message: "Payout approved and submitted", withdrawal });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not process payout review" });
  }
});

module.exports = router;
