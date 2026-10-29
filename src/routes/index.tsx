import { createFileRoute } from "@tanstack/react-router";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { ChinaProvider } from "@/components/china-provider";
import { ToastProvider } from "@/components/ui-kit";

const title = "ResellFlow — automatise tes ventes Vinted gratuitement";
const description =
  "Inventaire, publication Vinted, calculateur de rentabilité Taobao, assistant vocal, expéditions et comptabilité : la suite complète et gratuite pour les revendeurs.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AppProvider>
      <ChinaProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </ChinaProvider>
    </AppProvider>
  );
}
