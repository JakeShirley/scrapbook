export const fixedTestDate = new Date("2026-05-17T00:00:00.000Z");

export const makeFixedClock = (date: Date = fixedTestDate): (() => Date) => {
  const timestamp = date.getTime();

  return () => new Date(timestamp);
};
