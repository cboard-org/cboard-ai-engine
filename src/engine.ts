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
import { CoreBoardService } from "./coreBoardService";
import { OpenAIService } from "./utils/openAIservice";
import { ContentSafetyConfiguration, Suggestion } from "./types/types";

// Export Suggestion type to make it available to importers
export type { Suggestion, ContentSafetyConfiguration };

const globalConfiguration = {
  openAIInstance: {} as OpenAIApi,
  openAIService: {} as OpenAIService,
  globalSymbolsURL: DEFAULT_GLOBAL_SYMBOLS_URL,
  arasaacURL: DEFAULT_ARASAAC_URL,
  contentSafety: {} as ContentSafetyConfiguration,
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
  globalConfiguration.openAIService = new OpenAIService(
    globalConfiguration.openAIInstance
  );

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
    generateCoreBoard,
    generateAPromptForLeonardo,
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
  const words: string[] =
    await globalConfiguration.openAIService.getWordSuggestions({
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

export async function generateAPromptForLeonardo({
  word,
}: {
  word: string;
}): Promise<string> {
  const max_tokens = Math.round(2 * 100 + 460);
  const response =
    await globalConfiguration.openAIInstance.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert in creating pictogram prompts. Analyze the word and create a detailed prompt following these guidelines:

CLASSIFICATION CRITERIA:
For ACTIONS:
-Can it be performed/demonstrated?
-Does it involve movement or change?
-Can you complete the phrase "to [word]"?

For OBJECTS:
-Can it be touched or physically exist?
-Is it a person, place, or thing?
-Can you put "the" or "a" before it?

For ADJECTIVES:
-Does it describe a quality or state?
-Can you put "very" before it?
-Can you add "-er" or "-est" to compare it?

TEMPLATE REQUIREMENTS:
For ACTIONS:
-Show simplified human figure mid-action
-Capture distinctive moment
-Include motion indicators
-Use appropriate view angle
-Include essential props only

For OBJECTS:
-Show complete item in recognizable form
-Use optimal viewing angle
-Follow specific guidelines for category
-Avoid interaction/movement

For ADJECTIVES:
-Show clear comparison/extreme example
-Use split scenes if needed
-Include reference objects
-Use universal symbols
-Emphasize through composition

STYLE:
-Bold black outlines (3px)
-Flat colors
-High contrast
-Centered composition
-White background
-No gradients/shadows
-1:1 ratio

Return only the prompt, under 100 words, no explanations.`,
        },
        {
          role: "user",
          content: `Create a pictogram prompt for the word: '${word}'`,
        },
      ],
      temperature: 0,
      max_tokens: max_tokens,
    });

  const promptText = response.data?.choices[0]?.message?.content;
  if (!promptText)
    throw new Error("Error generating prompt for image generation");
  return promptText;
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
      `Total buttons must be in steps of ${BUTTON_STEP} (${getValidButtonCounts().join(
        ", "
      )}). Received: ${totalButtons}`
    );
  }

  const coreBoardService = new CoreBoardService(
    globalConfiguration.openAIService,
    {
      arasaacURL: globalConfiguration.arasaacURL,
      globalSymbolsURL: globalConfiguration.globalSymbolsURL,
    }
  );

  return await coreBoardService.generateCoreBoard(
    prompt,
    totalButtons,
    symbolSet,
    globalSymbolsSymbolSet
  );
}

function getValidButtonCounts(): number[] {
  const counts = [];
  for (let i = MIN_BUTTONS; i <= MAX_BUTTONS; i += BUTTON_STEP) {
    counts.push(i);
  }
  return counts;
}

export {
  generateCoreBoard,
  MIN_BUTTONS,
  MAX_BUTTONS,
  BUTTON_STEP,
  getValidButtonCounts,
};
