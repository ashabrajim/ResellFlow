/* eslint-disable @typescript-eslint/no-explicit-any -- l'API Web Speech n'a pas de types TypeScript standard */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  LineChart,
  TrendingUp,
  Send,
  HelpCircle,
} from "lucide-react";
import { useApp, useMetrics } from "../app-provider";
import { Card, SectionHeader, Toggle } from "../ui-kit";
import { cn } from "@/lib/utils";

type Turn = { id: string; role: "you" | "assistant"; text: string };

export function VoiceSection() {
  const { t, lang, items, addItem, markSold, settings, updateSetting } = useApp();
  const metrics = useMetrics();
  const [listening, setListening] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [supported, setSupported] = useState(true);
  const [draft, setDraft] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = lang === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      handleCommand(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => rec.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, items, settings]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const speak = (text: string) => {
    if (!settings.voiceReplies || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "fr" ? "fr-FR" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const respond = (text: string) => {
    setTurns((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), role: "assistant", text },
    ]);
    speak(text);
  };

  const handleCommand = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setTurns((prev) => [...prev, { id: Math.random().toString(36).slice(2), role: "you", text }]);
    const low = text.toLowerCase();

    // Help
    if (/(^aide$|^help$|que peux-tu faire|what can you do|comment ça marche|commandes)/.test(low)) {
      respond(t("voice.reply.help"));
      return;
    }

    // Mark an item sold: "marque vendu la veste nike", "j'ai vendu le pull", "mark sold jacket"
    const soldMatch = low.match(
      /(?:marque(?:r)? (?:comme )?vendu|j'ai vendu|vendu[e]?\s*[:-]?|mark(?:ed)? (?:as )?sold|sold)\s*(.+)?/,
    );
    if (soldMatch && /(vendu|sold)/.test(low)) {
      const query = (soldMatch[1] || "").trim();
      const candidates = items.filter((i) => i.status !== "sold");
      const found = query
        ? candidates.find(
            (i) => i.name.toLowerCase().includes(query) || query.includes(i.name.toLowerCase()),
          )
        : undefined;
      if (found) {
        markSold(found.id);
        respond(t("voice.reply.sold", { name: found.name }));
      } else if (candidates.length === 0) {
        respond(t("voice.reply.sold.none"));
      } else {
        respond(t("voice.reply.sold.notfound"));
      }
      return;
    }

    // Create listing: "créer une annonce : veste nike taille L achetée 15 euros vendue 35 euros" / "ajoute 3 tee-shirts..."
    if (
      /(cr[ée]er une annonce|nouvelle annonce|nouvel article|ajoute(r)?\s|add (an|a) item|create a listing)/.test(
        low,
      )
    ) {
      const qtyMatch = low.match(/(\d+)\s*(x|exemplaires?|unit[ée]s?|pi[èe]ces?)\b/);
      const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
      const withoutQty = qtyMatch ? low.replace(qtyMatch[0], " ") : low;

      const nums = (withoutQty.match(/\d+([.,]\d+)?/g) || []).map((n) =>
        Number(n.replace(",", ".")),
      );
      const buy = nums[0] ?? 0;
      const sell = nums[1] ?? 0;

      const afterColon = text.split(/annonce\s*:?|listing\s*:?|ajoute(r)?\s/i).pop() ?? text;
      const name = afterColon
        .split(/taille|achet|bought|size|prix|selling|euros?|\d/i)[0]!
        .replace(/[:,-]/g, " ")
        .trim();
      const finalName = name || (lang === "fr" ? "Nouvel article" : "New item");
      addItem({
        name: finalName,
        brand: "",
        category: "Vêtements",
        condition: "Très bon état",
        size: "",
        photoUrl: null,
        quantity,
        buyPrice: buy,
        sellPrice: sell,
        shippingFee: 0,
        parcel: "Moyen",
      });
      respond(
        quantity > 1
          ? t("voice.reply.createdQty", { name: finalName, qty: quantity, buy, sell })
          : t("voice.reply.created", { name: finalName, buy, sell }),
      );
      return;
    }
    // Net profit
    if (/(b[ée]n[ée]fice|profit|marge)/.test(low)) {
      const val = metrics.netProfit;
      const msg =
        val === 0
          ? t("voice.reply.profit")
          : lang === "fr"
            ? `Votre bénéfice net actuel est de ${val.toFixed(2)} euros.`
            : `Your current net profit is ${val.toFixed(2)} euros.`;
      respond(msg);
      return;
    }
    // Stock
    if (/(stock|articles?|combien)/.test(low)) {
      respond(t("voice.reply.stock", { n: metrics.inStock }));
      return;
    }
    respond(t("voice.reply.default"));
  };

  const toggleMic = () => {
    if (!supported) return;
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
    } else {
      try {
        recognitionRef.current?.start?.();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  const submitDraft = () => {
    if (!draft.trim()) return;
    handleCommand(draft);
    setDraft("");
  };

  const examples = [t("voice.ex1"), t("voice.ex2"), t("voice.ex3")];

  const trends = [
    { label: t("voice.trend.cat1"), delta: "+12%" },
    { label: t("voice.trend.cat2"), delta: "+6%" },
    { label: t("voice.trend.cat3"), delta: "−4%" },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title={t("voice.title")} subtitle={t("voice.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Mic widget */}
        <Card className="flex flex-col items-center justify-center gap-6 p-8 lg:col-span-2">
          <div className="relative grid place-items-center">
            {listening ? (
              <>
                <span
                  className="absolute size-32 rounded-full bg-primary/40"
                  style={{ animation: "pulse-ring 1.6s ease-out infinite" }}
                />
                <span
                  className="absolute size-32 rounded-full bg-primary/30"
                  style={{ animation: "pulse-ring 1.6s ease-out infinite", animationDelay: "0.5s" }}
                />
              </>
            ) : null}
            <motion.button
              type="button"
              onClick={toggleMic}
              disabled={!supported}
              whileTap={{ scale: 0.94 }}
              animate={listening ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={listening ? { repeat: Infinity, duration: 1.2 } : {}}
              className={cn(
                "relative grid size-28 place-items-center rounded-full transition disabled:opacity-40",
                listening
                  ? "bg-gradient-to-br from-primary to-accent text-primary-foreground neon-glow"
                  : "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg",
              )}
            >
              <Mic className="size-10" />
            </motion.button>
          </div>
          <p className="text-sm font-medium text-foreground">
            {listening ? t("voice.listening") : t("voice.tap")}
          </p>

          <div className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Volume2 className="size-4 text-primary" />
              {t("voice.speak")}
            </span>
            <Toggle
              checked={settings.voiceReplies}
              onChange={(v) => updateSetting("voiceReplies", v)}
              label={t("voice.speak")}
            />
          </div>

          {!supported ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <MicOff className="size-3.5" />
              {t("voice.unsupported")}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-center text-xs text-muted-foreground">
              <HelpCircle className="size-3.5 shrink-0" />
              {t("voice.noMicHint")}
            </p>
          )}
        </Card>

        {/* Transcript + text input + examples */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="flex min-h-[220px] flex-col p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{t("voice.transcript")}</h2>
            {turns.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">{t("voice.emptyTranscript")}</p>
              </div>
            ) : (
              <ul className="flex-1 space-y-3 overflow-y-auto">
                {turns.map((turn) => (
                  <li
                    key={turn.id}
                    className={cn("flex", turn.role === "you" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                        turn.role === "you"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-secondary/60 text-foreground",
                      )}
                    >
                      <span className="mb-0.5 block text-[10px] font-medium uppercase opacity-60">
                        {turn.role === "you" ? t("voice.you") : t("voice.assistant")}
                      </span>
                      {turn.text}
                    </div>
                  </li>
                ))}
                <div ref={transcriptEndRef} />
              </ul>
            )}

            {/* Text fallback — always available, mic or no mic */}
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitDraft()}
                placeholder={t("voice.typePlaceholder")}
                className="flex-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={submitDraft}
                disabled={!draft.trim()}
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{t("voice.examples")}</h2>
            </div>
            <div className="space-y-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => handleCommand(ex)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3.5 py-2.5 text-left text-sm text-foreground/90 transition hover:border-primary/30 hover:bg-secondary/60"
                >
                  <Mic className="size-4 shrink-0 text-primary" />
                  <span className="text-pretty">{ex}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <LineChart className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{t("voice.trends")}</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{t("voice.trends.desc")}</p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {trends.map((tr) => (
                <li
                  key={tr.label}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2"
                >
                  <span className="text-xs text-foreground/90">{tr.label}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium",
                      tr.delta.startsWith("−") ? "text-destructive" : "text-primary",
                    )}
                  >
                    <TrendingUp className="size-3" />
                    {tr.delta}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
