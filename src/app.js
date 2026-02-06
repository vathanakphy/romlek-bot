require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const {
  handleStart,
  handleListTasks,
  handleCallback,
  handleHelp,
  showDashboard,
} = require("./bot/handlers");
const {
  startAddFlow,
  processStep,
  handleWizardCallback,
} = require("./bot/wizard");
const { getSession } = require("./bot/session");
const initScheduler = require("./scheduler/reminder.job");

const app = express();
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Menu Button
bot.setMyCommands([
  { command: "/start", description: "🏠 Home" },
  { command: "/add", description: "➕ Add" },
  { command: "/list", description: "📋 List" },
]);

bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/add/, (msg) => startAddFlow(bot, msg.chat.id));
bot.onText(/\/list/, (msg) => handleListTasks(bot, msg));
bot.onText(/\/help/, (msg) => handleHelp(bot, msg));

bot.on("message", (msg) => {
  if (msg.text && msg.text.startsWith("/")) return;
  if (getSession(msg.chat.id).step) processStep(bot, msg);
});

bot.on("callback_query", (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  if (data === "cmd_add") return startAddFlow(bot, chatId);
  if (data === "cmd_list")
    return handleListTasks(bot, { chat: { id: chatId } });
  if (data === "cmd_help") return handleHelp(bot, { chat: { id: chatId } });

  if (
    data.startsWith("date:") ||
    data.startsWith("time:") ||
    data.startsWith("confirm:")
  ) {
    return handleWizardCallback(bot, query);
  }
  if (data.startsWith("prog:")) return handleCallback(bot, query);
});

initScheduler(bot);
app.get("/", (req, res) => res.send("Bot is running..."));
app.listen(process.env.PORT || 3000);
