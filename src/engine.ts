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
import { getLanguageTwoLetterCode } from "./utils/language";
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
  };
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
