import axios, { AxiosRequestConfig } from "axios";
import { nanoid } from "nanoid";
import { LabelsSearchApiResponse } from "../types/global-symbols";
import { BestSearchApiResponse } from "../types/arasaac";
import { Suggestion } from "../engine";
import { ARASAAC } from "../constants";

export type SymbolSet = "arasaac" | "global-symbols";

function removeDiacritics(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getEmptyImageSuggestion(word: string, language: string): Suggestion {
  return {
    id: nanoid(5),
    label: word,
    locale: language,
    pictogram: {
      images: [
        {
          id: "0",
          symbolSet: "0",
          url: "",
        },
      ],
    },
  };
}

export async function getArasaacPictogramSuggestions({
  URL,
  words,
  language,
}: {
  URL: string;
  words: string[];
  language: string;
}): Promise<Suggestion[]> {
  const requests = words.map((word) => fetchArasaacData(URL, word, language));
  const responses = await Promise.all(requests);

  return words.map((word, index) =>
    mapArasaacResponse(word, language, responses[index])
  );
}

async function fetchArasaacData(URL: string, word: string, language: string) {
  const cleanedWord = removeDiacritics(word);
  const bestSearchUrl = `${URL}/${language}/bestsearch/${encodeURIComponent(
    cleanedWord
  )}`;
  const searchUrl = `${URL}/${language}/search/${encodeURIComponent(
    cleanedWord
  )}`;

  try {
    const { data } = await axios.get<BestSearchApiResponse>(bestSearchUrl);
    return data;
  } catch {
    try {
      let { data } = await axios.get<BestSearchApiResponse>(searchUrl);
      data = data.filter((item)=>!item.sex && !item.violence)
      if (data.length > 5) data = data.slice(0, 5);
      return data;
    } catch {
      return [];
    }
  }
}

function mapArasaacResponse(
  word: string,
  language: string,
  data: BestSearchApiResponse | []
): Suggestion {
  if (data && data.length) {
    return {
      id: nanoid(5),
      label: word,
      locale: language,
      pictogram: {
        images: data.map((pictogram) => ({
          id: pictogram._id.toString(),
          symbolSet: ARASAAC,
          url: `https://static.arasaac.org/pictograms/${pictogram._id}/${pictogram._id}_500.png`,
        })),
      },
    };
  }
  return getEmptyImageSuggestion(word, language);
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
  symbolSet: string | null;
}): Promise<Suggestion[]> {
  const requests = words.map((word) =>
    fetchGlobalSymbolsData(URL, word, language, symbolSet)
  );
  const responses = await Promise.all(requests);

  return words.map((word, index) =>
    mapGlobalSymbolsResponse(word, language, responses[index])
  );
}

async function fetchGlobalSymbolsData(
  URL: string,
  word: string,
  language: string,
  symbolSet: string | null
) {
  const cleanedWord = removeDiacritics(word);
  const config: AxiosRequestConfig = {
    params: {
      query: cleanedWord,
      symbolset: symbolSet || null,
      language: language,
      language_iso_format: "639-1",
    },
  };

  try {
    const { data } = await axios.get<LabelsSearchApiResponse>(URL, config);
    return data;
  } catch {
    return [];
  }
}

function mapGlobalSymbolsResponse(
  word: string,
  language: string,
  data: LabelsSearchApiResponse | []
): Suggestion {
  if (data && data.length) {
    return {
      id: nanoid(5),
      label: word,
      locale: data[0].language,
      pictogram: {
        images: data.map((label) => ({
          id: label.id.toString(),
          symbolSet: label.picto.symbolset_id.toString(),
          url: label.picto.image_url,
        })),
      },
    };
  }
  return getEmptyImageSuggestion(word, language);
}
