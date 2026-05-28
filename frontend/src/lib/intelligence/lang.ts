/**
 * Lightweight language detection + multilingual labels.
 *
 * We do NOT ship a 50MB i18n library — instead we detect a coarse
 * "language family" from the user's first message and feed that into
 * the AltLLM system prompt. AltLLM itself is multilingual and will
 * answer in the matching language.
 *
 * Detection covers the major scripts (Latin, Cyrillic, CJK, Arabic,
 * Hebrew, Greek, Devanagari, Thai, Korean) plus a few common European
 * Latin-script languages by stopword.
 */

export type LangCode =
  | "en"
  | "ru"
  | "uk"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "he"
  | "el"
  | "hi"
  | "th"
  | "tr"
  | "de"
  | "fr"
  | "es"
  | "pt"
  | "it"
  | "id"
  | "vi"
  | "auto";

interface LangProfile {
  code: LangCode;
  name: string;
  promptLabel: string;
}

const PROFILES: Record<LangCode, LangProfile> = {
  en: { code: "en", name: "English", promptLabel: "English" },
  ru: { code: "ru", name: "Русский", promptLabel: "Russian" },
  uk: { code: "uk", name: "Українська", promptLabel: "Ukrainian" },
  zh: { code: "zh", name: "中文", promptLabel: "Chinese (Simplified)" },
  ja: { code: "ja", name: "日本語", promptLabel: "Japanese" },
  ko: { code: "ko", name: "한국어", promptLabel: "Korean" },
  ar: { code: "ar", name: "العربية", promptLabel: "Arabic" },
  he: { code: "he", name: "עברית", promptLabel: "Hebrew" },
  el: { code: "el", name: "Ελληνικά", promptLabel: "Greek" },
  hi: { code: "hi", name: "हिन्दी", promptLabel: "Hindi" },
  th: { code: "th", name: "ไทย", promptLabel: "Thai" },
  tr: { code: "tr", name: "Türkçe", promptLabel: "Turkish" },
  de: { code: "de", name: "Deutsch", promptLabel: "German" },
  fr: { code: "fr", name: "Français", promptLabel: "French" },
  es: { code: "es", name: "Español", promptLabel: "Spanish" },
  pt: { code: "pt", name: "Português", promptLabel: "Portuguese" },
  it: { code: "it", name: "Italiano", promptLabel: "Italian" },
  id: { code: "id", name: "Bahasa Indonesia", promptLabel: "Indonesian" },
  vi: { code: "vi", name: "Tiếng Việt", promptLabel: "Vietnamese" },
  auto: { code: "auto", name: "Auto", promptLabel: "the same language the user is writing in" },
};

export function getLangProfile(code: LangCode): LangProfile {
  return PROFILES[code] ?? PROFILES.en;
}

