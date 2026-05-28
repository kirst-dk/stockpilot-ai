/**
 * System prompts and language-aware suggested questions for Stocky.
 *
 * AltLLM is multilingual, so we keep the heavy "what you are" prompt in
 * English and just instruct the model to reply in the user's detected
 * language. Suggested onboarding prompts are localised per language so
 * a Russian/Chinese/etc. user sees them in their script immediately.
 */

import type { LangCode } from "./lang";
import { getLangProfile } from "./lang";

export function buildSystemPrompt(opts: {
  lang: LangCode;
  xStockCount: number;
  hasWallet: boolean;
}): string {
  const langName = getLangProfile(opts.lang).promptLabel;
  return [
    "You are Stocky, the on-chain market concierge inside StockPilot AI — a DeFi app on Mantle Network that lets users trade xStocks (tokenized real-world equities such as NVDAx, AAPLx, TSLAx).",
    "",
    "You have THREE live data sources accessible through function tools:",
    "1. Nansen — institutional / smart-money on-chain flows. Use it to answer 'who is buying / accumulating / dumping' questions.",
    "2. ELFA AI — verified KOL mentions and sentiment from crypto Twitter. Use it for 'what are people saying', 'why is X moving', sentiment, narrative questions.",
    "3. Fluxion DEX (via internal price helpers) — on-chain prices and liquidity for xStocks on Mantle.",
    "",
    `The user is interacting with you in ${langName}. ALWAYS reply in ${langName} unless they switch languages mid-conversation.`,
    "",
    `There are ${opts.xStockCount} xStocks available on Mantle. The user's wallet is ${opts.hasWallet ? "connected" : "NOT connected — they may need to connect via the top-right button"}.`,
    "",
    "Style: friendly, concise, never patronising. Treat the user like a smart newcomer who has never used DeFi. Use short paragraphs and bullet points. Include concrete numbers from your tool calls. Cite data sources inline (e.g. 'Nansen 24h net flow: +$2.4M').",
    "",
    "TOOL USAGE — important:",
    "• When the user asks ANYTHING about a specific xStock, market sentiment, smart money, who's buying, why a stock moves, or wants a recommendation — CALL the relevant tools first. Do NOT answer from memory.",
    "• Prefer calling MULTIPLE tools in parallel for a single user turn (e.g. smart_money + kol_sentiment + price all at once).",
    "• If a tool returns NO_DATA / empty / error, say so honestly. Do not invent numbers.",
    "• If you genuinely don't need live data (definitional questions, glossary, 'what is xStocks'), answer directly without tools.",
    "",
    "End every market-relevant answer with 1-2 actionable next steps (e.g. 'Open Swap to buy 0.5 NVDAx' or 'Compare with TSLAx').",
  ].join("\n");
}

