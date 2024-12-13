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

async function generateCoreBoard(
  prompt: string,
  totalButtons: number = 1
): Promise<any> {
  // Calculate slots for each category based on percentages
  let categorySlots = CORE_CATEGORIES.map((category) => ({
    name: category.name,
    slots: Math.round(totalButtons * category.percentage),
    required: category.required,
  }));

  //Log category slots
  console.log("\nCategory Slots: ");
  categorySlots.forEach((category) => {
    console.log(`${category.name}: ${category.slots} slots`);
  });
  console.log("\n");

  // Generate dynamic words from LLM for non-fixed categories
  const dynamicWords = await generateDynamicWords(prompt, categorySlots);

  // Combine fixed and dynamic words
  const allWords = combineWords(dynamicWords, categorySlots);

  // Create OBF format board
  const board = createOBFBoard(allWords, prompt, totalButtons);
  visualizeBoard(board);
  return board;
}

async function generateDynamicWords(
  prompt: string,
  categorySlots: { name: CategoryName; slots: number; required: boolean }[]
): Promise<Map<CategoryName, string[]>> {
  const openai = new OpenAIApi(
    new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })
  );

  const dynamicCategories = categorySlots.filter(
    (cat) => !hasFixedWords(cat.name)
  );
  const wordsMap = new Map<CategoryName, string[]>();
  //const languageName = getLanguageName(language);
  const max_tokens = Math.round(4.5 * 50 + 200);

  for (const category of dynamicCategories) {
    const response =
      await globalConfiguration.openAIInstance.createChatCompletion({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a speech language pathologist selecting core vocabulary ${category.name.toLowerCase()} related to "${prompt}". Provide exactly ${
              category.slots
            } common, versatile words that could be used across multiple contexts.`,
          },
          {
            role: "user",
            content: `Generate ${
              category.slots
            } core ${category.name.toLowerCase()} for the topic "${prompt}". Return only the words in a comma-separated list.`,
          },
        ],
        temperature: 0,
        max_tokens: max_tokens,
      });

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Failed to get valid response from LLM");
    }
    const wordList = content
      .split(",")
      .map((word) => word.trim())
      .slice(0, category.slots);

    wordsMap.set(category.name, wordList);
  }

  return wordsMap;
}

function combineWords(
  dynamicWords: Map<CategoryName, string[]>,
  categorySlots: { name: CategoryName; slots: number; required: boolean }[]
): CoreWord[] {
  const allWords: CoreWord[] = [];
  let idCounter = 1;

  // Add fixed words first
  Object.entries(FIXED_CORE_WORDS).forEach(([category, words]) => {
    const categoryName = category as CategoryName;
    const categorySlot = categorySlots.find((cat) => cat.name === category);
    const numberOfWordsToAdd = categorySlot ? categorySlot.slots : 0;

    const limitedWords = words.slice(0, numberOfWordsToAdd);

    limitedWords.forEach((word) => {
      allWords.push({
        id: idCounter.toString(),
        label: word,
        background_color: getCategoryColor(categoryName),
        border_color: "rgb(0, 0, 0)",
        category: categoryName,
      });
      idCounter++;
    });
  });

  // Add dynamic words
  dynamicWords.forEach((words, category) => {
    words.forEach((word) => {
      allWords.push({
        id: idCounter.toString(),
        label: word,
        background_color: getCategoryColor(category),
        border_color: "rgb(0, 0, 0)",
        category: category,
      });
      idCounter++;
    });
  });

  return allWords;
}

function createOBFBoard(
  words: CoreWord[],
  prompt: string,
  totalButtons: number
): any {
  // Calculate grid dimensions
  const columns = Math.ceil(Math.sqrt(totalButtons));
  const rows = Math.ceil(totalButtons / columns);

  // Create grid order
  const gridOrder = createGridOrder(words, rows, columns);

  // Create OBF format object
  return {
    format: "open-board-0.1",
    id: "1",
    locale: "en",
    name: `Core Board - ${prompt}`,
    description_html: `Core vocabulary board generated for the topic: ${prompt}`,
    buttons: words.map((word) => ({
      id: word.id,
      label: word.label,
      background_color: word.background_color,
      border_color: word.border_color,
    })),
    grid: {
      rows,
      columns,
      order: gridOrder,
    },
  };
}

type CategoryColors = {
  [K in CategoryName]: string;
};

const CATEGORY_COLORS: CategoryColors = {
  Actions: "rgb(200, 255, 200)", // green
  "Adjectives/Adverbs": "rgb(135, 206, 250)", // blue
  Pronouns: "rgb(255, 255, 200)", // yellow
  Interjections: "rgb(255, 192, 203)", // pink
  Questions: "rgb(255, 200, 255)", // purple
  Determiners: "rgb(230, 230, 230)", // gray
  Prepositions: "rgb(255, 255, 255)", // wwhite
  Negation: "rgb(255, 140, 140)", // red
};

function getCategoryColor(category: CategoryName): string {
  return CATEGORY_COLORS[category];
}

type Button = {
  id: string;
  label: string;
  background_color: string;
  border_color: string;
};

type OBFBoard = {
  buttons: Button[];
  grid: {
    rows: number;
    columns: number;
    order: (string | null)[][];
  };
};

function rgbToAnsi(rgbColor: string): string {
  // Extract RGB values from the string format "rgb(r, g, b)"
  const match = rgbColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return "\x1b[0m"; // Default to reset if no match

  const [_, r, g, b] = match.map(Number);

  // Convert RGB to closest ANSI color code
  // Using background color (40-47, 100-107)
  const brightness = (r + g + b) / 3;
  const textColor = brightness < 128 ? "\x1b[97m" : "\x1b[30m"; // White or black text

  return `\x1b[48;2;${r};${g};${b}m${textColor}`;
}

function createGridOrder(
  words: CoreWord[],
  rows: number,
  columns: number
): (string | null)[][] {
  const gridOrder: (string | null)[][] = Array(rows)
    .fill(null)
    .map(() => Array(columns).fill(null));

  // Calculate absolute sizes of each category
  const pronounColumnSize = Math.floor(rows * 0.9); //Pronouns
  const actionColumnSize = Math.floor(rows * 0.7); //Actions
  const questionRowSize = Math.floor(columns * 0.4); //Questions

  // Group words by category
  const wordsByCategory = words.reduce((acc, word) => {
    if (!acc[word.category]) {
      acc[word.category] = [];
    }
    acc[word.category].push(word);
    return acc;
  }, {} as Record<CategoryName, CoreWord[]>);

  // Fill board with each category
  let addedWords = 0;
  let currentCol = 0;
  let currentRowLimit = pronounColumnSize;
  let currentCategory = 0;
  let currentWordsByCategory =
    wordsByCategory[CORE_CATEGORIES[currentCategory].name] || [];

  // Fill pronouns, actions and adjectives
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < currentRowLimit; row++) {
      if (addedWords < currentWordsByCategory.length) {
        gridOrder[row][col] = currentWordsByCategory[addedWords].id;
        addedWords++;
      }
      if (addedWords >= currentWordsByCategory.length) {
        currentCategory++;
        currentWordsByCategory =
          wordsByCategory[CORE_CATEGORIES[currentCategory].name] || [];
        currentRowLimit = actionColumnSize;
        addedWords = 0;
      }
    }
  }

  // Fill determiners and prepositions
  // Get the last position where we placed a pronoun
  let lastPronounRow = Math.floor(
    ((wordsByCategory[CORE_CATEGORIES[0].name] || []).length - 1) %
      pronounColumnSize
  );
  let lastPronounCol = Math.floor(
    ((wordsByCategory[CORE_CATEGORIES[0].name] || []).length - 1) /
      pronounColumnSize
  );

  addedWords = 0;
  currentCategory = 3;
  currentWordsByCategory =
    wordsByCategory[CORE_CATEGORIES[currentCategory].name];
  for (let col = lastPronounCol; col < columns; col++) {
    for (let row = actionColumnSize; row < pronounColumnSize; row++) {
      if (addedWords < currentWordsByCategory.length) {
        gridOrder[row][col] = currentWordsByCategory[addedWords].id;
        addedWords++;
      }
      if (addedWords >= currentWordsByCategory.length) {
        currentCategory++;
        if (currentCategory >= CORE_CATEGORIES.length) {
          break;
        }
        currentWordsByCategory =
          wordsByCategory[CORE_CATEGORIES[currentCategory].name] || [];
        addedWords = 0;
      }
    }
  }

  //Fill bottom rows with questions, negation and interjections /*
  currentWordsByCategory = wordsByCategory[CORE_CATEGORIES[5].name];
  for (let col = 0; col < columns; col++) {
    for (let row = pronounColumnSize; row < rows; row++) {
      if (addedWords < currentWordsByCategory.length) {
        gridOrder[row][col] = currentWordsByCategory[addedWords].id;
        addedWords++;
      }
      if (addedWords >= currentWordsByCategory.length) {
        currentCategory++;
        if (currentCategory >= CORE_CATEGORIES.length) {
          break;
        }
        currentWordsByCategory =
          wordsByCategory[CORE_CATEGORIES[currentCategory].name] || [];
        addedWords = 0;
      }
    }
  }

  return gridOrder;
}

function visualizeBoard(board: OBFBoard): void {
  const buttons = new Map(board.buttons.map((btn: Button) => [btn.id, btn]));
  const grid = board.grid;

  console.log("\nBoard Layout:");
  console.log("=".repeat(grid.columns * 15));

  for (const row of grid.order) {
    const rowVisual = row.map((buttonId) => {
      if (!buttonId) {
        return "---empty---".padEnd(12);
      }
      const button = buttons.get(buttonId);
      if (!button) {
        return "---error---".padEnd(12);
      }

      const colorCode = rgbToAnsi(button.background_color);
      const resetCode = "\x1b[0m";
      return `${colorCode}${button.label.padEnd(12)}${resetCode}`;
    });

    console.log(rowVisual.join("|"));
    console.log("-".repeat(grid.columns * 15));
  }
  console.log("\x1b[0m"); // Reset all styling at the end
}

export { generateCoreBoard };
