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
  getArasaacOBFImages,
  OBFImage,
  getGlobalSymbolsOBFImages,
} from "./lib/symbolSets";
import { type SymbolSet } from "./lib/symbolSets";
import { getLanguageName, getLanguageTwoLetterCode } from "./utils/language";
import { CoreBoardService } from './coreBoardService';

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

//New type CoreVocabularyWord
export type CoreVocabularyWord = {
  [key: string]: string;
};

//New type CoreBoard
export type CoreBoard = {
  BoardName: {
    words: CoreVocabularyWord[];
  }[];
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
    //getCoreBoardSuggestions,
    generateCoreBoard,
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
  const response =
    await globalConfiguration.openAIInstance.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `act as a speech pathologist selecting pictograms in language ${languageName} 
        for a non verbal person about what the user asks you to.
        Here are mandatory instructions for the list:
         -Ensure that the list contains precisely ${maxWords} words; it must not be shorter or longer.
         -The words should be related to the topic.
         -When using verbs, you must use the infinitive form. Do not use gerunds, conjugated forms, or any other variations of the verb. 
         -Do not repeat any words.
         -Do not include any additional text, symbols, or characters beyond the words requested.
         -The list should follow this exact format: {word1, word2, word3,..., wordN}.`,
        },
        {
          role: "user",
          content: `Create a board about ${prompt}`,
        },
      ],
      temperature: 0,
      max_tokens: max_tokens,
    });

  const wordsSuggestionsData = response.data?.choices[0]?.message?.content;
  if (wordsSuggestionsData) {
    const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
    const match = trimmedString.match(/{(.*?)}/);
    const wordsSuggestionsList = match
      ? match[1]
          .split(",")
          .map((word) => word.trim())
          .slice(0, maxWords)
      : [];
    console.log(wordsSuggestionsList);
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
  const words: string[] = await getWordSuggestions({
    prompt,
    maxWords: maxSuggestions,
    language,
  });
  const suggestions: Suggestion[] = await fetchPictogramsURLs({
    words,
    language,
    symbolSet,
    globalSymbolsSymbolSet,
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

export { getSuggestions, isContentSafe };

// Types for the CORE board structure
type CoreCategory = {
  name: CategoryName;
  percentage: number;
  required: boolean;
  gridPercentage?: number;
};

// Define valid category names as a union type
type CategoryName =
  | "Pronouns"
  | "Actions"
  | "Adjectives/Adverbs"
  | "Determiners"
  | "Prepositions"
  | "Questions"
  | "Negation"
  | "Interjections";

type CoreWord = {
  id: string;
  label: string;
  background_color: string;
  border_color: string;
  category: CategoryName;
};

type FixedCoreWords = {
  Pronouns: string[];
  Questions: string[];
  Interjections: string[];
  Negation: string[];
};

// Core categories with their target percentages
const CORE_CATEGORIES: CoreCategory[] = [
  { name: "Pronouns", percentage: 0.15, required: true, gridPercentage: 0.9 },
  { name: "Actions", percentage: 0.25, required: false, gridPercentage: 0.8 },
  {
    name: "Adjectives/Adverbs",
    percentage: 0.3,
    required: false,
    gridPercentage: 0.8,
  },
  {
    name: "Determiners",
    percentage: 0.08,
    required: false,
    gridPercentage: 0.5,
  },
  { name: "Prepositions", percentage: 0.15, required: false },
  { name: "Questions", percentage: 0.05, required: true, gridPercentage: 0.4 },
  { name: "Negation", percentage: 0.02, required: true },
  { name: "Interjections", percentage: 0.08, required: true },
];

// Fixed core words per category that should always be included
const FIXED_CORE_WORDS: FixedCoreWords = {
  Pronouns: ["I", "you", "it", "we", "they", "he", "she"], //Sort these by importance
  Questions: ["what", "where", "when", "who", "why", "how"],
  Interjections: ["yes", "no", "please", "thank you"],
  Negation: ["not", "don't"],
};

// Type guard to check if a category has fixed words
function hasFixedWords(
  category: CategoryName
): category is keyof FixedCoreWords {
  return category in FIXED_CORE_WORDS;
}

const MIN_BUTTONS = 20;
const MAX_BUTTONS = 100;
const BUTTON_STEP = 10;

async function generateCoreBoard(
  prompt: string,
  totalButtons: number = 20,
  symbolSet: SymbolSet = ARASAAC,
  globalSymbolsSymbolSet?: string
): Promise<any> {
  // Validate totalButtons range and step
  if (totalButtons < MIN_BUTTONS || totalButtons > MAX_BUTTONS) {
    throw new Error(
      `Total buttons must be between ${MIN_BUTTONS} and ${MAX_BUTTONS}. Received: ${totalButtons}`
    );
  }

  if ((totalButtons - MIN_BUTTONS) % BUTTON_STEP !== 0) {
    throw new Error(
      `Total buttons must be in steps of ${BUTTON_STEP} (${getValidButtonCounts().join(", ")}). Received: ${totalButtons}`
    );
  }

  // Initialize CoreBoardService with the global OpenAI instance
  const coreBoardService = new CoreBoardService(globalConfiguration.openAIInstance);
  return await coreBoardService.generateCoreBoard(
    prompt, 
    totalButtons, 
    symbolSet, 
    globalSymbolsSymbolSet,
    globalConfiguration // Pass the global configuration
  );
}

// Helper function to get valid button counts
function getValidButtonCounts(): number[] {
  const counts = [];
  for (let i = MIN_BUTTONS; i <= MAX_BUTTONS; i += BUTTON_STEP) {
    counts.push(i);
  }
  return counts;
}

export { generateCoreBoard, MIN_BUTTONS, MAX_BUTTONS, BUTTON_STEP, getValidButtonCounts };
