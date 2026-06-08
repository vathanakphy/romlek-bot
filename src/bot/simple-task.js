const { getSession, setSession, clearSession } = require("./session");
const supabase = require("../db/supabase");
const { dayjs, formatDate, TIMEZONE } = require("../utils/date");

const SIMPLE_STEP = "SIMPLE_NAME";
const WAITING_DAY = "WAITING_QUICK_DAY";

const parseTimeSpecToIso = (spec) => {
  const match = spec.match(/^(\d+)([hd])?(?:;(\d+)(am|pm)?)?$/i);
  if (!match) return null;
  
  const amount = parseInt(match[1]);
  const unit = match[2]?.toLowerCase() || 'd';
  const timeVal = match[3];
  const ampm = match[4]?.toLowerCase();

  let dueDate = dayjs().tz(TIMEZONE);

  if (unit === 'h') {
    dueDate = dueDate.add(amount, 'hour');
  } else {
    dueDate = dueDate.add(amount, 'day');
    if (timeVal) {
      let hour = parseInt(timeVal);
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      dueDate = dueDate.hour(hour).minute(0).second(0).millisecond(0);
    } else {
      dueDate = dueDate.endOf('day');
    }
  }
  return dueDate.toISOString();
};

/**
 * Helper: save a task and send success message.
 */
