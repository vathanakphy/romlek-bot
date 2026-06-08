const supabase = require("../db/supabase");
const { formatDate } = require("../utils/date");
const { setSession, clearSession } = require("./session");

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
    let { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", chatId)
      .single();

    // Auto-register if user not found
    if (!userData) {
      await supabase
        .from("users")
        .upsert(
          { telegram_id: chatId, username: msg.from?.username || null },
          { onConflict: "telegram_id" }
        );
      const result = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", chatId)
        .single();
      userData = result.data;
    }

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
  const parts = query.data.split(":");
  const action = parts[0];

  if (action === "del") {
    const taskId = parts[1];
    await supabase.from("tasks").delete().eq("id", taskId);
    await bot.editMessageText("🗑️ <i>Task deleted.</i>", {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "HTML"
    });
    return bot.answerCallbackQuery(query.id, { text: "Task deleted!" });
  }

  if (action !== "prog") return;

  const value = parts[1];
  const taskId = parts[2];

  const isDone = value === "100";

  await supabase
    .from("tasks")
    .update({
      progress: parseInt(value),
      is_completed: isDone,
    })
    .eq("id", taskId);

  // Fetch updated task to rebuild the message
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (task) {
    const updatedMessage = isDone
      ? `✅ <s>${task.title}</s>\n⏰ Due: ${formatDate(task.due_date)}\n📊 Progress: 100% — Done!`
      : `📝 <b>${task.title}</b>\n⏰ Due: ${formatDate(task.due_date)}\n📊 Progress: ${value}%`;

    // Update message text and remove buttons if done
    await bot.editMessageText(updatedMessage, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: isDone
        ? { inline_keyboard: [] }
        : {
            inline_keyboard: [
              [
                { text: "25%", callback_data: `prog:25:${taskId}` },
                { text: "50%", callback_data: `prog:50:${taskId}` },
                { text: "75%", callback_data: `prog:75:${taskId}` },
                { text: "✅ Done", callback_data: `prog:100:${taskId}` },
              ],
            ],
          },
    });
  }

  await bot.answerCallbackQuery(query.id, {
    text: isDone ? "🎉 Task Completed!" : `📊 Progress ${value}%`,
  });

  if (isDone) showDashboard(bot, chatId);
};


const handleMyTasks = async (bot, msg) => {
  const chatId = msg.chat.id;
  try {
    let { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", chatId)
      .single();

    if (!userData) {
      await supabase
        .from("users")
        .upsert(
          { telegram_id: chatId, username: msg.from?.username || null },
          { onConflict: "telegram_id" }
        );
      const result = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", chatId)
        .single();
      userData = result.data;
    }

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userData.id)
      .order("is_completed", { ascending: true })
      .order("due_date", { ascending: true });

    if (!tasks || tasks.length === 0) {
      return bot.sendMessage(chatId, "📭 You have no tasks yet.");
    }

    const pending = tasks.filter((t) => !t.is_completed);
    const completed = tasks.filter((t) => t.is_completed);

    let text = "📋 <b>My Tasks</b>\n";

    if (pending.length > 0) {
      text += "\n<b>⏳ Pending</b>\n";
      pending.forEach((t, i) => {
        text += `${i + 1}. ${t.title} — ${formatDate(t.due_date)} (${t.progress}%)\n`;
      });
    }

    if (completed.length > 0) {
      text += "\n<b>✅ Completed</b>\n";
      completed.forEach((t, i) => {
        text += `${i + 1}. <s>${t.title}</s> — ${formatDate(t.due_date)}\n`;
      });
    }

    text += `\n📊 ${completed.length}/${tasks.length} done`;

    bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error("handleMyTasks error:", err);
    bot.sendMessage(chatId, "⚠️ Error loading tasks.");
  }
};

const handleDelete = async (bot, msg) => {
  const chatId = msg.chat.id;
  try {
    const { data: userData } = await supabase.from("users").select("id").eq("telegram_id", chatId).single();
    if (!userData) return bot.sendMessage(chatId, "📭 You have no tasks to delete.");

    const { data: tasks } = await supabase.from("tasks").select("*").eq("user_id", userData.id).order("due_date", { ascending: true });
    if (!tasks || tasks.length === 0) return bot.sendMessage(chatId, "📭 You have no tasks to delete.");

    const buttons = tasks.map(t => [{ text: `🗑️ ${t.title} ${t.is_completed ? '(Done)' : ''}`, callback_data: `del:${t.id}` }]);
    
    bot.sendMessage(chatId, "🗑️ <b>Select a task to delete:</b>", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) {
    console.error("handleDelete error:", err);
    bot.sendMessage(chatId, "⚠️ Error loading tasks.");
  }
};

const handleClear = async (bot, msg) => {
  const chatId = msg.chat.id;
  setSession(chatId, { step: "WAITING_CLEAR_CONFIRM" });
  bot.sendMessage(chatId, "⚠️ <b>Are you sure you want to delete ALL tasks?</b>\n\nType <code>Confirm</code> to proceed or anything else to cancel.", { parse_mode: "HTML" });
};

const processClearConfirm = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() || "";
  
  if (text !== "Confirm") {
    clearSession(chatId);
    return bot.sendMessage(chatId, "❌ Clear cancelled.");
  }
  
  try {
    const { data: userData } = await supabase.from("users").select("id").eq("telegram_id", chatId).single();
    if (userData) {
      await supabase.from("tasks").delete().eq("user_id", userData.id);
    }
    bot.sendMessage(chatId, "✅ <b>All tasks have been cleared!</b>", { parse_mode: "HTML" });
    clearSession(chatId);
  } catch (err) {
    console.error("Clear tasks error:", err);
    bot.sendMessage(chatId, "⚠️ Error clearing tasks.");
    clearSession(chatId);
  }
};

module.exports = {
  handleStart,
  handleHelp,
  handleListTasks,
  handleMyTasks,
  handleDelete,
  handleClear,
  processClearConfirm,
  handleCallback,
  showDashboard,
};
