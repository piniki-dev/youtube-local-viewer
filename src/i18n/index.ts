import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";
import en from "./locales/en.json";

const resources = {
  ja: { translation: ja },
  en: { translation: en },
};

// システム言語を取得してアプリの初期言語を決定
const getInitialLanguage = (): string => {
  // PCの言語設定を取得
  const browserLang = navigator.language;
  // 言語コードを正規化（例: en-US -> en, ja-JP -> ja）
  const langCode = browserLang.split("-")[0];
  // PCの言語が日本語の場合のみ日本語に設定、それ以外は英語（デフォルト）
  return langCode === "ja" ? "ja" : "en";
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
