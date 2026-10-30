// Business-approved export/subject identities. Arabic UI/database labels stay intact.
export function branchNameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s_\-ـ]/g, "");
}
const names: Record<string, string> = {
  التجمع: "Silver Star",
  الجامعه: "AUC",
  مولالعرب: "Mall Of Arabia",
  مدينتي: "Madinaty",
  سوديك: "Sodic",
  سوديكسيزر: "Sodic Matcha",
  سوديكاِيست: "Sodic East",
  سوديكايست: "Sodic East",
  silverstar: "Silver Star",
  auc: "AUC",
  mallofarabia: "Mall Of Arabia",
  madinaty: "Madinaty",
  madinty: "Madinaty",
  sodic: "Sodic",
  sodiccaesar: "Sodic Matcha",
  sodicseazar: "Sodic Matcha",
  sodicmatcha: "Sodic Matcha",
  sodiceast: "Sodic East",
};
export function reportBranchName(ar: string, en?: string | null) {
  const corrected = names[branchNameKey(ar)] ?? names[branchNameKey(en ?? "")];
  if (corrected) return corrected;
  const fallback = en?.trim() || ar.trim() || "Branch",
    key = branchNameKey(fallback);
  if (["citystars", "سيتيستارز", "سيتىستارز"].map(branchNameKey).includes(key)) return "CityStars";
  if (["sheraton", "شيراتون", "شيرتون", "الشيراتون"].map(branchNameKey).includes(key))
    return "Sheraton";
  return fallback;
}
