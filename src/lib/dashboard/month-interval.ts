import { dashboardMonthRange } from "./snapshot";

export function dashboardMonthInterval(fromMonth: string, toMonth: string) {
  const validMonth = (value: string) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
  const empty = !fromMonth && !toMonth;
  const valid = empty || (validMonth(fromMonth) && validMonth(toMonth) && fromMonth <= toMonth);
  return {
    valid,
    start: valid && !empty ? dashboardMonthRange(fromMonth).start : "",
    end: valid && !empty ? dashboardMonthRange(toMonth).end : "",
  };
}

export function trackingIntervalMonths(fromMonth: string, toMonth: string, fallbackMonth: string) {
  const interval = dashboardMonthInterval(fromMonth, toMonth);
  if (!interval.valid) return [];
  if (!fromMonth && !toMonth) return [fallbackMonth];
  const months: string[] = [];
  let year = Number(fromMonth.slice(0, 4));
  let month = Number(fromMonth.slice(5));
  while (`${year}-${String(month).padStart(2, "0")}` <= toMonth) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (month === 12) {
      year++;
      month = 1;
    } else month++;
  }
  return months;
}
