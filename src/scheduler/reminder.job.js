const cron = require("node-cron");
const supabase = require("../db/supabase");
const dayjs = require("dayjs");

const initScheduler = (bot) => {
  cron.schedule("0 * * * *", async () => {
    try {
      const { data: tasks } = await supabase
        .from("tasks")
        .select(`*, users(telegram_id)`)
        .eq("is_completed", false);
      tasks.forEach((task) => {
        const diffHours = dayjs(task.due_date).diff(dayjs(), "hour");
        if (diffHours === 24 || diffHours === 1) {
          bot.sendMessage(
            task.users.telegram_id,
            `🚨 <b>Reminder:</b> "${task.title}" is due in ${diffHours} hour(s)!`,
            { parse_mode: "HTML" },
          );
        }
      });
    } catch (err) {
      console.error(err);
    }
  });
};
module.exports = initScheduler;