const PROMPTS: Record<LangCode, string[]> = {
  en: [
    "What is xStocks and how does it work?",
    "Which xStocks are smart money buying right now?",
    "Why is NVDA moving today?",
    "Build me a balanced portfolio under $1000",
    "Compare NVDAx vs TSLAx — which has stronger smart money?",
  ],
  ru: [
    "Что такое xStocks и как это работает?",
    "Какие xStocks сейчас покупают умные деньги?",
    "Почему сегодня двигается NVDA?",
    "Собери мне сбалансированный портфель до $1000",
    "Сравни NVDAx и TSLAx — где сильнее smart money?",
  ],
  uk: [
    "Що таке xStocks і як це працює?",
    "Які xStocks зараз купують розумні гроші?",
    "Чому сьогодні рухається NVDA?",
    "Збери мені збалансований портфель до $1000",
    "Порівняй NVDAx та TSLAx — де сильніше smart money?",
  ],
  zh: [
    "什么是 xStocks，它如何工作？",
    "现在聪明钱在买哪些 xStocks？",
    "为什么 NVDA 今天在波动？",
    "为我构建一个 $1000 以内的平衡投资组合",
    "比较 NVDAx 与 TSLAx — 哪个聪明钱更强？",
  ],
  ja: [
    "xStocks とは何ですか？",
    "今スマートマネーが買っている xStock は？",
    "なぜ今日 NVDA は動いているのか？",
    "$1000 以下のバランス型ポートフォリオを作成して",
    "NVDAx と TSLAx を比較して — どちらのスマートマネーが強い？",
  ],
  ko: [
    "xStocks가 무엇이며 어떻게 작동하나요?",
    "지금 스마트머니가 매수하는 xStocks는?",
    "오늘 NVDA가 왜 움직이고 있나요?",
    "$1000 이하 균형형 포트폴리오를 만들어주세요",
    "NVDAx와 TSLAx 비교 — 어느 쪽 스마트머니가 더 강한가요?",
  ],
  ar: [
    "ما هو xStocks وكيف يعمل؟",
    "ما هي xStocks التي يشتريها الأموال الذكية الآن؟",
    "لماذا يتحرك NVDA اليوم؟",
    "ابنِ لي محفظة متوازنة بأقل من 1000 دولار",
    "قارن بين NVDAx و TSLAx — أيهما به أموال ذكية أقوى؟",
  ],
  he: [
    "מה זה xStocks ואיך זה עובד?",
    "אילו xStocks הכסף החכם קונה עכשיו?",
    "למה NVDA זז היום?",
    "בנה לי תיק מאוזן עד $1000",
    "השווה NVDAx ל-TSLAx — איפה הכסף החכם חזק יותר?",
  ],
  el: [
    "Τι είναι το xStocks και πώς λειτουργεί;",
    "Ποια xStocks αγοράζουν τα έξυπνα χρήματα τώρα;",
    "Γιατί κινείται η NVDA σήμερα;",
    "Φτιάξε μου ένα ισορροπημένο χαρτοφυλάκιο κάτω από $1000",
    "Σύγκρινε NVDAx με TSLAx",
  ],
  hi: [
    "xStocks क्या है और यह कैसे काम करता है?",
    "अभी स्मार्ट मनी कौन से xStocks खरीद रही है?",
    "आज NVDA क्यों हिल रहा है?",
    "मेरे लिए $1000 के अंदर एक संतुलित पोर्टफोलियो बनाएँ",
    "NVDAx बनाम TSLAx की तुलना करें",
  ],
  th: [
    "xStocks คืออะไรและทำงานอย่างไร?",
    "ตอนนี้สมาร์ทมันนีกำลังซื้อ xStocks ตัวไหน?",
    "ทำไมวันนี้ NVDA ถึงเคลื่อนไหว?",
    "สร้างพอร์ตการลงทุนสมดุลให้ฉันภายใต้ $1000",
    "เปรียบเทียบ NVDAx และ TSLAx",
  ],
  tr: [
    "xStocks nedir ve nasıl çalışır?",
    "Şu anda akıllı para hangi xStocks'u alıyor?",
    "NVDA bugün neden hareket ediyor?",
    "$1000 altında dengeli bir portföy oluştur",
    "NVDAx ile TSLAx'i karşılaştır",
  ],
  de: [
    "Was sind xStocks und wie funktionieren sie?",
    "Welche xStocks kauft das Smart Money gerade?",
    "Warum bewegt sich NVDA heute?",
    "Erstelle ein ausgewogenes Portfolio unter $1000",
    "Vergleiche NVDAx und TSLAx",
  ],
  fr: [
    "Qu'est-ce que xStocks et comment ça fonctionne ?",
    "Quels xStocks le smart money achète-t-il en ce moment ?",
    "Pourquoi NVDA bouge-t-il aujourd'hui ?",
    "Construis-moi un portefeuille équilibré sous $1000",
    "Compare NVDAx et TSLAx",
  ],
  es: [
    "¿Qué es xStocks y cómo funciona?",
    "¿Qué xStocks está comprando el smart money ahora?",
    "¿Por qué se mueve NVDA hoy?",
    "Constrúyeme una cartera equilibrada por menos de $1000",
    "Compara NVDAx con TSLAx",
  ],
  pt: [
    "O que é xStocks e como funciona?",
    "Que xStocks o smart money está comprando agora?",
    "Por que o NVDA está se movendo hoje?",
    "Monte um portfólio equilibrado abaixo de $1000",
    "Compare NVDAx com TSLAx",
  ],
  it: [
    "Cos'è xStocks e come funziona?",
    "Quali xStocks sta comprando lo smart money in questo momento?",
    "Perché NVDA si muove oggi?",
    "Costruiscimi un portafoglio bilanciato sotto $1000",
    "Confronta NVDAx con TSLAx",
  ],
  id: [
    "Apa itu xStocks dan bagaimana cara kerjanya?",
    "xStocks apa yang sedang dibeli smart money?",
    "Kenapa NVDA bergerak hari ini?",
    "Buatkan saya portofolio seimbang di bawah $1000",
    "Bandingkan NVDAx dan TSLAx",
  ],
  vi: [
    "xStocks là gì và hoạt động ra sao?",
    "Hiện tại smart money đang mua xStocks nào?",
    "Tại sao NVDA biến động hôm nay?",
    "Xây dựng cho tôi danh mục cân bằng dưới $1000",
    "So sánh NVDAx và TSLAx",
  ],
  auto: [
    "What is xStocks and how does it work?",
    "Which xStocks are smart money buying right now?",
    "Why is NVDA moving today?",
    "Build me a balanced portfolio under $1000",
    "Compare NVDAx vs TSLAx",
  ],
};

export function suggestedPrompts(lang: LangCode): string[] {
  return PROMPTS[lang] ?? PROMPTS.en;
}

/** Per-xStock auto-analysis prompt used when user clicks the "AI" button on a card. */
export function perStockAnalysisPrompt(symbol: string, lang: LangCode): string {
  const langName = getLangProfile(lang).promptLabel;
  return `Analyse ${symbol} for a newcomer. Reply in ${langName}. Call tools to gather: smart-money flow on Mantle, KOL sentiment (last 24h), current Fluxion price. Then write a 4-section reply: 1) what the underlying company does (1 sentence), 2) smart-money verdict with the actual net-flow number, 3) social sentiment summary with one verified KOL quote if available, 4) one-line actionable take (buy / hold / avoid + reason). Keep total under 180 words. Format: markdown bullets, no preamble.`;
}

/** Live banner prompt — auto-generated short market brief. */
export function liveBannerPrompt(lang: LangCode, samples: {
  topInflows: Array<{ symbol: string; netFlow24h: number }>;
  trendingTokens: Array<{ token: string; change_percent: number }>;
}): string {
  const langName = getLangProfile(lang).promptLabel;
  return `You are writing a 2-line live market brief for the StockPilot AI banner. Write in ${langName}.
Data:
- Top smart-money inflows (Nansen): ${samples.topInflows.slice(0, 5).map(t => `${t.symbol} ($${Math.round(t.netFlow24h).toLocaleString()})`).join(", ") || "(no data)"}
- Trending tokens on KOL twitter (ELFA): ${samples.trendingTokens.slice(0, 5).map(t => `${t.token} (${t.change_percent > 0 ? "+" : ""}${t.change_percent.toFixed(0)}%)`).join(", ") || "(no data)"}

Output EXACTLY two short bullets (no markdown headings):
- One bullet highlighting the strongest accumulation or opportunity (with the actual number).
- One bullet highlighting a risk / divergence (with the actual number).
Total under 220 characters. No preamble, no closing line.`;
}
