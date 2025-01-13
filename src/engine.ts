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

// A function to generate a prompt for generating images from Leonardo AI using gpt-4o-mini and provided template and words
export async function generatePromptForImageGeneration({
  words,
}: {
  words: string[];
}): Promise<Array<{ word: string; prompt: string }>> {
  const completionRequestParams = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Create a detailed prompt to generate a pictogram for each word of the words array: '${words}'. 
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
    
    Return only the prompt for each word, no explanations. Keep it under 100 words for each word. 
    The returned template should be like this: 
    word1: 'prompt',
    word2: 'prompt', 
    ...
    wordN: 'prompt'`,
      },
      {
        role: "user",
        content: `Generate Prompts for ${words}`,
      },
    ],
    temperature: 0,
    max_tokens: 1500,
  };

  const response = await globalConfiguration.openAIInstance.createCompletion(
    completionRequestParams
  );
  const promptText = response.data?.choices[0]?.text;
  if (!promptText)
    throw new Error("Error generating prompt for image generation");
  try {
    // Split the text by newlines and parse each line
    const lines = promptText.split("\n").filter((line) => line.trim());
    return lines.map((line) => {
      const [word, ...promptParts] = line.split(":");
      return {
        word: word.trim(),
        prompt: promptParts
          .join(":")
          .trim()
          .replace(/^['"]|['"]$/g, ""), // Remove quotes if present
      };
    });
  } catch (error) {
    throw new Error("Error parsing image generation prompts: " + error);
  }
}

export async function getPromptsForLenonardo({
  prompt,
  maxWords,
  language,
}: {
  prompt: string;
  maxWords: number;
  language: string;
}) {
  const promptedWords = await getWordSuggestions({
    prompt,
    maxWords,
    language,
  });
  const leonardoPrompts = await generatePromptForImageGeneration({
    words: promptedWords,
  });

  return leonardoPrompts;
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
