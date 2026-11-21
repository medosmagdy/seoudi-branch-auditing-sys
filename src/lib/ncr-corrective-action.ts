// The terms passed here are normalized checklist text and the original observation.
// Recommendations use the site's procedure; they never supply invented readings or limits.
const cooking = /تسويه|طهي|الطهي|الطبخ|cooking|cooked/;
const record = /سجل|سجلات|تسجيل|مدون|log|record/;
const recordGap =
  /ناقص|لم يستكمل|لم يتم استكمال|عدم (كتابه|تدوين|تعبئه|استكمال)|لم يسجل|لم يتم التسجيل|عدم التسجيل|مش (كامل|متسجل|مكتوب)|غير (مكتمل|مدون|مسجل)|فاضي|فارغ|مفيش|بدون|لا يوجد|لم (يمل|يعب)|missing|incomplete|not recorded|blank/;
const thermometer =
  /ترمومتر|ثيرمومتر|ثرمومتر|ترموميتر|جهاز (قياس|حراره)|thermometer|temperature probe/;
const cookingOutOfRange =
  /حراره.{0,24}(غير مطابق|اقل من|خارج الحد)|عدم الوصول.{0,26}(درجه|حراره)|لم تصل.{0,26}(الى|درجه|حراره)|undercooked/;
const notMeasured =
  /بالعين|بالنظر|بالتقدير|لم يقس|لا يقيس|مش (بيقيس|بيستخدم)|بدون قياس|من غير قياس|عدم (التحقق|القياس|استخدام)|لم يتم (قياس|القياس|التحقق)|لم يستخدم|no (measurement|temperature check)|not checked|not measured/;
const unavailable =
  /مش موجود|مش متاح|غير متاح|غير موجود|مش شغال|مش سليم|تالف|معطل|عطلان|عدم توافر|غير معاير|لا يوجد|عدم وجود|مفيش|missing|unavailable|broken|not calibrated/;
const storage =
  /ثلاج|فريزر|تبريد|تجميد|حفظ|تخزين|استلام|عرض بارد|fridge|freezer|cold holding|storage/;
const personnel = /(?:^|\s)(?:(ال)?شيف|chef|(?:ال)?موظف|(?:ال)?عامل|employee|food handler)(?:\s|$)/;
const behavior =
  /عدم (ارتدا|الالتزام)|لم (يرتد|يستبدل|يغير|يغسل)|مش (لابس|بيغير|بيغسل|بيستخدم|بيقيس)|بيشتغل (من غير|بدون)|من غير (قفاز|جوانتي|غطا)|ما غسلش|لوحظ استخدام|كان بيستخدم|بالعين|بالتقدير|بدون قياس|من غير قياس/;
const hand = /غسل (اليد|الايدي|ايده)|غسيل (اليد|الايدي|ايده)|نظافه الايدي|الصابون|hand ?washing/;
const glove = /جوانتي|جوانتيات|قفاز|قفازات|glove/;
const hairCover = /غطا[ء]? (الراس|الشعر)|شبكه الشعر|طاقيه|hair ?net|hair restraint/;
const noNeedToGuess =
  "صحّح المخالفة الموضحة في البند، وتحقّق ميدانيًا من تطبيق الاشتراط قبل إغلاق الحالة.";
const unactionable =
  "تحقّق ميدانيًا من استيفاء البند، وسجّل سبب الخصم والإجراء الذي اتُخذ قبل إغلاق الحالة.";

const topicActions: Record<string, string> = {
  "date-labels":
    "اعزل العبوات اللي تاريخها غير مؤكد. ثبّت بيانات التاريخ من مصدر موثّق، وتحقّق من وضوح البطاقة قبل إعادة العرض.",
  expired:
    "اعزل المنتجات المنتهية فورًا وامنع عرضها أو استخدامها. افحص باقي الكمية وطبّق إجراء التعامل مع المنتهي.",
  temperature:
    "أعد قياس حرارة الحفظ بجهاز معاير وسجّل القراءة. اعزل المنتج المتأثر لحين التقييم وفق إجراء الفرع.",
  "cross-contamination":
    "افصل النيئ عن الجاهز فورًا وخصّص الأدوات لكل منهما. اعزل أي منتج تعرّض للتلوث لحين تقييمه.",
  "hand-hygiene":
    "وفّر الصابون ومستلزمات غسل الأيدي المطلوبة، وتحقّق من استخدامها قبل مناولة الغذاء.",
  "dirty-food-contact":
    "أوقف استخدام السطح أو الأداة المتسخة، ونظّفها وطهّرها وفق الإجراء قبل إعادتها للخدمة.",
  "pest-evidence":
    "سجّل مكان رصد الآفات، واعزل المنتجات المتأثرة، وبلّغ جهة المكافحة لاتخاذ الإجراء وتسجيل نتيجة المتابعة.",
};

function coach(actor: string | undefined, steps: string, toVerify: string) {
  return actor ? `نبّه ${actor} إلى ${steps}، وتحقّق من التطبيق ${toVerify}.` : "";
}

