import { useTranslation } from "react-i18next";

const ORDER_TYPE_KEY: Record<string, string> = {
  Bicycle: "Bicycle", "Frame Kit": "FrameKit", Components: "Components", Warranty: "Warranty",
  "Clothing/Accessories": "Clothing", Gift: "Gift", Rental: "Rental", Other: "Other",
};

export function useTypeLabel() {
  const { t } = useTranslation();
  return (k: string) => (ORDER_TYPE_KEY[k] ? t(`rep.ot.${ORDER_TYPE_KEY[k]}`) : k);
}

export const pctText = (part: number, total: number, lang: string) =>
  new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: total && part / total < 0.1 ? 1 : 0 }).format(total ? part / total : 0);
