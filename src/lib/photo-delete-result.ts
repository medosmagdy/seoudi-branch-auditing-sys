// Return expected failures as data: production server functions may redact
// thrown errors. Never return arbitrary storage/provider error messages.
const messages = new Set([
  "يجب تسجيل الدخول أولًا",
  "الجلسة غير صالحة؛ سجّل الدخول مرة أخرى",
  "إعدادات اتصال السيرفر بقاعدة البيانات غير صحيحة؛ راجع مفتاح Supabase ومشروعه",
  "تعذر الاتصال بخدمة تسجيل الدخول؛ أعد المحاولة",
  "تعذر التحقق من صلاحيات الحساب",
  "الحساب غير مفعل",
  "تعذر تحميل بيانات الفحص",
  "غير مصرح بتعديل هذا الفحص",
  "تعذر التحقق من مشاركة الفحص",
  "الصورة غير متاحة",
  "مسار الصورة غير صالح",
  "إعدادات تخزين الصور غير مكتملة على السيرفر؛ تواصل مع مسؤول النظام",
  "تعذر حذف سجل الصورة؛ أعد المحاولة",
  "حساب تخزين الصور لا يسمح بالحذف؛ راجع صلاحية DeleteObject على السيرفر",
  "تعذر الاتصال بتخزين الصور؛ أعد المحاولة",
]);
export async function photoDeleteResult(operation: () => Promise<{ success: true }>) {
  try {
    await operation();
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      success: false as const,
      message: messages.has(message)
        ? message
        : message.startsWith("Missing Supabase environment variable(s):")
          ? "إعدادات اتصال السيرفر بقاعدة البيانات غير مكتملة؛ تواصل مع مسؤول النظام"
          : "تعذر حذف الصورة بسبب خطأ في السيرفر؛ راجع سجل أخطاء التطبيق",
    };
  }
}
