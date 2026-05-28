"use client";

import type { ConciergeMessage, InlineCard, SmartMoneyFlow, KolSentiment, KolMention, XStockMeta } from "@/lib/intelligence/types";
import { SmartMoneyCard } from "./cards/SmartMoneyCard";
import { KolSentimentCard } from "./cards/KolSentimentCard";
import { KolMentionsCard } from "./cards/KolMentionsCard";
import { TokenInfoCard } from "./cards/TokenInfoCard";
import { CompareCard } from "./cards/CompareCard";
import { StockyToolTrace } from "./StockyToolTrace";
import { type LangCode } from "@/lib/intelligence/lang";

function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Bold **text** + inline code `code` + links [label](url)
  const out: React.ReactNode[] = [];
  let i = 0;
  let buffer = "";
  const flush = () => { if (buffer) { out.push(buffer); buffer = ""; } };
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        flush();
        out.push(<strong key={`b-${i}`} className="font-semibold text-white/95">{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        flush();
        out.push(<code key={`c-${i}`} className="px-1 rounded bg-white/5 font-mono text-[11px]">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "[") {
      const closeBracket = text.indexOf("]", i);
      if (closeBracket > -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket);
        if (closeParen > -1) {
          flush();
          const label = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          out.push(<a key={`l-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline decoration-emerald-300/30 hover:decoration-emerald-300">{label}</a>);
          i = closeParen + 1;
          continue;
        }
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

function renderTextBlocks(text: string): React.ReactNode {
  // Split into paragraphs and bullets
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;
  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${key++}`} className="leading-relaxed">
          {renderInlineMarkdown(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`u${key++}`} className="list-disc pl-4 space-y-1">
          {list.map((li, idx) => <li key={idx}>{renderInlineMarkdown(li)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const bullet = line.match(/^[-•*]\s+(.+)/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (line.match(/^\d+\.\s+/)) {
      flushPara();
      list.push(line.replace(/^\d+\.\s+/, ""));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return blocks;
}

function CardRenderer({ card }: { card: InlineCard }) {
  switch (card.kind) {
    case "smart_money":
      return <SmartMoneyCard data={card.payload as SmartMoneyFlow} />;
    case "kol_sentiment":
      return <KolSentimentCard data={card.payload as KolSentiment} />;
    case "kol_mentions":
      return <KolMentionsCard data={card.payload as { ticker: string; mentions: KolMention[] }} />;
    case "token_info":
      return <TokenInfoCard data={card.payload as XStockMeta} />;
    case "compare":
      return <CompareCard data={card.payload as Array<{ symbol: string; flow: SmartMoneyFlow | null; sentiment: KolSentiment | null }>} />;
    default:
      return null;
  }
}

export function StockyMessage({ message, lang, onQuickAction }: {
  message: ConciergeMessage;
  lang: LangCode;
  onQuickAction?: (intent: string, payload?: Record<string, unknown>) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-emerald-500/15 border border-emerald-500/20 px-3.5 py-2 text-[13px] text-white/90 whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start gap-2">
      <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[11px] font-bold text-black">S</div>
      <div className="max-w-[92%] space-y-2">
        {message.toolTrace && message.toolTrace.length > 0 && (
          <StockyToolTrace trace={message.toolTrace} lang={lang} />
        )}
        {message.text && (
          <div className="rounded-2xl rounded-tl-md bg-white/[0.03] border border-white/10 px-3.5 py-2.5 text-[13px] text-white/85 space-y-2">
            {renderTextBlocks(message.text)}
          </div>
        )}
        {message.cards && message.cards.length > 0 && (
          <div className="space-y-2">
            {message.cards.map((c, idx) => (
              <CardRenderer key={idx} card={c} />
            ))}
          </div>
        )}
        {message.quickActions && message.quickActions.length > 0 && onQuickAction && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.quickActions.map((qa, idx) => (
              <button
                key={idx}
                onClick={() => onQuickAction(qa.intent, qa.payload)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-colors"
              >
                {qa.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
