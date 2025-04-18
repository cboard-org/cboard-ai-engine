import { OpenAIApi } from "openai";
import { ARASAAC } from "./constants";
import {
  OBFImage,
  getArasaacOBFImages,
  getGlobalSymbolsOBFImages,
} from "./lib/symbolSets";
import { type SymbolSet } from "./lib/symbolSets";

// Types
export type CategoryName =
  | "Pronouns"
  | "Actions"
  | "Adjectives/Adverbs"
  | "Determiners"
  | "Prepositions"
  | "Questions"
  | "Negation"
  | "Interjections";

export type CoreCategory = {
  name: CategoryName;
  percentage: number;
  required: boolean;
  gridPercentage?: number;
};

export type CoreWord = {
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

// Constants
export const CORE_CATEGORIES: CoreCategory[] = [
  { name: "Pronouns", percentage: 0.15, required: true, gridPercentage: 0.9 },
  { name: "Actions", percentage: 0.3, required: false, gridPercentage: 0.8 },
  {
    name: "Adjectives/Adverbs",
    percentage: 0.3,
    required: false,
    gridPercentage: 0.8,
  },
  {
    name: "Determiners",
    percentage: 0.15,
    required: false,
    gridPercentage: 0.5,
  },
  { name: "Prepositions", percentage: 0.15, required: false },
  { name: "Questions", percentage: 0.1, required: true, gridPercentage: 0.4 },
  { name: "Negation", percentage: 0.1, required: true },
  { name: "Interjections", percentage: 0.15, required: true },
];

const FIXED_CORE_WORDS: FixedCoreWords = {
  Pronouns: [
    // Personal pronouns
    "I",
    "you",
    "it",
    "we",
    "they",
    "he",
    "she",
    // Possessive pronouns
    "my",
    "your",
    "their",
    "his",
    "her",
    "our",
    "its",
    // Demonstrative pronouns
    "this",
    "that",
    "these",
    "those",
    // Reflexive pronouns
    "myself",
    "yourself",
    "themselves",
  ],
  Questions: [
    // Basic question words
    "what",
    "where",
    "when",
    "who",
    "why",
    "how",
    // Extended question starters
    "which",
    "whose",
    "can",
    "will",
    "did",
    // Time-based questions
    "how long",
    "how often",
    "how many",
    // Clarification questions
    "really",
    "right",
    "okay",
  ],
  Interjections: [
    // Basic responses
    "yes",
    "no",
    "please",
    "thank you",
    // Greetings
    "hello",
    "hi",
    "bye",
    "goodbye",
    // Emotions
    "wow",
    "oh",
    "ah",
    "ouch",
    // Social expressions
    "sorry",
    "excuse me",
    "okay",
    "well",
    // Attention-getters
    "hey",
    "look",
    "listen",
    "wait",
  ],
  Negation: [
    // Basic negatives
    "not",
    "don't",
    // Additional negatives
    "no",
    "never",
    "none",
    // Negative auxiliaries
    "can't",
    "won't",
    "didn't",
    // Negative adverbs
    "nothing",
    "nowhere",
    "nobody",
  ],
};

const CATEGORY_COLORS: Record<CategoryName, string> = {
  Actions: "rgb(200, 255, 200)",
  "Adjectives/Adverbs": "rgb(135, 206, 250)",
  Pronouns: "rgb(255, 255, 200)",
  Interjections: "rgb(255, 192, 203)",
  Questions: "rgb(255, 200, 255)",
  Determiners: "rgb(180, 180, 180)",
  Prepositions: "rgb(255, 255, 255)",
  Negation: "rgb(255, 140, 140)",
};

export class CoreBoardService {
  constructor(
    private openAIInstance: OpenAIApi,
    private config: { arasaacURL: string; globalSymbolsURL: string }
  ) {}

  async generateCoreBoard(
    prompt: string,
    totalButtons: number,
    symbolSet: SymbolSet = ARASAAC,
    globalSymbolsSymbolSet?: string
  ): Promise<any> {
    // Calculate slots for each category
    const categorySlots = CORE_CATEGORIES.map((category) => {
      // Calculate initial slots
      let slots = Math.round(totalButtons * category.percentage);

      // If slots is odd, add 1 to make it even
      if (slots % 2 !== 0) {
        slots += 1;
      }

      return {
        name: category.name,
        slots: slots,
        required: category.required,
      };
    });
    console.log("categorySlots: ", categorySlots);

    const dynamicWords = await this.generateDynamicWords(prompt, categorySlots);
    const allWords = this.combineWords(dynamicWords, categorySlots);
    const images: OBFImage[] = [];
    /*const images = await this.getImages(
      allWords,
      symbolSet,
      globalSymbolsSymbolSet
    );*/
    const board = this.createOBFBoard(allWords, prompt, images, totalButtons);
    this.visualizeBoard(board);
    return board;
  }

  private async generateDynamicWords(
    prompt: string,
    categorySlots: { name: CategoryName; slots: number; required: boolean }[]
  ): Promise<Map<CategoryName, string[]>> {
    const dynamicCategories = categorySlots.filter(
      (cat) => !this.hasFixedWords(cat.name)
    );
    const wordsMap = new Map<CategoryName, string[]>();
    const max_tokens = Math.round(4.5 * 50 + 200);

    for (const category of dynamicCategories) {
      const response = await this.openAIInstance.createChatCompletion({
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

  private hasFixedWords(
    category: CategoryName
  ): category is keyof FixedCoreWords {
    return category in FIXED_CORE_WORDS;
  }

  private getCategoryColor(category: CategoryName): string {
    return CATEGORY_COLORS[category];
  }

  private combineWords(
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
          background_color: this.getCategoryColor(categoryName),
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
          background_color: this.getCategoryColor(category),
          border_color: "rgb(0, 0, 0)",
          category: category,
        });
        idCounter++;
      });
    });

    return allWords;
  }

  private async getImages(
    allWords: CoreWord[],
    symbolSet: SymbolSet,
    globalSymbolsSymbolSet?: string
  ): Promise<OBFImage[]> {
    if (symbolSet === ARASAAC) {
      return await getArasaacOBFImages({
        URL: this.config.arasaacURL,
        words: allWords.map((w) => w.label),
        language: "en",
      });
    } else {
      return await getGlobalSymbolsOBFImages({
        URL: this.config.globalSymbolsURL,
        words: allWords.map((w) => w.label),
        language: "en",
        symbolSet: globalSymbolsSymbolSet || null,
      });
    }
  }

  private createOBFBoard(
    words: CoreWord[],
    prompt: string,
    images: OBFImage[],
    totalButtons: number
  ): any {
    const columns = Math.ceil(Math.sqrt(totalButtons));
    const rows = Math.ceil(totalButtons / columns);
    const gridOrder = this.createGridOrder2(words, rows, columns);

    return {
      format: "open-board-0.1",
      id: "1",
      locale: "en",
      name: `Core Board - ${prompt}`,
      description_html: `Core vocabulary board generated for the topic: ${prompt}`,
      license: {
        type: "CC By",
        copyright_notice_url: "https://creativecommons.org/licenses/by/4.0/",
        author_name: "OpenAAC",
        author_url: "https://www.openaac.org",
      },
      buttons: words.map((word, index) => ({
        id: word.id,
        label: word.label,
        background_color: word.background_color,
        border_color: word.border_color,
        image_id: images[index]?.id.toString(),
      })),
      grid: {
        rows,
        columns,
        order: gridOrder,
      },
      images: images,
    };
  }

  private createGridOrder2(
    words: CoreWord[],
    rows: number,
    columns: number
  ): (string | null)[][] {
    // Initialize grid with nulls
    const grid: (string | null)[][] = Array(rows)
      .fill(null)
      .map(() => Array(columns).fill(null));

    // Group words by category
    const wordsByCategory = words.reduce((acc, word) => {
      if (!acc[word.category]) {
        acc[word.category] = [];
      }
      acc[word.category].push(word);
      return acc;
    }, {} as Record<CategoryName, CoreWord[]>);

    // Helper function to place words in the grid
    const placeWords = (
      category: CategoryName,
      startRow: number,
      startCol: number,
      maxRow: number,
      endCol: number = columns,
      isTop: boolean = false,
      balanceNumber: number = 0
    ): { lastRow: number; lastCol: number } => {
      //resize category words by balanceCoef
      let categoryWords = wordsByCategory[category] || [];
      categoryWords = categoryWords.slice(0, balanceNumber);
      let row = startRow;
      let col = startCol;
      let isFirstColumn = true;
      let wordsInCurrentColumn = 0;
      let maxWordsPerColumn = maxRow - (isFirstColumn ? startRow : 0);

      for (const word of categoryWords) {
        if (wordsInCurrentColumn >= maxWordsPerColumn) {
          col++;
          row = isTop ? 0 : startRow;
          isFirstColumn = false;
          wordsInCurrentColumn = 0;
          maxWordsPerColumn = maxRow - (isTop ? 0 : startRow);
        }
        if (col >= endCol) break;

        if (row >= 0 && row < rows && col >= 0 && col < columns) {
          grid[row][col] = word.id;
          row++;
          wordsInCurrentColumn++;
        } else {
          console.warn(
            `Attempted to place word outside grid bounds: word=${word.label}, row=${row}, col=${col}`
          );
          break; // Exit the loop if we're out of bounds
        }
      }

      // Calculate actual last position
      const actualLastCol = col === startCol ? col + 1 : col;
      return { lastRow: row, lastCol: actualLastCol };
    };

    // Calculate space allocation
    const usableRows = rows; // Reserve bottom row for special categories
    const pronounsEndRow = Math.floor(usableRows * 0.8); // Pronouns use 90% of vertical space
    const middleSection = Math.floor(pronounsEndRow * 0.8); //Math.floor(pronounsEndRow * 0.9);

    console.log("Usable rows: " + usableRows + " Usable columns: " + columns);
    console.log("Middle section: ", middleSection);
    console.log("Pronouns end row: ", pronounsEndRow);

    // 1. Place Pronouns (15% of total words)
    const pronounsResult = placeWords(
      "Pronouns",
      0,
      0,
      pronounsEndRow,
      columns,
      true,
      100
    );

    // 2. Place Actions (30% of total words)
    let availableSlots =
      middleSection -
      pronounsResult.lastRow +
      (columns - (pronounsResult.lastCol + 1)) * middleSection;
    console.log(
      "Actions Available slots: " +
        availableSlots +
        "Balance number: " +
        this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );
    const actionsResult = placeWords(
      "Actions",
      pronounsResult.lastRow,
      pronounsResult.lastCol,
      middleSection,
      columns,
      true,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );
    // 3. Place Adjectives/Adverbs (30%) after Actions section
    const adjectivesResult = placeWords(
      "Adjectives/Adverbs",
      actionsResult.lastRow,
      actionsResult.lastCol,
      middleSection,
      columns,
      true,
      100
    );

    // 4. Place Determiners (5%) in the middle
    availableSlots =
      (pronounsEndRow - middleSection) * (columns - pronounsResult.lastCol);
    console.log(
      "Determiner Available slots: " +
        availableSlots +
        "Balance number: " +
        this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );

    const determinersResult = placeWords(
      "Determiners",
      middleSection,
      pronounsResult.lastCol,
      pronounsEndRow,
      columns,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );

    // 5. Place Prepositions (5%) next to Determiners
    const prepositionsResult = placeWords(
      "Prepositions",
      middleSection,
      determinersResult.lastCol + 1,
      pronounsEndRow,
      columns,
      false,
      100
    );
    // 6. Place Questions (5%) at the bottom
    availableSlots = (usableRows - pronounsEndRow) * columns;
    console.log(
      "Questions Available slots: " +
        availableSlots +
        "Balance number: " +
        this.calculateBalanceNumber(rows * columns, availableSlots, 0.3, 0.4)
    );

    const questionsResult = placeWords(
      "Questions",
      pronounsEndRow,
      0,
      rows,
      columns,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.3, 0.4)
    );

    // 7. Place Negation (2%) next to Questions
    console.log(
      "Negation Available slots: " +
        availableSlots +
        "Balance number: " +
        this.calculateBalanceNumber(rows * columns, availableSlots, 0.2, 0.3)
    );

    const negationsResult = placeWords(
      "Negation",
      pronounsEndRow,
      questionsResult.lastCol + 1,
      rows,
      columns,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.3, 0.3)
    );

    // 8. Place Interjections (8%) next to Negation
    const interjectionsResult = placeWords(
      "Interjections",
      pronounsEndRow,
      negationsResult.lastCol + 1,
      rows,
      columns,
      false,
      100
    );

    // Debug information
    /*console.log("Word distribution:");
    Object.entries(wordsByCategory).forEach(([category, words]) => {
      console.log(`${category}: ${words.length} words`);
    });*/

    return grid;
  }

  private rgbToAnsi(rgbColor: string): string {
    const match = rgbColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return "\x1b[0m";

    const [_, r, g, b] = match.map(Number);
    const brightness = (r + g + b) / 3;
    const textColor = brightness < 128 ? "\x1b[97m" : "\x1b[30m";

    return `\x1b[48;2;${r};${g};${b}m${textColor}`;
  }

  private visualizeBoard(board: OBFBoard): void {
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

        const colorCode = this.rgbToAnsi(button.background_color);
        const resetCode = "\x1b[0m";
        return `${colorCode}${button.label.padEnd(12)}${resetCode}`;
      });

      console.log(rowVisual.join("|"));
      console.log("-".repeat(grid.columns * 15));
    }
    console.log("\x1b[0m");
  }
  private calculateBalanceNumber(
    gridSize: number,
    availableSlots: number,
    smallGridPercentage: number,
    largeGridPercentage: number
  ): number {
    let balanceNumber = 0;
    if (gridSize < 60) {
      balanceNumber = Math.floor(availableSlots * smallGridPercentage);
    } else {
      balanceNumber = Math.floor(availableSlots * largeGridPercentage);
    }
    if (balanceNumber % 2 !== 0) balanceNumber += 1;
    return balanceNumber;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
