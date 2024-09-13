import { DEFAULT_LANGUAGE } from "../constants";

export function getLanguageName(language: string): string {
  const languageName = new Intl.DisplayNames(["en"], { type: "language" }).of(
    language
  );
  return !!languageName ? languageName : language;
}

export function getLanguageTwoLetterCode(language: string): string {
  if (language.length === 2) {
    return language;
  }
  if (language.match(/^[a-z]{2}-[A-Z]{2}$/)) {
    return language.split("-")[0].toLowerCase();
  }
  return DEFAULT_LANGUAGE;
}