/** Detect language from a single message. Returns "auto" if unsure. */
export function detectLang(input: string): LangCode {
  if (!input || input.length < 2) return "auto";

  // Script detection by codepoint range
  const cjk = /[\u4e00-\u9fff]/;
  const kana = /[\u3040-\u30ff]/;
  const hangul = /[\uac00-\ud7af]/;
  const cyrillic = /[\u0400-\u04ff]/;
  const arabic = /[\u0600-\u06ff]/;
  const hebrew = /[\u0590-\u05ff]/;
  const greek = /[\u0370-\u03ff]/;
  const devanagari = /[\u0900-\u097f]/;
  const thai = /[\u0e00-\u0e7f]/;

  if (kana.test(input)) return "ja";
  if (hangul.test(input)) return "ko";
  if (cjk.test(input)) return "zh";
  if (arabic.test(input)) return "ar";
  if (hebrew.test(input)) return "he";
  if (greek.test(input)) return "el";
  if (devanagari.test(input)) return "hi";
  if (thai.test(input)) return "th";

  if (cyrillic.test(input)) {
    // Crude Ukrainian heuristic
    if (/[іїєґ]/i.test(input)) return "uk";
    return "ru";
  }

  // Latin-script disambiguation by stopwords
  const lower = ` ${input.toLowerCase()} `;
  const stopHits: Array<[LangCode, string[]]> = [
    ["de", [" der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " für ", " ein "]],
    ["fr", [" le ", " la ", " les ", " des ", " est ", " pas ", " avec ", " pour ", " un ", " une "]],
    ["es", [" el ", " la ", " los ", " las ", " es ", " no ", " con ", " para ", " un ", " una "]],
    ["pt", [" o ", " a ", " os ", " as ", " não ", " com ", " para ", " um ", " uma ", " você "]],
    ["it", [" il ", " la ", " gli ", " e ", " è ", " non ", " con ", " per ", " un ", " una "]],
    ["tr", [" ve ", " bir ", " bu ", " için ", " ile ", " değil ", " ne "]],
    ["id", [" dan ", " yang ", " untuk ", " adalah ", " tidak ", " ini ", " itu "]],
    ["vi", [" và ", " là ", " không ", " của ", " cho ", " có ", " một "]],
  ];
  let bestCode: LangCode = "en";
  let bestScore = 0;
  for (const [code, words] of stopHits) {
    let s = 0;
    for (const w of words) if (lower.includes(w)) s++;
    if (s > bestScore) {
      bestScore = s;
      bestCode = code;
    }
  }
  // need at least 2 stopword hits to claim non-English
  return bestScore >= 2 ? bestCode : "en";
}

/** UI strings shown by the chat shell itself. Keep these tiny. */
export const UI_STRINGS: Record<LangCode, {
  title: string;
  subtitle: string;
  greeting: string;
  inputPlaceholder: string;
  send: string;
  thinking: string;
  callingTool: string;
  newConversation: string;
  promptsHeader: string;
  liveBrief: string;
  poweredBy: string;
}> = {
  en: {
    title: "Stocky",
    subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Hi! I'm Stocky, your live xStocks assistant. Ask me anything — I'll check smart-money flows, KOL sentiment, and on-chain data in real time.",
    inputPlaceholder: "Ask Stocky anything…",
    send: "Send",
    thinking: "Thinking…",
    callingTool: "Calling",
    newConversation: "New chat",
    promptsHeader: "Try one of these:",
    liveBrief: "Live Brief",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  ru: {
    title: "Stocky",
    subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Привет! Я Stocky — твой ассистент по xStocks с живыми данными. Спроси что угодно — проверю потоки smart-money, настроения KOL и on-chain данные в реальном времени.",
    inputPlaceholder: "Спроси Stocky о чём угодно…",
    send: "Отправить",
    thinking: "Думаю…",
    callingTool: "Запрос",
    newConversation: "Новый чат",
    promptsHeader: "Попробуй один из вопросов:",
    liveBrief: "Live-обзор рынка",
    poweredBy: "Работает на Nansen + ELFA + AltLLM",
  },
  uk: {
    title: "Stocky",
    subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Привіт! Я Stocky — твій асистент із живими даними по xStocks. Запитай будь-що, я перевірю потоки smart-money та KOL-настрої.",
    inputPlaceholder: "Запитай Stocky про що завгодно…",
    send: "Надіслати",
    thinking: "Думаю…",
    callingTool: "Запит",
    newConversation: "Новий чат",
    promptsHeader: "Спробуй одне з питань:",
    liveBrief: "Live-огляд ринку",
    poweredBy: "На базі Nansen + ELFA + AltLLM",
  },
  zh: {
    title: "Stocky",
    subtitle: "Nansen · ELFA · AltLLM",
    greeting: "你好！我是 Stocky — 你的实时 xStocks 助手。问我任何问题，我会实时检查聪明钱流向、KOL 情绪和链上数据。",
    inputPlaceholder: "向 Stocky 提问…",
    send: "发送",
    thinking: "思考中…",
    callingTool: "调用",
    newConversation: "新对话",
    promptsHeader: "试试这些问题：",
    liveBrief: "实时市场简报",
    poweredBy: "由 Nansen + ELFA + AltLLM 提供支持",
  },
  ja: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "こんにちは！Stocky です。リアルタイムでxStocksの分析をします。スマートマネーやKOLの感情を聞いてください。",
    inputPlaceholder: "Stocky に質問する…", send: "送信",
    thinking: "考え中…", callingTool: "呼出中", newConversation: "新しい会話",
    promptsHeader: "こちらをお試しください:", liveBrief: "ライブブリーフ",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  ko: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "안녕하세요! 저는 Stocky 입니다. xStocks 에 대해 실시간으로 답변해드립니다.",
    inputPlaceholder: "Stocky 에게 물어보세요…", send: "전송",
    thinking: "생각 중…", callingTool: "호출 중", newConversation: "새 대화",
    promptsHeader: "다음을 시도해보세요:", liveBrief: "실시간 브리프",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  ar: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "مرحبًا! أنا Stocky، مساعدك الفوري لـ xStocks. اسألني أي شيء وسأتحقق من تدفقات الأموال الذكية ومعنويات KOL في الوقت الفعلي.",
    inputPlaceholder: "اسأل Stocky عن أي شيء…", send: "إرسال",
    thinking: "أفكر…", callingTool: "استدعاء", newConversation: "محادثة جديدة",
    promptsHeader: "جرب أحد هذه الأسئلة:", liveBrief: "ملخص حي",
    poweredBy: "مدعوم بواسطة Nansen + ELFA + AltLLM",
  },
  he: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "שלום! אני Stocky, העוזר שלך ל-xStocks בזמן אמת.",
    inputPlaceholder: "שאל את Stocky כל דבר…", send: "שלח",
    thinking: "חושב…", callingTool: "קורא", newConversation: "שיחה חדשה",
    promptsHeader: "נסה אחד מהאלה:", liveBrief: "סיכום חי",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  el: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Γεια! Είμαι ο Stocky, ο βοηθός σου για xStocks σε πραγματικό χρόνο.",
    inputPlaceholder: "Ρώτησε τον Stocky οτιδήποτε…", send: "Αποστολή",
    thinking: "Σκέφτομαι…", callingTool: "Κλήση", newConversation: "Νέα συζήτηση",
    promptsHeader: "Δοκίμασε ένα από αυτά:", liveBrief: "Ζωντανή σύνοψη",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  hi: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "नमस्ते! मैं Stocky हूँ, आपका xStocks सहायक। मुझसे कुछ भी पूछें — मैं रियल टाइम में स्मार्ट मनी, KOL भावना और ऑन-चेन डेटा देखूंगा।",
    inputPlaceholder: "Stocky से कुछ भी पूछें…", send: "भेजें",
    thinking: "सोच रहा हूँ…", callingTool: "बुला रहा हूँ", newConversation: "नई बातचीत",
    promptsHeader: "इनमें से एक आज़माएँ:", liveBrief: "लाइव संक्षिप्त",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  th: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "สวัสดี! ฉันคือ Stocky ผู้ช่วย xStocks แบบเรียลไทม์ ถามฉันได้ทุกอย่าง",
    inputPlaceholder: "ถาม Stocky…", send: "ส่ง",
    thinking: "กำลังคิด…", callingTool: "กำลังเรียก", newConversation: "แชทใหม่",
    promptsHeader: "ลองคำถามเหล่านี้:", liveBrief: "สรุปสด",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  tr: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Merhaba! Ben Stocky, canlı xStocks asistanın. Akıllı para ve KOL duyarlılığını gerçek zamanlı kontrol ederim.",
    inputPlaceholder: "Stocky'ye sor…", send: "Gönder",
    thinking: "Düşünüyorum…", callingTool: "Çağırıyor", newConversation: "Yeni sohbet",
    promptsHeader: "Şunları deneyin:", liveBrief: "Canlı özet",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  de: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Hallo! Ich bin Stocky, dein Live-xStocks-Assistent. Frag mich alles — ich prüfe Smart-Money-Flüsse und KOL-Stimmung in Echtzeit.",
    inputPlaceholder: "Frag Stocky…", send: "Senden",
    thinking: "Denke nach…", callingTool: "Rufe", newConversation: "Neuer Chat",
    promptsHeader: "Probier eines davon:", liveBrief: "Live-Übersicht",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  fr: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Salut ! Je suis Stocky, ton assistant xStocks en temps réel. Demande-moi n'importe quoi — je consulte les flux Smart Money et le sentiment KOL en direct.",
    inputPlaceholder: "Demande à Stocky…", send: "Envoyer",
    thinking: "Je réfléchis…", callingTool: "J'appelle", newConversation: "Nouvelle conversation",
    promptsHeader: "Essaie l'une de ces questions :", liveBrief: "Aperçu en direct",
    poweredBy: "Propulsé par Nansen + ELFA + AltLLM",
  },
  es: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "¡Hola! Soy Stocky, tu asistente de xStocks en tiempo real. Pregúntame cualquier cosa — consulto flujos de smart money y sentimiento KOL al instante.",
    inputPlaceholder: "Pregunta a Stocky…", send: "Enviar",
    thinking: "Pensando…", callingTool: "Llamando", newConversation: "Nueva conversación",
    promptsHeader: "Prueba una de estas:", liveBrief: "Resumen en vivo",
    poweredBy: "Impulsado por Nansen + ELFA + AltLLM",
  },
  pt: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Olá! Sou o Stocky, seu assistente de xStocks em tempo real. Pergunte qualquer coisa.",
    inputPlaceholder: "Pergunte ao Stocky…", send: "Enviar",
    thinking: "Pensando…", callingTool: "Chamando", newConversation: "Nova conversa",
    promptsHeader: "Experimente uma destas:", liveBrief: "Resumo ao vivo",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  it: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Ciao! Sono Stocky, il tuo assistente xStocks in tempo reale.",
    inputPlaceholder: "Chiedi a Stocky…", send: "Invia",
    thinking: "Sto pensando…", callingTool: "Chiamando", newConversation: "Nuova chat",
    promptsHeader: "Prova una di queste:", liveBrief: "Riepilogo live",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  id: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Hai! Saya Stocky, asisten xStocks real-time Anda.",
    inputPlaceholder: "Tanya Stocky…", send: "Kirim",
    thinking: "Sedang berpikir…", callingTool: "Memanggil", newConversation: "Obrolan baru",
    promptsHeader: "Coba salah satu ini:", liveBrief: "Ringkasan langsung",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  vi: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Xin chào! Tôi là Stocky, trợ lý xStocks thời gian thực.",
    inputPlaceholder: "Hỏi Stocky bất cứ điều gì…", send: "Gửi",
    thinking: "Đang nghĩ…", callingTool: "Đang gọi", newConversation: "Cuộc trò chuyện mới",
    promptsHeader: "Thử một trong những câu này:", liveBrief: "Tóm tắt trực tiếp",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
  auto: {
    title: "Stocky", subtitle: "Nansen · ELFA · AltLLM",
    greeting: "Hi! I'm Stocky.",
    inputPlaceholder: "Ask Stocky…", send: "Send",
    thinking: "Thinking…", callingTool: "Calling", newConversation: "New chat",
    promptsHeader: "Try one of these:", liveBrief: "Live Brief",
    poweredBy: "Powered by Nansen + ELFA + AltLLM",
  },
};

export function uiStrings(lang: LangCode) {
  return UI_STRINGS[lang] ?? UI_STRINGS.en;
}
