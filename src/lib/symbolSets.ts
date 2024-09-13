import axios from "axios";
import { AxiosRequestConfig } from "axios";
import { LabelsSearchApiResponse } from "../types/global-symbols";
import { Suggestion } from "../engine";
import { nanoid } from "nanoid";
import { BestSearchApiResponse } from "../types/arasaac";
import { ARASAAC } from "../constants";

export type SymbolSet = "arasaac" | "global-symbols";

export async function getArasaacPictogramSuggestions({
  URL,
  words,
  language,
}: {
  URL: string;
  words: string[];
  language: string;
}) {
  const locale = convertLanguageToLocale(language);
  const responses = await Promise.all(
    words.map(async (word) => {
      const fullUrl = `${URL}/${locale}/bestsearch/${encodeURIComponent(removeDiacritics(word))}`;
      return axios
        .get<BestSearchApiResponse>(fullUrl)
        .then((response) => response.data)
        .catch((error: unknown) => {
          return [];
        });
    })
  );
  const suggestions: Suggestion[] = responses.map((data) => {
    const label = words[responses.indexOf(data)];
    if (data && !!data.length)
      return {
        id: nanoid(5),
        label: label,
        locale: language,
        pictogram: {
          isAIGenerated: false,
          images: data.map((pictogram: any) => ({
            id: pictogram._id,
            symbolSet: ARASAAC,
            url: `https://static.arasaac.org/pictograms/${pictogram._id}/${pictogram._id}_500.png`,
          })),
        },
      };
    return getEmptyImageSuggestion(label, language);
  });
  return suggestions;
}

export async function getGlobalSymbolsPictogramSuggestions({
  URL,
  words,
  language,
  symbolSet,
}: {
  URL: string;
  words: string[];
  language: string;
  symbolSet: string;
}) {
  const responses = await Promise.all(
    words.map((word) =>
      axios
        .get<LabelsSearchApiResponse>(URL, {
          params: {
            query: removeDiacritics(word),
            symbolset: symbolSet,
            language: language,
          },
        } as AxiosRequestConfig)
        .then((response) => response.data)
        .catch((error: unknown) => {
          return [];
        })
    )
  );

  const suggestions: Suggestion[] = responses.map((data) => {
    const label = words[responses.indexOf(data)];
    if (data && !!data.length)
      return {
        id: nanoid(5),
        label: label,
        locale: data[0].language,
        pictogram: {
          isAIGenerated: false,
          images: data.map((label) => ({
            id: label.id.toString(),
            symbolSet: label.picto.symbolset_id.toString(),
            url: label.picto.image_url,
          })),
        },
      };
    return getEmptyImageSuggestion(label, language);
  });
  return suggestions;
}

function getEmptyImageSuggestion(word: string, language: string): Suggestion {
  return {
    id: nanoid(5),
    label: word,
    locale: language,
    pictogram: {
      isAIGenerated: false,
      images: [
        {
          blob: null,
          ok: false,
          error: "ERROR: No image in the Symbol Set",
          prompt: word,
        },
      ],
    },
  };
}

function convertLanguageToLocale(language: string): string {
  const languageMap: { [key: string]: string } = {
    eng: "en",
    spa: "es",
    por: "pt",
    // Add more mappings as needed
  };
  return languageMap[language] || language;
}

function removeDiacritics(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
