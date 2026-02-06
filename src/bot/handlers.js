const supabase = require("../db/supabase");
const { formatDate } = require("../utils/date");

const showDashboard = (bot, chatId) => {
  const options = {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Add New Task", callback_data: "cmd_add" },
          { text: "📋 View My Tasks", callback_data: "cmd_list" },
        ],
        [{ text: "❓ Help", callback_data: "cmd_help" }],
      ],
    },
  };
  bot.sendMessage(chatId, "👇 <b>What would you like to do next?</b>", options);
};

const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.first_name || "Friend";
  try {
    await supabase
      .from("users")
      .upsert(
        { telegram_id: chatId, username: msg.from.username },
        { onConflict: "telegram_id" },
      );
    const message = `👋 <b>Hi, ${username}!</b>\n\nI am your Task Assistant.\n\n👇 <b>What would you like to do?</b>`;
    bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "➕ Add New Task", callback_data: "cmd_add" },
            { text: "📋 View My Tasks", callback_data: "cmd_list" },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(err);
  }
};

const handleHelp = (bot, msg) => {
  const chatId = msg.chat.id;
  const helpText = `📚 **How to use**\n\nUse buttons to add/view tasks. For specific dates, use YYYY-MM-DD.`;
  bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
};

const handleListTasks = async (bot, msg) => {
  const chatId = msg.chat.id;
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", chatId)
      .single();
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userData.id)
      .eq("is_completed", false)
      .order("due_date", { ascending: true });

    if (!tasks || tasks.length === 0) {
      bot.sendMessage(chatId, "🎉 You have no pending tasks!");
      return showDashboard(bot, chatId);
    }

    for (const task of tasks) {
      const message = `📝 <b>${task.title}</b>\n⏰ Due: ${formatDate(task.due_date)}\n📊 Progress: ${task.progress}%`;
      const opts = {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "25%", callback_data: `prog:25:${task.id}` },
              { text: "50%", callback_data: `prog:50:${task.id}` },
              { text: "75%", callback_data: `prog:75:${task.id}` },
              { text: "✅ Done", callback_data: `prog:100:${task.id}` },
            ],
          ],
        },
      };
      await bot.sendMessage(chatId, message, opts);
    }
  } catch (err) {
    console.error(err);
  }
};

const handleCallback = async (bot, query) => {
  const chatId = query.message.chat.id;
  const [action, value, taskId] = query.data.split(":");
  if (action === "prog") {
    const isDone = value === "100";
    await supabase
      .from("tasks")
      .update({ progress: parseInt(value), is_completed: isDone })
      .eq("id", taskId);
    const responseText = isDone
      ? "🎉 Task Completed!"
      : `📊 Progress updated to ${value}%`;
    bot.answerCallbackQuery(query.id, { text: responseText });
    bot.sendMessage(chatId, responseText);
    showDashboard(bot, chatId);
  }
};

module.exports = {
  handleStart,
  handleHelp,
  handleListTasks,
  handleCallback,
  showDashboard,
};
