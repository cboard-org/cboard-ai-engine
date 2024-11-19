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
  const max_tokens = Math.round(4.2 * maxWords + 110);
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

// A function to generate a prompt for generating images from Leonardo AI using GPT3.5-turbo-instruct and provided template and words
export async function generatePromptForImageGeneration({
  word,
}: {
  word: string;
}): Promise<string> {
  const completionRequestParams = {
    model: "gpt-3.5-turbo-instruct",
    prompt: 
    `Create a detailed prompt to generate a pictogram for '${word}'. 
    First, determine if this is primarily an ACTION or OBJECT, then create a prompt following the appropriate template below.

    For ACTIONS (verbs, activities):
    - Show a figure actively performing the action
    - Include clear motion indicators where appropriate
    - Focus on the most recognizable moment of the action
    - Use side view if it better shows the action
    - Include minimal but necessary context elements
    
    Style requirements:
    - Bold black outlines
    - Flat colors
    - High contrast
    - Centered composition
    - White background
    - Simple geometric shapes
    
    Return only the prompt, no explanations. Keep it under 100 words.`,
    temperature: 0,
    max_tokens: 150,
  };

  const response = await globalConfiguration.openAIInstance.createCompletion(
    completionRequestParams
  );
  const prompt = response.data?.choices[0]?.text;
  if (!prompt) throw new Error("Error generating prompt for image generation");
  return prompt;
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
  if (symbolSet === GLOBAL_SYMBOLS)
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

async function checkWordAvailability(
  word: string,
  language: string,
  symbolSet?: SymbolSet,
  globalSymbolsSymbolSet?: string
): Promise<boolean> {
  const urls = await fetchPictogramsURLs({
    words: [word],
    language,
    symbolSet,
    globalSymbolsSymbolSet,
  });
  return (
    urls[0].pictogram.images.length > 0 &&
    urls[0].pictogram.images[0].url !== ""
  );
}

async function processBatch<T>({
  items,
  batchSize,
  processor,
}: {
  items: T[];
  batchSize: number;
  processor: (batch: T[]) => Promise<any>;
}): Promise<any[]> {
  const results: any[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
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

  const suggestions = await processBatch({
    items: words,
    batchSize: 5,
    processor: (batch) => fetchPictogramsURLs({
      words: batch,
      language,
      symbolSet,
      globalSymbolsSymbolSet,
    }),
  });

  const validSuggestions = suggestions.filter(
    suggestion => 
      suggestion.pictogram.images.length > 0 &&
      suggestion.pictogram.images[0].url !== ""
  );

  return validSuggestions.slice(0, maxSuggestions);
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
