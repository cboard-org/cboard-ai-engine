import axios, { AxiosRequestConfig } from "axios";
import { nanoid } from "nanoid";
import { LabelsSearchApiResponse } from "../types/global-symbols";
import { BestSearchApiResponse } from "../types/arasaac";
import { Suggestion } from "../engine";
import { ARASAAC } from "../constants";

export type SymbolSet = "arasaac" | "global-symbols";

export type OBFImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  content_type: string;
  license: {
    type: string;
    copyright_notice_url: string;
    source_url: string;
    author_name: string;
    author_url: string;
  };
};

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

export async function getArasaacOBFImages({
  URL,
  words,
  language,
}: {
  URL: string;
  words: string[];
  language: string;
}): Promise<OBFImage[]> {
  const requests = words.map((word) => fetchArasaacData(URL, word, language));
  const responses = await Promise.all(requests);
  
  const images: OBFImage[] = [];
  
  responses.forEach((response, index) => {
    if (response && response.length > 0) {
      // Take the first (best) match for each word
      const pictogram = response[0];
      images.push({
        id: pictogram._id.toString(),
        url: `https://static.arasaac.org/pictograms/${pictogram._id}/${pictogram._id}_500.png`,
        width: 500,
        height: 500,
        content_type: "image/png",
        license: {
          type: "CC BY-NC-SA",
          copyright_notice_url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
          source_url: "https://arasaac.org",
          author_name: "ARASAAC",
          author_url: "https://arasaac.org",
        }
      });
    }
  });

  return images;
}

export async function getGlobalSymbolsOBFImages({
  URL,
  words,
  language,
  symbolSet,
}: {
  URL: string;
  words: string[];
  language: string;
  symbolSet: string | null;
}): Promise<OBFImage[]> {
  const requests = words.map((word) =>
    fetchGlobalSymbolsData(URL, word, language, symbolSet)
  );
  const responses = await Promise.all(requests);
  
  const images: OBFImage[] = [];
  
  responses.forEach((response) => {
    if (response && response.length > 0) {
      // Take the first (best) match for each word
      const label = response[0];
      images.push({
        id: label.id.toString(),
        url: label.picto.image_url,
        width: 500, // Removed invalid property access
        height: 500, // Removed invalid property access
        content_type: "image/png",
        license: {
          type: "CC BY-NC-SA",
          copyright_notice_url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
          source_url: "",
          author_name: "",
          author_url: "",
        }
      });
    }
  });

  return images;
}
