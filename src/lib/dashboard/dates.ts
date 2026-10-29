export function currentMonthBounds() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return {
    start: `${year}-${month}-01`,
    end: new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10),
  };
}
