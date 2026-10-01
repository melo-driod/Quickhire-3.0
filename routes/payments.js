const router = require("express").Router();
const Payment = require("../models/Payment");
const Service = require("../models/Service");
const { auth } = require("../middleware/auth");
const notify = require("../utils/notify");

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
  const data = await response.json();
  if (!response.ok || !data.status) throw new Error(data.message || "Paystack request failed");
  return data;
}

router.post("/initialize", auth, async (req, res) => {
  try {
    const { serviceId, email } = req.body;
    const service = await Service.findById(serviceId).populate("provider", "name email");
    if (!service || !service.active || !service.approved) return res.status(404).json({ message: "Service not found" });
    if (String(service.provider._id) === String(req.user._id)) return res.status(400).json({ message: "You cannot pay for your own service" });

    const reference = `QH_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    const payment = await Payment.create({
      reference, customer: req.user._id, provider: service.provider._id,
      service: service._id, amount: service.price, currency: process.env.PAYSTACK_CURRENCY || "NGN"
    });

    const data = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: email || req.user.email,
        amount: Math.round(service.price * 100),
        currency: process.env.PAYSTACK_CURRENCY || "NGN",
        reference,
        callback_url: `${process.env.APP_URL || "http://localhost:5000"}/?payment=callback`
      })
    });

    res.json({ authorization_url: data.data.authorization_url, reference, paymentId: payment._id });
  } catch (error) {
    res.status(400).json({ message: error.message || "Payment initialization failed" });
  }
});

router.get("/verify/:reference", auth, async (req, res) => {
  try {
    const data = await paystack(`/transaction/verify/${encodeURIComponent(req.params.reference)}`);
    const payment = await Payment.findOne({ reference: req.params.reference, customer: req.user._id });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.status = data.data.status === "success" ? "success" : "failed";
    await payment.save();

    if (payment.status === "success") {
      await notify(payment.provider, "payment", "Payment received", `A customer paid for your service`, { paymentId: payment._id });
    }

    res.json({ status: payment.status, payment });
  } catch (error) {
    res.status(400).json({ message: error.message || "Payment verification failed" });
  }
});

router.get("/mine", auth, async (req, res) => {
  const payments = await Payment.find({ customer: req.user._id }).populate("service", "title price");
  res.json({ payments });
});

module.exports = router;
