import { Configuration, OpenAIApi, ConfigurationParameters } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import {
  txt2imgBody,
  DEFAULT_GLOBAL_SYMBOLS_URL,
  DEFAULT_LANGUAGE,
} from "./constants";
import { LabelsSearchApiResponse } from "./types/global-symbols";

const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  pictonizerURL: "",
};

export type Pictogram = {
  id: string;
  text: string;
  locale: string;
  picto: string[];
};

export type Suggestions = Pictogram[];

export function init({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerApiURL,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  pictonizerApiURL?: string;
}) {
  const configuration = new Configuration(openAIConfiguration);
  globalConfiguration.openAIInstance = new OpenAIApi(configuration);

  if (globalSymbolsApiURL) {
    globalConfiguration.globalSymbolsURL = globalSymbolsApiURL;
  }

  if (pictonizerApiURL) {
    globalConfiguration.pictonizerURL = pictonizerApiURL;
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
}): Promise<Pictogram[]> {
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

    const pictogramsList: Pictogram[] = dataList.map((data) => ({
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
  //TODO pedir que me de un prompt mejorado del picto a mejorar
  //https://platform.openai.com/docs/guides/prompt-engineering
  //https://learnprompting.org/es/docs/intro Imageprompting

  // Update txt2imgBody object's properties that relate to input
  txt2imgBody.prompt = `a pictogram of ${imagePrompt}, (vectorized, drawing, simplified, rounded face, digital art, icon)`;
  txt2imgBody.negative_prompt =
    "(words, letters, text, numbers, symbols), (details, open traces, sharp corners, distorted proportion), (lip, nose, tooth, rouge, wrinkles, detailed face, deformed body, extra limbs)";
  txt2imgBody.width = 512;
  txt2imgBody.height = 512;

  try {
    if (!!globalConfiguration.pictonizerURL) {
      const response = await fetch(globalConfiguration.pictonizerURL, {
        method: "POST",
        body: JSON.stringify(txt2imgBody),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const {
        images,
        parameters: { width, height, prompt },
      } = data;

      const resultJson = {
        images: images.map((image: any) => ({
          data: image, //TODO Change this Base64 for an URL once we have deployed a function that runs this in Azure.
          width: width,
          height: height,
        })),
        prompt: prompt,
      };
      return JSON.stringify(resultJson);
    }
    throw new Error("PictonizerURL is not defined");
  } catch (error: Error | any) {
    console.error("Error generating pictogram: ", error.message);
    return JSON.stringify({
      images: [{ data: "ERROR Generating Pictogram" }],
      prompt: imagePrompt,
    });
  }
}

async function processPictograms(pictogramsURL: Pictogram[]) {
  const updatedPictograms = await Promise.all(
    pictogramsURL.map(async (pictogram) => {
      const id = parseInt(pictogram.id);
      if (isNaN(id)) {
        return {
          ...pictogram,
          id: 123456, //TODO add library to get id nanoid
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
  maxWords,
  symbolSet,
  language = DEFAULT_LANGUAGE,
}: {
  prompt: string;
  maxWords: number;
  symbolSet?: string;
  language: string;
}): Promise<Pictogram[]> {
  const words: string[] = await getWordSuggestions({
    prompt,
    maxWords,
    language,
  });
  const pictogramsURLs: Pictogram[] = await fetchPictogramsURLs({
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
    maxWords: maxSuggestions,
    symbolSet,
    language,
  });
  const pictograms = await processPictograms(suggestions);
  return pictograms;
};
