# 📋 Romlek Bot — Telegram Task Manager

A powerful, fast, and interactive Telegram bot for managing tasks, tracking progress, and receiving automated reminders. Built with Node.js and Supabase.

---

## 🚀 Features

- **Blazing Fast Task Creation**: Create tasks in seconds using natural language, inline time codes, or an interactive wizard.
- **Progress Tracking**: Interactive inline buttons to track task progress (25%, 50%, 75%, 100%).
- **Smart Time Parsing**: Supports precise deadlines like "in 2 hours" or "tomorrow at 1 PM".
- **Automated Reminders**: Background cron jobs alert you 24 hours and 1 hour before a task is due.
- **Easy Management**: List active tasks, view history, delete specific tasks, or wipe everything clean.

---

## 🛠️ Setup

1. **Clone the repo and install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file:**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   PORT=6030
   ```

3. **Database Setup (Supabase SQL Editor):**
   ```sql
   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     telegram_id BIGINT UNIQUE NOT NULL,
     username TEXT
   );

   CREATE TABLE tasks (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     title TEXT NOT NULL,
     due_date TIMESTAMPTZ,
     progress INTEGER DEFAULT 0,
     is_completed BOOLEAN DEFAULT false
   );
   
   -- Disable RLS for server-side access
   ALTER TABLE users DISABLE ROW LEVEL SECURITY;
   ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
   ```

4. **Run the bot:**
   ```bash
   npm run dev    # development (auto-reload)
   npm start      # production
   ```

---

## 📖 How to Use: Creating Tasks

Romlek Bot is designed to be as frictionless as possible. Here are the 4 ways you can create tasks, ordered from fastest to most detailed.

### 1. ⚡ One-Shot Tasks (Fastest)
Add a time code at the end of any message to instantly create and schedule a task. **Make sure to put a space before the slash.**

**Formats:**
- `buy groceries /1` → Due in 1 day (end of day)
- `finish report /3d` → Due in 3 days (end of day)
- `call mom /2h` → Due in exactly 2 hours
- `team meeting /1d;1pm` → Due tomorrow at 1:00 PM
- `pay bills /2d;13` → Due in 2 days at 13:00 (1:00 PM)
- `morning run /1d;6am` → Due tomorrow at 6:00 AM

*Alternatively, you can put the time code first: `/2h call mom`*

### 2. 🤖 Auto-Detect (Natural Text)
Just type any message with **2 or more words** (e.g., `build login page`). 
The bot will recognize it as a task and ask: **"When is it due?"**. 

You can then either:
- Click the **[1 Day]**, **[3 Days]**, or **[7 Days]** buttons.
- **Type** a custom time code like `2h` or `1d;1pm` to set a specific deadline.

### 3. ⏱️ Quick Task Command
Send `/task`. The bot will prompt you for the task name, and then ask for the due date (same as Auto-Detect).

### 4. 📝 Detailed Wizard
Send `/add`. The bot will guide you through an interactive step-by-step wizard where you can manually select the Date (from a calendar) and Time.

---

## 📖 How to Use: Managing Tasks

### 📊 Tracking Progress (`/list`)
Send `/list` to view your active tasks. Each task comes with interactive progress buttons:

```text
📝 Build login page
⏰ Due: Jun 11, 2026 11:59 PM
📊 Progress: 0%

[25%] [50%] [75%] [✅ Done]
```
Clicking a button updates the message instantly. Clicking **✅ Done** marks it complete and strikes through the title.

### 📋 Overview (`/mytasks`)
Send `/mytasks` to get a clean, text-only summary of all your tasks, grouped by **⏳ Pending** and **✅ Completed**.

### 🗑️ Deleting Tasks (`/delete`)
Send `/delete`. The bot will show all your tasks as inline buttons. Tap any task to instantly delete it from the database.

### 🧹 Wipe Everything (`/clear`)
Send `/clear`. The bot will ask you to reply with `Confirm`. Once confirmed, ALL your tasks will be permanently deleted.

---

## 🔔 Reminders
You don't need to do anything to set up reminders! A background scheduler automatically checks your tasks every minute. You will receive a direct message:
- **24 hours** before a task is due.
- **1 hour** before a task is due.

---

## ⌨️ Commands Reference

| Command | Description |
|---|---|
| `/start` | Register and show the home menu |
| `/task` | Start quick task creation |
| `/add` | Start the detailed task creation wizard |
| `/list` | View active tasks with interactive progress buttons |
| `/mytasks` | View a clean, text-only list of all tasks |
| `/delete` | Delete a specific task via inline buttons |
| `/clear` | Delete ALL tasks (requires typing "Confirm") |
| `/help` | Show basic help information |

---

## ⚙️ Tech Stack
- **Runtime**: Node.js
- **Bot API**: `node-telegram-bot-api`
- **Database**: Supabase (PostgreSQL)
- **Time/Date**: `dayjs`
- **Scheduler**: `node-cron`