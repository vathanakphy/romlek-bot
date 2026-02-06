const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

const TIMEZONE = "Asia/Phnom_Penh";

const formatDate = (date) =>
  dayjs(date).tz(TIMEZONE).format("MMM D, YYYY h:mm A");
const formatToDayDate = (date) => dayjs(date).tz(TIMEZONE).format("YYYY-MM-DD");

// Checks if a date is valid and in the future
const isValidFutureDate = (dateStr) => {
  const input = dayjs(dateStr).tz(TIMEZONE, true);
  return input.isValid() && input.isAfter(dayjs().startOf("day"));
};

module.exports = {
  dayjs,
  formatDate,
  formatToDayDate,
  isValidFutureDate,
  TIMEZONE,
};
