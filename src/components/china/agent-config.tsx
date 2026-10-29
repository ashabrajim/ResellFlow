import { useState } from "react";
import { MessageCircle, Percent } from "lucide-react";
import { normalizePhone } from "@/lib/china/whatsapp";
import { parseAmount } from "@/lib/china/money";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { inputCls, labelCls } from "./styles";

/** Numéro WhatsApp de l'agent + commission estimée. Utilisé dans les Réglages et sur la page de commande. */
export function AgentConfig() {
  const { t } = useApp();
  const { agentPhone, setAgentPhone, agentFeePercent, setAgentFeePercent } = useChina();
  const [feeText, setFeeText] = useState(
    agentFeePercent ? String(agentFeePercent).replace(".", ",") : "",
  );
  const check = agentPhone.trim() ? normalizePhone(agentPhone) : null;

  const errorKey =
    check && !check.ok
      ? check.code === "LOCAL_FORMAT"
        ? "cn.agent.err.local"
        : check.code === "LENGTH"
          ? "cn.agent.err.length"
          : "cn.agent.err.invalid"
      : null;

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className={labelCls}>{t("cn.agent.phone")}</span>
        <div className="relative">
          <MessageCircle className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={agentPhone}
            onChange={(e) => setAgentPhone(e.target.value)}
            placeholder="+86 138 0013 8000"
            aria-invalid={errorKey !== null}
            className={`${inputCls} pl-9`}
          />
        </div>
        {errorKey ? (
          <span role="alert" className="block text-xs text-destructive">
            {t(errorKey)}
          </span>
        ) : check?.ok ? (
          <span className="nums block text-xs text-success">
            {t("cn.agent.ok", { number: check.display })}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">{t("cn.agent.phone.hint")}</span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className={labelCls}>{t("cn.agent.fee")}</span>
        <div className="relative">
          <Percent className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            inputMode="decimal"
            value={feeText}
            onChange={(e) => {
              setFeeText(e.target.value);
              const n = parseAmount(e.target.value);
              setAgentFeePercent(e.target.value.trim() === "" ? 0 : (n ?? 0));
            }}
            placeholder="0"
            className={`${inputCls} pl-9`}
          />
        </div>
        <span className="block text-xs text-muted-foreground">{t("cn.agent.fee.hint")}</span>
      </label>
    </div>
  );
}
