/** Where a reminder reaches the person — what they chose and have set up: Telegram, mail, both, or nowhere yet. */
export interface ReminderWays {
  telegram: boolean;
  mail: boolean;
}

/**
 * What the chat's model says of reminders (D43): one the user asks for is set by the memory itself and goes out at its
 * time, so «I cannot remind you» is wrong — and which way it goes is said as it is, so «I will write to you in Telegram»
 * is never said to someone with none bound.
 */
export const reminderNote = (ways: ReminderWays) => {
  let where =
    "but they have neither a Telegram chat bound nor mail notifications on, so it will only show on their start screen — say that, and that the «Уведомления» section of the account settings binds Telegram";
  if (ways.telegram && ways.mail) {
    where = "to their Telegram and to their mail";
  } else if (ways.telegram) {
    where = "to their Telegram";
  } else if (ways.mail) {
    where = "to their mail";
  }
  return `
Reminders: when the user asks to be reminded of something («напомни завтра в 10 про встречу с Владом», «через 3 минуты напомни записаться»), call remember: it sets the reminder now, and it goes at that time — ${where}. Confirm it in a line as remember returned it: what, and when; if remember kept nothing yet, confirm it as they said it (the day and the time; «в 9 утра» if they named none). Never say you cannot remind, and never tell them to set a timer or an alarm; do not offer to do it by yourself either. A reminder that comes again («каждый понедельник, среду и пятницу напоминай…», «по будням в 18:00») is remember too, never a task: a task is work done on a schedule (a report, a check of a source), not telling the user something. When they ask to be reminded some time before an event («за 2 минуты до созвона») and have not said when the event is, ask its time first and do not call remember yet.`;
};
