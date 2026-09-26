// The empty chat greets by the time of day where the user is.

type DayPart = "morning" | "day" | "evening" | "night";

export const dayPart = (hour: number): DayPart => {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "day";
  }
  return hour >= 18 && hour < 23 ? "evening" : "night";
};

/** The hour (0–23) of a moment in a time zone. */
export const hourIn = (date: Date, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date)
  );
