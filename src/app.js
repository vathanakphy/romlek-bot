require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const supabase = require("./db/supabase");
const {
  handleStart,
  handleListTasks,
  handleMyTasks,
  handleDelete,
  handleClear,
  processClearConfirm,
  handleCallback,
  handleHelp,
  showDashboard,
} = require("./bot/handlers");
const {
  startAddFlow,
  processStep,
  handleWizardCallback,
} = require("./bot/wizard");
const {
  startSimpleTask,
  processSimpleName,
  handleSimpleDateCallback,
  processSimpleDayText,
  autoDetectTask,
  handleDayCommand,
  SIMPLE_STEP,
  WAITING_DAY,
} = require("./bot/simple-task");
const { getSession } = require("./bot/session");
const initScheduler = require("./scheduler/reminder.job");

// ─── Supabase Health Check ───
async function checkSupabase() {
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    return false;
  }
}

async function waitForSupabase() {
  console.log("🔌 Checking Supabase connection...");
  let attempt = 1;
  while (true) {
    const ok = await checkSupabase();
    if (ok) {
      console.log("✅ Supabase is connected!\n");
      return;
    }
    console.log(
      `❌ Attempt ${attempt}: Supabase unreachable. Retrying in 5s...`
    );
    attempt++;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ─── Start Bot ───
async function startBot() {
  await waitForSupabase();

  const app = express();
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });

  // Menu Button
  bot.setMyCommands([
    { command: "/start", description: "🏠 Home" },
    { command: "/task", description: "⚡ Quick Task" },
    { command: "/add", description: "➕ Add (detailed)" },
    { command: "/list", description: "📋 Active Tasks" },
    { command: "/mytasks", description: "📊 All Tasks" },
    { command: "/delete", description: "🗑️ Delete Task" },
    { command: "/clear", description: "🧹 Clear All Tasks" },
  ]);

  bot.onText(/\/start/, (msg) => handleStart(bot, msg));
  bot.onText(/\/task/, (msg) => startSimpleTask(bot, msg.chat.id));
  bot.onText(/\/add/, (msg) => startAddFlow(bot, msg.chat.id));
  bot.onText(/\/list/, (msg) => handleListTasks(bot, msg));
  bot.onText(/\/mytasks?/, (msg) => handleMyTasks(bot, msg));
  bot.onText(/\/delete/, (msg) => handleDelete(bot, msg));
  bot.onText(/\/clear/, (msg) => handleClear(bot, msg));
  bot.onText(/\/help/, (msg) => handleHelp(bot, msg));

  bot.on("message", (msg) => {
    if (!msg.text) return;

    // Handle /N commands (e.g. "/1", "/3 buy milk", "/2h", "/1d;1pm")
    if (msg.text.startsWith("/")) {
      const dayMatch = msg.text.match(/^\/(\d+[a-zA-Z0-9;]*)(?:\s+(.+))?$/);
      if (dayMatch) return handleDayCommand(bot, msg, dayMatch);
      return; // other commands handled by onText
    }

    const session = getSession(msg.chat.id);
    if (session.step === "WAITING_CLEAR_CONFIRM") return processClearConfirm(bot, msg);
    if (session.step === SIMPLE_STEP) return processSimpleName(bot, msg);
    if (session.step === WAITING_DAY) return processSimpleDayText(bot, msg);
    if (session.step) return processStep(bot, msg);
    // Auto-detect: plain text with 2+ words → treat as quick task
    // Supports inline "/N" at end, e.g. "deploy romlek /1"
    autoDetectTask(bot, msg);
  });

  bot.on("callback_query", (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    if (data === "cmd_add") return startAddFlow(bot, chatId);
    if (data === "cmd_quick_task") return startSimpleTask(bot, chatId);
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
    if (data.startsWith("quick_date:"))
      return handleSimpleDateCallback(bot, query);
    if (data.startsWith("prog:") || data.startsWith("del:")) return handleCallback(bot, query);
  });

  initScheduler(bot);
  app.get("/", (req, res) => res.send("Bot is running..."));
  app.listen(process.env.PORT || 6030);

  console.log("🤖 Bot is running!");
}

startBot();
