const { getSession, setSession, clearSession } = require("./session");
const supabase = require("../db/supabase");
const {
  dayjs,
  formatDate,
  formatToDayDate,
  isValidFutureDate,
  TIMEZONE,
} = require("../utils/date");

const STEPS = {
  NAME: "WAITING_FOR_NAME",
  DATE: "WAITING_FOR_DATE",
  TIME: "WAITING_FOR_TIME",
  CUSTOM_DATE: "WAITING_FOR_CUSTOM_DATE",
  CONFIRM: "WAITING_FOR_CONFIRMATION",
};

const startAddFlow = (bot, chatId) => {
  setSession(chatId, { step: STEPS.NAME, taskData: {} });
  bot.sendMessage(
    chatId,
    "📝 **New Task**\n\nPlease type the name of the task:",
    { parse_mode: "Markdown" },
  );
};

const processStep = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const session = getSession(chatId);
  if (!session.step) return;

  switch (session.step) {
    case STEPS.NAME:
      setSession(chatId, {
        step: STEPS.DATE,
        taskData: { ...session.taskData, title: text },
      });

      const dateOpts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Today", callback_data: "date:today" },
              { text: "Tomorrow", callback_data: "date:tomorrow" },
            ],
            [
              { text: "2 Days", callback_data: "date:2" },
              { text: "4 Days", callback_data: "date:4" },
            ],
            [
              { text: "1 Week", callback_data: "date:7" },
              { text: "2 Weeks", callback_data: "date:14" },
            ],
            [
              {
                text: "📅 Specific Date (YYYY-MM-DD)",
                callback_data: "date:custom",
              },
            ],
          ],
        },
      };
      bot.sendMessage(chatId, `Got it: "<b>${text}</b>".\n\nWhen is it due?`, {
        parse_mode: "HTML",
        ...dateOpts,
      });
      break;

    case STEPS.CUSTOM_DATE:
      // 🟢 VALIDATION: Must be future
      if (!isValidFutureDate(text)) {
        return bot.sendMessage(
          chatId,
          "❌ Invalid date. Please use YYYY-MM-DD and ensure it is not in the past.",
        );
      }
      handleDateSelection(bot, chatId, text);
      break;
  }
};

const handleWizardCallback = async (bot, query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);

  if (data.startsWith("date:")) {
    const type = data.split(":")[1];
    let dateStr;

    if (type === "custom") {
      setSession(chatId, { step: STEPS.CUSTOM_DATE });
      return bot.sendMessage(chatId, "📅 Please type the date (YYYY-MM-DD):");
    }

    // Handle numeric day offsets (2, 4, 7, 14)
    if (!isNaN(type)) {
      dateStr = dayjs().add(parseInt(type), "day").format("YYYY-MM-DD");
    } else if (type === "today") {
      dateStr = dayjs().format("YYYY-MM-DD");
    } else if (type === "tomorrow") {
      dateStr = dayjs().add(1, "day").format("YYYY-MM-DD");
    }

    handleDateSelection(bot, chatId, dateStr);
  }

  if (data.startsWith("time:")) {
    const timeStr = data.split(":")[1];
    const baseDate = session.taskData.dateRaw;
    const finalDateTime = dayjs(`${baseDate} ${timeStr}`).tz(TIMEZONE, true);

    setSession(chatId, {
      step: STEPS.CONFIRM,
      taskData: { ...session.taskData, finalDate: finalDateTime },
    });

    const confirmOpts = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "❌ Cancel", callback_data: "confirm:no" },
            { text: "✅ Save Task", callback_data: "confirm:yes" },
          ],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      `📋 <b>Confirm Task?</b>\n\n🔹 <b>Task:</b> ${session.taskData.title}\n🔹 <b>Due:</b> ${formatDate(finalDateTime)}`,
      confirmOpts,
    );
  }

  if (data.startsWith("confirm:")) {
    const decision = data.split(":")[1];
    if (decision === "no") {
      clearSession(chatId);
      return bot.sendMessage(chatId, "❌ Task creation cancelled.");
    }

    try {
      let { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", chatId)
        .single();

      // Auto-register if user not found
      if (!user) {
        await supabase
          .from("users")
          .upsert(
            { telegram_id: chatId, username: query.from?.username || null },
            { onConflict: "telegram_id" }
          );
        const result = await supabase
          .from("users")
          .select("id")
          .eq("telegram_id", chatId)
          .single();
        user = result.data;
      }

      if (!user) {
        clearSession(chatId);
        return bot.sendMessage(chatId, "⚠️ Could not register. Please send /start first.");
      }

      await supabase.from("tasks").insert({
        user_id: user.id,
        title: session.taskData.title,
        due_date: session.taskData.finalDate.toISOString(),
      });

      bot.sendMessage(chatId, "✅ <b>Task Saved Successfully!</b>", {
        parse_mode: "HTML",
      });
      clearSession(chatId);
      const { showDashboard } = require("./handlers");
      showDashboard(bot, chatId);
    } catch (e) {
      console.error(e);
      bot.sendMessage(chatId, "⚠️ Error saving task.");
    }
  }
};

const handleDateSelection = (bot, chatId, dateStr) => {
  const session = getSession(chatId);
  setSession(chatId, {
    step: STEPS.TIME,
    taskData: { ...session.taskData, dateRaw: dateStr },
  });

  const timeOpts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🌅 Morning (09:00)", callback_data: "time:09:00" },
          { text: "☀️ Noon (12:00)", callback_data: "time:12:00" },
        ],
        [
          { text: "🌇 Afternoon (15:00)", callback_data: "time:15:00" },
          { text: "🌙 Evening (20:00)", callback_data: "time:20:00" },
        ],
      ],
    },
  };
  bot.sendMessage(
    chatId,
    `Date set: ${dateStr}. \n⏰ What time is it due?`,
    timeOpts,
  );
};

module.exports = { startAddFlow, processStep, handleWizardCallback };
    