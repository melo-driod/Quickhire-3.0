const Notification = require("../models/Notification");

async function notify(user, type, title, message, data = {}) {
  return Notification.create({ user, type, title, message, data });
}

module.exports = notify;
