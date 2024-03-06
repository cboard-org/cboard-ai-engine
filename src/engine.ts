import { Configuration, OpenAIApi, ConfigurationParameters } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import { DEFAULT_GLOBAL_SYMBOLS_URL, DEFAULT_LANGUAGE } from "./constants";
import { LabelsSearchApiResponse } from "./types/global-symbols";

const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  pictonizer: {} as PictonizerConfiguration,
};

export type Suggestion = {
  id: string;
  text: string;
  locale: string;
  picto: string[];
};

export type PictonizerConfiguration = {
  URL?: string;
  token?: string;
  keyWords?: string;
};


export function init({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerConfiguration,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  pictonizerConfiguration?: PictonizerConfiguration;
}) {
  const configuration = new Configuration(openAIConfiguration);
  globalConfiguration.openAIInstance = new OpenAIApi(configuration);

  if (globalSymbolsApiURL) {
    globalConfiguration.globalSymbolsURL = globalSymbolsApiURL;
  }

  if (pictonizerConfiguration) {
    globalConfiguration.pictonizer = pictonizerConfiguration;
  }

  return {
    getSuggestions,
    pictonizer,
    getSuggestionsAndProcessPictograms,
  };
}

async function getWordSuggestions({
  prompt,
  maxWords,
  language,
}: {
  prompt: string;
  maxWords: number;
  language: string;
}): Promise<string[]> {
  const completionRequestParams = {
    model: "text-davinci-003",
    prompt: `act as a speech pathologist selecting pictograms in language ${language} 
      for a non verbal person about ${prompt}. 
      You must provide a list of ${maxWords}. 
      Do not add any other text or characters to the list. 
      Template for the list {word1, word2, word3,..., wordN}`,
    max_tokens: 100,
    temperature: 0,
  };

  const response = await globalConfiguration.openAIInstance.createCompletion(
    completionRequestParams
  );

  const wordsSuggestionsData = response.data?.choices[0]?.text;

  if (wordsSuggestionsData) {
    const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
    const match = trimmedString.match(/{(.*?)}/);
    const wordsSuggestionsList = match
      ? match[1].split(",").map((word) => word.trim())
      : [];

    return wordsSuggestionsList;
  }
  return [];
}

async function fetchPictogramsURLs({
  words,
  symbolSet,
  language,
}: {
  words: string[];
  symbolSet?: string;
  language: string;
}): Promise<Suggestion[]> {
  try {
    const requests = words.map((word) =>
      axios.get<LabelsSearchApiResponse>(globalConfiguration.globalSymbolsURL, {
        params: {
          query: word,
          symbolset: symbolSet,
          language: language,
        },
      } as AxiosRequestConfig)
    );
    const responses = await Promise.all(requests);

    const dataList = responses.map((response) =>
      response.data.length > 0
        ? response.data
        : [
            {
              id: "NaN",
              text: words[responses.indexOf(response)],
              language: language,
              picto: { image_url: "ERROR: No image in the Symbol Set" },
            },
          ]
    );

    const pictogramsList: Suggestion[] = dataList.map((data) => ({
      id: data[0].id?.toString(),
      text: data[0].text,
      locale: data[0].language,
      picto: data.map((label) => label.picto.image_url),
    }));

    return pictogramsList;
  } catch (error: Error | any) {
    throw new Error("Error fetching pictograms URLs " + error.message);
  }
}

async function pictonizer(imagePrompt: string): Promise<string> {
  const pictonizerConfig = globalConfiguration.pictonizer;
  try {
    if (!!pictonizerConfig.URL && !!pictonizerConfig.token) {
      const body = `input=${imagePrompt} ${pictonizerConfig.keyWords || ""}`;
      const response = await fetch(pictonizerConfig.URL, {
        method: "POST",
        body: body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "image/*",
          Authorization: `Bearer ${globalConfiguration.pictonizer.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.blob();
      const resultJson = {
        images: [{ data: data }],
        prompt: imagePrompt,
      };
      return JSON.stringify(resultJson);
    }
    throw new Error("Pictonizer URL or Auth token not defined");
  } catch (error: Error | any) {
    console.error("Error generating pictogram: ", error.message);
    return JSON.stringify({
      images: [{ data: "ERROR Generating Pictogram" }],
      prompt: imagePrompt,
    });
  }
}

async function processPictograms(pictogramsURL: Suggestion[]) {
  const updatedPictograms = await Promise.all(
    pictogramsURL.map(async (pictogram) => {
      const id = parseInt(pictogram.id);
      if (isNaN(id)) {
        return {
          ...pictogram,
          id: "123456", //TODO add library to get id nanoid
          picto: [await pictonizer(pictogram.text)],
        };
      }
      return pictogram;
    })
  );
  return updatedPictograms;
}

async function getSuggestions({
  prompt,
  maxSuggestions,
  symbolSet,
  language = DEFAULT_LANGUAGE,
}: {
  prompt: string;
  maxSuggestions: number;
  symbolSet?: string;
  language: string;
}): Promise<Suggestion[]> {
  const words: string[] = await getWordSuggestions({
    prompt,
    maxWords: maxSuggestions,
    language,
  });
  const pictogramsURLs: Suggestion[] = await fetchPictogramsURLs({
    words,
    symbolSet,
    language,
  });

  return pictogramsURLs;
}

const getSuggestionsAndProcessPictograms = async ({
  prompt,
  maxSuggestions,
  symbolSet,
  language = DEFAULT_LANGUAGE,
}: {
  prompt: string;
  maxSuggestions: number;
  symbolSet?: string;
  language: string;
}) => {
  const suggestions = await getSuggestions({
    prompt,
    maxSuggestions,
    symbolSet,
    language,
  });
  const pictograms = await processPictograms(suggestions);
  return pictograms;
};
