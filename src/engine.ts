import { Configuration, OpenAIApi, ConfigurationParameters } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import {
  DEFAULT_ARASAAC_URL,
  DEFAULT_GLOBAL_SYMBOLS_URL,
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_SUGGESTIONS,
} from "./constants";
import { LabelsSearchApiResponse } from "./types/global-symbols";
import { nanoid } from "nanoid";
import ContentSafetyClient, { isUnexpected  } from "@azure-rest/ai-content-safety";
import { AzureKeyCredential } from "@azure/core-auth";


const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  arasaacURL: DEFAULT_ARASAAC_URL,
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
  arasaacURL,
  pictonizerConfiguration,
  contentSafetyConfiguration,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  arasaacURL?:string;
  pictonizerConfiguration?: PictonizerConfiguration;
  contentSafetyConfiguration?: ContentSafetyConfiguration;
}) {
  const configuration = new Configuration(openAIConfiguration);
  globalConfiguration.openAIInstance = new OpenAIApi(configuration);

  if (globalSymbolsApiURL) {
    globalConfiguration.globalSymbolsURL = globalSymbolsApiURL;
  }

  if (arasaacURL) {
    globalConfiguration.arasaacURL = arasaacURL;
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
  const max_tokens = Math.round(4.2 * maxWords + 110);
  const completionRequestParams = {
    model: "text-davinci-003",
    prompt: `act as a speech pathologist selecting pictograms in language ${language} 
      for a non verbal person about ${prompt}. 
      Here are mandatory instructions for the list:
        -You must provide a list of ${maxWords} maximum.
        -It is very important to not repeat words. 
        -Do not add any other text or characters to the list. 
        -Template for the list {word1, word2, word3,..., wordN}`,
    temperature: 0,
    max_tokens: max_tokens,
  }; 

  const response = await globalConfiguration.openAIInstance.createCompletion(
    completionRequestParams
  );
  const wordsSuggestionsData = response.data?.choices[0]?.text;
  if (wordsSuggestionsData) {
    const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
    const match = trimmedString.match(/{(.*?)}/);
    const wordsSuggestionsList = match
      ? match[1]
          .split(",")
          .map((word) => word.trim())
          .slice(0, maxWords)
      : [];
    if (!wordsSuggestionsList.length)
      throw new Error("ERROR: Suggestion list is empty or maxToken reached");
    return wordsSuggestionsList;
  }
  throw new Error("ERROR: Suggestion list is empty");
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
    if(symbolSet == 'arasaac'){
      
      const locale = convertLanguageToLocale(language); //Function to change from eng to en, spa to es

      console.log('fetching words: -------------------------------------');
      const responses = await Promise.all(
        words.map(async (word) => {
          const fullUrl = `${globalConfiguration.arasaacURL}/${locale}/bestsearch/${encodeURIComponent(word)}`;
          console.log('fetching: '+fullUrl);
          try {
            const response = await axios.get(fullUrl);
            return response.data;
          } catch (error) {
            // Handle error here
            console.error(`Error for word "${word}": ${error}`);
            return [{"_id":'0000',"keywords":[{"keyword":`${word}`}]}]
          }
        })
      );

      const suggestions: Suggestion[] = responses.map((response) => {
        const data = response;
        if (data[0]._id != '0000')
          return {
            id: nanoid(5),
            label: data[0].keywords[0].keyword,
            locale: language,
            pictogram: {
              isAIGenerated: false,
              images: data.map((pictogram: any) => ({
                id: pictogram._id,
                symbolSet: 'arasaac',
                url: `https://static.arasaac.org/pictograms/${pictogram._id}/${pictogram._id}.png`,
                //url: `https://api.arasaac.org/api/pictograms/${pictogram._id}`,
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
    
    } else {
    const requests = words.map((word) =>
      //@rodrisanchez esto no lo entiendi 
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
  }
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
      if(!contentSafetyConfig.endpoint || !contentSafetyConfig.key)
        throw new Error('Content safety endpoint or key not defined');
      const credential = new AzureKeyCredential(contentSafetyConfig.key);
      const client = ContentSafetyClient(contentSafetyConfig.endpoint, credential);
      const text = textPrompt;
      const analyzeTextOption = { text: text };
      const analyzeTextParameters = { body: analyzeTextOption };
    
      const result = await client.path("/text:analyze").post(analyzeTextParameters);
    
      if (isUnexpected(result)) {
        throw result;
      }
      const severity = result.body.categoriesAnalysis.reduce((acc, cur) => acc + (cur.severity || 0), 0);
      return severity <= 1;
    } catch (error) {
      throw new Error('Error checking content safety: '+error);
    }
     
}

function convertLanguageToLocale(language: string): string {
  const languageMap: { [key: string]: string } = {
    eng: 'en',
    spa: 'es',
    // Add more mappings as needed
  };
  return languageMap[language] || language;
}