const saveQuickTask = async (bot, chatId, title, dueDateIso) => {
  const dueDate = dueDateIso;

  try {
    // Look up user
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", chatId)
      .single();

    if (userErr) {
      console.error("Supabase user lookup error:", userErr.message);

      // If it's a network error, try to register and save anyway
      if (userErr.message.includes("fetch failed")) {
        bot.sendMessage(chatId, "⚠️ Database connection error. Please try again in a moment.");
        clearSession(chatId);
        return;
      }

      // "No rows found" means user not registered — auto-register
      const { error: regErr } = await supabase
        .from("users")
        .upsert({ telegram_id: chatId }, { onConflict: "telegram_id" });

      if (regErr) {
        console.error("Auto-register error:", regErr.message);
        bot.sendMessage(chatId, "⚠️ Database error. Please try again.");
        clearSession(chatId);
        return;
      }

      // Fetch the newly created user
      const { data: newUser, error: newErr } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", chatId)
        .single();

      if (newErr || !newUser) {
        console.error("Re-fetch user error:", newErr?.message);
        bot.sendMessage(chatId, "⚠️ Database error. Please try again.");
        clearSession(chatId);
        return;
      }

      // Save task with new user
      await supabase.from("tasks").insert({
        user_id: newUser.id,
        title,
        due_date: dueDate,
      });
    } else {
      // User found — save task directly
      await supabase.from("tasks").insert({
        user_id: user.id,
        title,
        due_date: dueDate,
      });
    }

    bot.sendMessage(
      chatId,
      `✅ <b>Task Saved!</b>\n\n📝 ${title}\n⏰ Due: ${formatDate(dueDate)}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "➕ Add Another", callback_data: "cmd_quick_task" },
              { text: "📋 View Tasks", callback_data: "cmd_list" },
            ],
          ],
        },
      }
    );

    clearSession(chatId);
  } catch (err) {
    console.error("Quick task save error:", err.message || err);
    bot.sendMessage(chatId, "⚠️ Error saving task. Please try again.");
    clearSession(chatId);
  }
};

/**
 * Start the simple task flow — ask for the task name.
 */
const startSimpleTask = (bot, chatId) => {
  setSession(chatId, { step: SIMPLE_STEP, taskData: {} });
  bot.sendMessage(chatId, "📝 <b>Quick Task</b>\n\nWhat's the task name?", {
    parse_mode: "HTML",
  });
};

/**
 * Show the day picker buttons for a given task title.
 */
const showDayPicker = (bot, chatId, title) => {
  setSession(chatId, {
    step: WAITING_DAY,
    taskData: { title },
  });

  bot.sendMessage(chatId, `Got it: "<b>${title}</b>"\n\n⏰ When is it due?`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1 Day", callback_data: "quick_date:1" },
          { text: "3 Days", callback_data: "quick_date:3" },
          { text: "7 Days", callback_data: "quick_date:7" },
        ],
      ],
    },
  });
};

/**
 * Process the task name from /task command, then show the 1/3/7 day buttons.
 */
const processSimpleName = (bot, msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  const title = msg.text;

  if (session.taskData && session.taskData.presetDueDate) {
    saveQuickTask(bot, chatId, title, session.taskData.presetDueDate);
  } else {
    showDayPicker(bot, chatId, title);
  }
};

/**
 * Auto-detect: plain text with more than 1 word → treat as a task.
 * If the message ends with /N (e.g. "buy coca /1"), save instantly with N-day due.
 * Otherwise show the day picker buttons.
 * Returns true if it was handled.
 */
const autoDetectTask = (bot, msg) => {
  const text = (msg.text || "").trim();
  if (!text) return false;

  // Check for inline /N at the end (e.g. "buy coca /1" or "5km/2d")
  const inlineMatch = text.match(/^(.*)\s*\/(.+)$/);
  if (inlineMatch) {
    const title = inlineMatch[1].trim();
    const spec = inlineMatch[2];

    const hasSpaceBeforeSlash = /\s\/$/.test(text.substring(0, text.length - spec.length));

    // Prevent matching normal fractions or dates (e.g., "1/2") by verifying:
    // If the spec is purely digits AND there's no space AND the title ends with a digit,
    // it's probably a fraction, so skip it.
    if (/^\d+$/.test(spec) && !hasSpaceBeforeSlash && /\d$/.test(title)) {
      // let it fall through
    } else {
      const dueDate = parseTimeSpecToIso(spec);
      if (title.length > 0 && dueDate) {
        saveQuickTask(bot, msg.chat.id, title, dueDate);
        return true;
      }
    }
  }

  // More than 1 word → treat as task name, show day picker
  const words = text.split(/\s+/);
  if (words.length > 1) {
    showDayPicker(bot, msg.chat.id, text);
    return true;
  }
  return false;
};

/**
 * Handle /N commands like /1, /3, /7 etc.
 * Usage: "/3 buy groceries for dinner" → saves task with 3-day due instantly.
 * Or just "/3" if a task name is already in session (from auto-detect).
 */
const handleDayCommand = async (bot, msg, match) => {
  const chatId = msg.chat.id;
  const spec = match[1];
  const inlineTitle = match[2] ? match[2].trim() : null;
  const session = getSession(chatId);

  const dueDate = parseTimeSpecToIso(spec);
  if (!dueDate) {
    return bot.sendMessage(chatId, "⚠️ Invalid format. Examples: /3, /2h, /1d;1pm");
  }

  // Case 1: /3 buy groceries for dinner  →  title is inline
  if (inlineTitle) {
    return saveQuickTask(bot, chatId, inlineTitle, dueDate);
  }

  // Case 2: /3  →  use title from session (auto-detect or /task flow)
  if (session.taskData && session.taskData.title) {
    return saveQuickTask(bot, chatId, session.taskData.title, dueDate);
  }

  // Case 3: no title at all → ask for one
  setSession(chatId, { step: SIMPLE_STEP, taskData: { presetDueDate: dueDate } });
  bot.sendMessage(
    chatId,
    `📝 <b>Quick Task (${spec})</b>\n\nWhat's the task name?`,
    { parse_mode: "HTML" }
  );
};

/**
 * Handle the date button click — save the task immediately.
 */
const handleSimpleDateCallback = async (bot, query) => {
  const chatId = query.message.chat.id;
  const spec = query.data.split(":")[1];
  const session = getSession(chatId);

  if (!session.taskData || !session.taskData.title) {
    return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired. Use /task again." });
  }

  // Remove the date buttons
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: query.message.message_id }
    );
  } catch (_) {}

  const dueDate = parseTimeSpecToIso(spec);
  await saveQuickTask(bot, chatId, session.taskData.title, dueDate);
};

const processSimpleDayText = (bot, msg) => {
  const chatId = msg.chat.id;
  const spec = msg.text.trim();
  const session = getSession(chatId);

  if (!session.taskData || !session.taskData.title) {
    return bot.sendMessage(chatId, "⚠️ Session expired. Use /task again.");
  }

  const dueDate = parseTimeSpecToIso(spec);
  if (!dueDate) {
    return bot.sendMessage(chatId, "⚠️ Invalid format. Try typing a number (e.g. 3) or advanced format (e.g. 2h, 1d;1pm).");
  }

  saveQuickTask(bot, chatId, session.taskData.title, dueDate);
};

module.exports = {
  startSimpleTask,
  processSimpleName,
  handleSimpleDateCallback,
  processSimpleDayText,
  autoDetectTask,
  handleDayCommand,
  SIMPLE_STEP,
  WAITING_DAY,
};
