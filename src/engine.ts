import { Configuration, OpenAIApi, ConfigurationParameters } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import { DEFAULT_GLOBAL_SYMBOLS_URL, DEFAULT_LANGUAGE, DEFAULT_MAX_SUGGESTIONS } from "./constants";
import { LabelsSearchApiResponse } from "./types/global-symbols";
import { nanoid } from "nanoid";
//TODO @rodriSanchez check this is OK
const ContentSafetyClient = require("@azure-rest/ai-content-safety").default,
  { isUnexpected } = require("@azure-rest/ai-content-safety");
const { AzureKeyCredential } = require("@azure/core-auth");


const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  pictonizer: {} as PictonizerConfiguration,
  contentSafety: {} as ContentSafetyConfiguration,
};

export type Suggestion = {
  id: string;
  label: string;
  locale: string;
  pictogram: {
    isAIGenerated: boolean;
    images:
      | {
          id: string;
          symbolSet: string;
          url: string;
        }[]
      | AIImage[];
  };
};

export type AIImage = {
  blob: Blob | null;
  ok: boolean;
  error?: string;
  prompt: string;
};

export type PictonizerConfiguration = {
  URL?: string;
  token?: string;
  keyWords?: string;
};

export type ContentSafetyConfiguration = {
  endpoint: string;
  key: string;
};


export function init({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerConfiguration,
  contentSafetyConfiguration,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  pictonizerConfiguration?: PictonizerConfiguration;
  contentSafetyConfiguration?: ContentSafetyConfiguration;
}) {
  const configuration = new Configuration(openAIConfiguration);
  globalConfiguration.openAIInstance = new OpenAIApi(configuration);

  if (globalSymbolsApiURL) {
    globalConfiguration.globalSymbolsURL = globalSymbolsApiURL;
  }

  if (pictonizerConfiguration) {
    globalConfiguration.pictonizer = pictonizerConfiguration;
  }

  if (contentSafetyConfiguration) {
    globalConfiguration.contentSafety = contentSafetyConfiguration;
  }

  return {
    getSuggestions,
    pictonizer,
    getSuggestionsAndProcessPictograms,
    isContentSafe,
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

    const suggestions: Suggestion[] = responses.map((response) => {
      const data = response.data;
      if (data.length)
        return {
          id: nanoid(5),
          label: data[0].text,
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

      return {
        id: nanoid(5),
        label: words[responses.indexOf(response)],
        locale: language,
        pictogram: {
          isAIGenerated: true,
          images: [
            {
              blob: null,
              ok: false,
              error: "ERROR: No image in the Symbol Set",
              prompt: words[responses.indexOf(response)],
            },
          ],
        },
      };
    });
    return suggestions;
  } catch (error: Error | any) {
    throw new Error("Error fetching pictograms URLs " + error.message);
  }
}

async function pictonizer(imagePrompt: string): Promise<AIImage> {
  const pictonizerConfig = globalConfiguration.pictonizer;
  const keyWords = pictonizerConfig.keyWords || "";
  const pictonizerPrompt = `${imagePrompt} ${keyWords}`;

  try {
    if (!!pictonizerConfig.URL && !!pictonizerConfig.token) {
      const body = `input=${pictonizerPrompt}`;

      const response = await fetch(pictonizerConfig.URL, {
        method: "POST",
        body: body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "image/*",
          Authorization: `Bearer ${pictonizerConfig.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.blob();
      const pictogram: AIImage = {
        blob: data,
        ok: true,
        prompt: `${pictonizerPrompt}`,
      };

      return pictogram;
    }
    throw new Error("Pictonizer URL or Auth token not defined");
  } catch (error: Error | any) {
    console.log("Error generating pictogram: ", error.message);
    const pictogram: AIImage = {
      blob: null,
      ok: false,
      error: "ERROR: Can't generate image",
      prompt: `${imagePrompt} ${keyWords}`,
    };
    return pictogram;
  }
}

async function processPictograms(
  suggestions: Suggestion[]
): Promise<Suggestion[]> {
  const suggestionsWithAIImage: Suggestion[] = [];

  for (const suggestion of suggestions) {
    if (suggestion.pictogram.isAIGenerated) {
      const suggestionWithAIImage = { ...suggestion };
      suggestionWithAIImage.pictogram.images = [
        await pictonizer(suggestion.label),
      ];
      suggestionsWithAIImage.push(suggestionWithAIImage);
    } else {
      suggestionsWithAIImage.push(suggestion);
    }
  }
  return suggestionsWithAIImage;
}

async function getSuggestions({
  prompt,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
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
  const suggestionsWithGlobalSymbolsImages: Suggestion[] =
    await fetchPictogramsURLs({
      words,
      symbolSet,
      language,
    });

  return suggestionsWithGlobalSymbolsImages;
}

const getSuggestionsAndProcessPictograms = async ({
  prompt,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
  symbolSet,
  language = DEFAULT_LANGUAGE,
}: {
  prompt: string;
  maxSuggestions: number;
  symbolSet?: string;
  language: string;
}) => {
  const suggestionsWithGlobalSymbolsImages = await getSuggestions({
    prompt,
    maxSuggestions,
    symbolSet,
    language,
  });
  const suggestionsWithAIImages = await processPictograms(
    suggestionsWithGlobalSymbolsImages
  );
  return suggestionsWithAIImages;
};

async function isContentSafe(
  textPrompt: string,
  ): Promise<boolean> {
    try {
      const contentSafetyConfig = globalConfiguration.contentSafety;
      const credential = new AzureKeyCredential(contentSafetyConfig.key);
      const client = ContentSafetyClient(contentSafetyConfig.endpoint, credential);
      const text = textPrompt;
      const analyzeTextOption = { text: text };
      const analyzeTextParameters = { body: analyzeTextOption };
    
      const result = await client.path("/text:analyze").post(analyzeTextParameters);
    
      if (isUnexpected(result)) {
        throw result;
      }
      let severity = 0;
      for (let i = 0; i < result.body.categoriesAnalysis.length; i++) {
        const textCategoriesAnalysisOutput = result.body.categoriesAnalysis[i];
        console.log(textCategoriesAnalysisOutput.category," severity: ",textCategoriesAnalysisOutput.severity);
        severity = severity + textCategoriesAnalysisOutput.severity;
      }
      return new Promise<boolean>((resolve) => {
        if (severity > 1)
          resolve(false);
        else
          resolve(true);
      });
    } catch (error) {
      throw new Error('Error checking content safety: '+error);
    }
     
}
