const sessions = {};
const getSession = (chatId) => sessions[chatId] || {};
const setSession = (chatId, data) => {
  sessions[chatId] = { ...sessions[chatId], ...data };
};
const clearSession = (chatId) => {
  delete sessions[chatId];
};
module.exports = { getSession, setSession, clearSession };
