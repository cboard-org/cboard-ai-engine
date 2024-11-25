import { Configuration, OpenAIApi, ConfigurationParameters } from "openai";
import {
  ARASAAC,
  DEFAULT_ARASAAC_URL,
  DEFAULT_GLOBAL_SYMBOLS_URL,
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_SUGGESTIONS,
  GLOBAL_SYMBOLS,
} from "./constants";
import ContentSafetyClient, {
  isUnexpected,
} from "@azure-rest/ai-content-safety";
import { AzureKeyCredential } from "@azure/core-auth";
import {
  getArasaacPictogramSuggestions,
  getGlobalSymbolsPictogramSuggestions,
} from "./lib/symbolSets";
import { type SymbolSet } from "./lib/symbolSets";
import { getLanguageName, getLanguageTwoLetterCode } from "./utils/language";

const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  arasaacURL: DEFAULT_ARASAAC_URL,
  contentSafety: {} as ContentSafetyConfiguration,
};

export type Suggestion = {
  id: string;
  label: string;
  locale: string;
  pictogram: {
    images:
      | {
          id: string;
          symbolSet: string;
          url: string;
        }[];
  };
};

export type ContentSafetyConfiguration = {
  endpoint: string;
  key: string;
};

export function init({
  openAIConfiguration,
  globalSymbolsApiURL,
  arasaacURL,
  contentSafetyConfiguration,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  arasaacURL?: string;
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

  if (contentSafetyConfiguration) {
    globalConfiguration.contentSafety = contentSafetyConfiguration;
  }

  return {
    getSuggestions,
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
  const languageName = getLanguageName(language);
  const max_tokens = Math.round(4.5 * maxWords + 200);
  const completionRequestParams = {
    model: "gpt-3.5-turbo-instruct",
    prompt: `act as a speech pathologist selecting pictograms in language ${languageName} 
      for a non verbal person about ${prompt}. 
      Here are mandatory instructions for the list:
        -You must provide a list of ${maxWords} maximum.
        -When using verbs you must use infinitive form. Do not use gerunds, conjugated forms, or any other variations of the verb. 
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
  language,
  symbolSet = ARASAAC,
  globalSymbolsSymbolSet,
}: {
  words: string[];
  language: string;
  symbolSet?: SymbolSet;
  globalSymbolsSymbolSet?: string;
}): Promise<Suggestion[]> {
  const twoLetterCodeLanguage = getLanguageTwoLetterCode(language);
  // if (symbolSet === GLOBAL_SYMBOLS)
  return await getGlobalSymbolsPictogramSuggestions({
    URL: globalConfiguration.globalSymbolsURL,
    words,
    language: twoLetterCodeLanguage,
    symbolSet: globalSymbolsSymbolSet || null,
  });
  // Default to ARASAAC
  return await getArasaacPictogramSuggestions({
    URL: globalConfiguration.arasaacURL,
    words,
    language: twoLetterCodeLanguage,
  });
}

async function processBatch<TInput, TOutput>({
  items,
  batchSize,
  processor,
  maxResults,
  validator,
}: {
  items: TInput[];
  batchSize: number;
  processor: (batch: TInput[]) => Promise<TOutput[]>;
  maxResults: number;
  validator?: (item: TOutput) => boolean;
}): Promise<TOutput[]> {
  const results: TOutput[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    // Stop if we have enough valid results
    if (results.length >= maxResults) {
      break;
    }

    const remainingNeeded = maxResults - results.length;
    const currentBatchSize = Math.min(batchSize, items.length - i);
    const batch = items.slice(i, i + currentBatchSize);
    
    const batchResults = await processor(batch);
    
    // Filter and add valid results
    if (validator) {
      for (const result of batchResults) {
        if (results.length >= maxResults) {
          break;
        }
        if (validator(result)) {
          results.push(result);
        }
      }
    } else {
      results.push(...batchResults.slice(0, remainingNeeded));
    }
  }
  
  return results;
}

async function getSuggestions({
  prompt,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
  language = DEFAULT_LANGUAGE,
  symbolSet,
  globalSymbolsSymbolSet,
}: {
  prompt: string;
  maxSuggestions: number;
  language: string;
  symbolSet?: SymbolSet;
  globalSymbolsSymbolSet?: string;
}): Promise<Suggestion[]> {
  const words = await getWordSuggestions({
    prompt,
    maxWords: maxSuggestions * 2,
    language,
  });

  const suggestions = await processBatch<string, Suggestion>({
    items: words,
    batchSize: 5,
    maxResults: maxSuggestions,
    processor: (batch) => fetchPictogramsURLs({
      words: batch,
      language,
      symbolSet,
      globalSymbolsSymbolSet,
    }),
    validator: (suggestion) => 
      suggestion.pictogram.images.length > 0 && 
      suggestion.pictogram.images[0].url !== ""
  });

  return suggestions;
}

async function isContentSafe(textPrompt: string): Promise<boolean> {
  try {
    const contentSafetyConfig = globalConfiguration.contentSafety;
    if (!contentSafetyConfig.endpoint || !contentSafetyConfig.key)
      throw new Error("Content safety endpoint or key not defined");
    const credential = new AzureKeyCredential(contentSafetyConfig.key);
    const client = ContentSafetyClient(
      contentSafetyConfig.endpoint,
      credential
    );
    const text = textPrompt;
    const analyzeTextOption = { text: text };
    const analyzeTextParameters = { body: analyzeTextOption };

    const result = await client
      .path("/text:analyze")
      .post(analyzeTextParameters);

    if (isUnexpected(result)) {
      throw result;
    }
    const severity = result.body.categoriesAnalysis.reduce(
      (acc, cur) => acc + (cur.severity || 0),
      0
    );
    return severity <= 3;
  } catch (error) {
    throw new Error("Error checking content safety: " + error);
  }
}