export function correctiveAction(observation: string, question: string, topic?: string) {
  const context = `${observation} ${question}`;
  const person = observation.match(personnel)?.[0]?.trim();
  const observedBehavior = person && (behavior.test(observation) || notMeasured.test(observation));
  const actor = observedBehavior ? (/شيف|chef/.test(person) ? "الشيف" : "الموظف") : undefined;
  const cookingContext =
    cooking.test(context) &&
    !(/حراره الحفظ|حراره الثلاج/.test(observation) && !cooking.test(observation));
  const tempToolMissing = thermometer.test(observation) && unavailable.test(observation);
  const recordingIssue =
    record.test(context) &&
    (recordGap.test(observation) || (!observation && record.test(question)));
  if (cookingContext && recordingIssue && !tempToolMissing) {
    const correct =
      "استكمل سجل التسوية من القراءات الموثقة فقط، وسجّل أي قراءة مفقودة كفجوة دون تقديرها.";
    // When both problems were observed, keep measuring and documenting separate from filling the old record.
    if (notMeasured.test(observation)) {
      return `قِس حرارة قلب المنتج بترمومتر معاير وفق الإجراء وسجّل القراءة الفعلية. لا تُقدّر قراءة فات تسجيلها. ${actor ? coach(actor, "القياس والتسجيل", "في الدفعة التالية") : "نبّه الشيف إلى القياس والتسجيل في الدفعة التالية."}`;
    }
    return `${correct} نبّه الشيف إلى تسجيل القراءة في وقت القياس، وتحقّق من اكتمال سجل الدفعة التالية.`;
  }
  if (tempToolMissing) {
    return `وفّر ترمومترًا صالحًا ومعايرًا بدل الجهاز غير المتاح للاستخدام. ${cookingContext ? "تحقّق من حرارة قلب المنتج" : "أعد التحقق من درجة الحرارة"} وفق الإجراء وسجّل القراءة الفعلية.`;
  }
  if (cookingContext && cookingOutOfRange.test(observation)) {
    return "أوقف تقديم الدفعة، وتحقّق من التسوية بقياس حرارة القلب بترمومتر معاير. سجّل القراءة وطبّق إجراء الفرع للتعامل مع الدفعة غير المطابقة.";
  }
  if (
    (cookingContext || thermometer.test(context)) &&
    (notMeasured.test(observation) || (!observation && thermometer.test(question)))
  ) {
    const correct = cookingContext
      ? "قِس حرارة قلب المنتج بترمومتر معاير وفق إجراء التسوية، وسجّل القراءة الفعلية."
      : "قِس درجة الحرارة المطلوبة بترمومتر معاير وفق الإجراء، وسجّل القراءة الفعلية.";
    return `${correct} ${actor ? coach(actor, "القياس بدل التقدير", "في المرة التالية") : "تحقّق من تكرار القياس عند الاستحقاق التالي."}`;
  }
  if (storage.test(context) && record.test(context) && recordGap.test(observation)) {
    return "استكمل سجل حرارة الحفظ من القراءات الموثقة فقط. قِس الحرارة الحالية وسجّلها في وقتها، وتحقّق من استمرار التسجيل.";
  }
  if (
    hand.test(context) &&
    /(?:صابون|حوض غسل|مياه).{0,22}(?:مش موجود|نفد|خلص|لا يوجد|غير متاح)|(?:عدم وجود|مفيش|لا يوجد).{0,20}(?:صابون|حوض غسل|مياه)/.test(
      observation,
    )
  ) {
    return "وفّر مستلزمات غسل الأيدي الناقصة في نقطة العمل، وتحقّق من جاهزيتها قبل استئناف مناولة الغذاء.";
  }
  if (actor && (glove.test(observation) || (!hand.test(observation) && glove.test(question)))) {
    return `صحّح استخدام القفازات وفق إجراء الفرع. ${coach(actor, "تغيير القفاز بين المهام وغسل اليدين قبل ارتداء قفاز جديد", "عند تغيير المهمة")}`;
  }
  if (actor && hairCover.test(context)) {
    return `اطلب ارتداء غطاء الرأس قبل استئناف العمل في منطقة التحضير. ${coach(actor, "ارتدائه قبل الدخول", "في بداية الوردية التالية")}`;
  }
  if (actor && hand.test(context)) {
    return `صحّح الموقف واطلب غسل اليدين قبل استئناف مناولة الغذاء. ${coach(actor, "غسل اليدين في التوقيت المحدد", "عند المهمة التالية")}`;
  }
  if (
    actor &&
    /موبايل|هاتف|mobile phone/.test(observation) &&
    /استخدام|بيستخدم|بيمسك|كان ماسك/.test(observation)
  ) {
    return `أوقف استخدام الهاتف في نقطة التحضير واطلب غسل اليدين قبل العودة لمناولة الغذاء. ${coach(actor, "ترك الهاتف خارج منطقة العمل", "خلال الوردية")}`;
  }
  if (actor && topic === "cross-contamination") {
    return "افصل النيئ عن الجاهز واعزل أي منتج تعرّض للتلوث لحين التقييم. نبّه الموظف إلى ترتيب التخزين والأدوات المخصصة، وتحقّق من التطبيق في الوردية التالية.";
  }

  return (
    (topic && topicActions[topic]) ||
    (observation
      ? actor
        ? `صحّح التصرف المرصود ونبّه ${actor} للخطوة الصحيحة وفق البند. تحقّق من التطبيق في الوردية التالية.`
        : noNeedToGuess
      : unactionable)
  );
}
