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
    getCoreBoardSuggestions,
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

// Get Core Board
async function getCoreBoardSuggestions({
  topic,
  maxWords = 30,
  language = DEFAULT_LANGUAGE,
}: {
  topic: string;
  maxWords?: number;
  language: string;
}): Promise<CoreBoard> {
  const languageName = getLanguageName(language);
  const max_tokens = Math.round(4.5 * maxWords + 200);

  const response =
    await globalConfiguration.openAIInstance.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Act as a speech pathologist creating a communication board for nonverbal users in ${languageName}. 
        This board must use core vocabulary words and maintain a specific order for easy usage.
        Here are mandatory instructions for the board:
        - The board must contain precisely ${maxWords} words total
        - Only use high-frequency core vocabulary words that can be used across many contexts
        - When using verbs, use the infinitive form only
        - Each word must be categorized according to its type
        - Do not repeat any words
        - Return ONLY the JSON with no additional text or formatting
        - Use double quotes for ALL JSON properties and values
        - Follow this EXACT format with these EXACT category names:
        {
          "BoardName": [
            {
              "words": [
                {"CommonQuestions": "what"},
                {"Subjects": "I"},
                {"ActionsVerbs": "want"},
                {"Adjectives": "big"},
                {"Adverbs": "here"},
                {"Prepositions": "in"},
                {"Nouns": "toy"},
                {"Negation": "no"}
              ]
            }
          ]
        }`,
        },
        {
          role: "user",
          content: `Create a core vocabulary board about "${topic}" with exactly ${maxWords} words, following this exact category order:
        1. CommonQuestions
        2. Subjects
        3. ActionsVerbs
        4. Adjectives
        5. Adverbs
        6. Prepositions
        7. Nouns
        8. Negation

        Return ONLY the JSON with these exact category names.`,
        },
      ],
      temperature: 0,
      max_tokens: max_tokens,
    });

  const coreBoardData = response.data?.choices[0]?.message?.content;

  if (!coreBoardData) {
    throw new Error("ERROR: Core board generation failed - empty response");
  }

  try {
    // Clean up potential formatting issues
    const cleanedData = coreBoardData
      .trim()
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/(\w+):/g, '"$1":') // Ensure property names are quoted
      .replace(/\n/g, "") // Remove any newlines
      .replace(/\s+/g, " "); // Normalize spaces

    const coreBoard = JSON.parse(cleanedData) as CoreBoard;

    if (!coreBoard.BoardName?.[0]?.words?.length) {
      throw new Error("ERROR: Invalid core board format or empty board");
    }

    // Define the desired category order
    const categoryOrder = [
      "CommonQuestions",
      "Subjects",
      "ActionsVerbs",
      "Adjectives",
      "Adverbs",
      "Prepositions",
      "Nouns",
      "Negation",
    ];

    // Function to get category of a word object
    const getCategory = (word: CoreVocabularyWord): string =>
      Object.keys(word)[0];

    // Function to get word value
    const getValue = (word: CoreVocabularyWord): string =>
      Object.values(word)[0];

    // Sort and deduplicate words
    const words = coreBoard.BoardName[0].words;
    const seenWords = new Set<string>();
    const sortedWords = words
      .filter((word) => {
        const wordValue = getValue(word);
        if (seenWords.has(wordValue)) {
          return false;
        }
        seenWords.add(wordValue);
        return true;
      })
      .sort((a, b) => {
        const categoryA = getCategory(a);
        const categoryB = getCategory(b);
        const indexA = categoryOrder.indexOf(categoryA);
        const indexB = categoryOrder.indexOf(categoryB);

        if (indexA !== indexB) {
          return indexA - indexB;
        }

        // If categories are the same, sort alphabetically by word value
        return getValue(a).localeCompare(getValue(b));
      });

    // Update the core board with sorted and deduplicated words
    coreBoard.BoardName[0].words = sortedWords;

    // Validate all required categories are present
    const hasAllCategories = categoryOrder.every((category) =>
      sortedWords.some((word) => Object.keys(word).includes(category))
    );

    if (!hasAllCategories) {
      throw new Error("ERROR: Missing required categories in the response");
    }

    return coreBoard;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Original response:", coreBoardData);
      throw new Error(
        `ERROR: Failed to parse core board JSON: ${error.message}`
      );
    }
    throw error;
  }
}
