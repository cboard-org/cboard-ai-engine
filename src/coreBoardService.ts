import { OpenAIApi, Configuration } from "openai";

// Types for the CORE board structure
export type CoreCategory = {
  name: CategoryName;
  percentage: number;
  required: boolean;
  gridPercentage?: number;
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

// Define valid category names as a union type
export type CategoryName =
  | "Actions"
  | "Adjectives/Adverbs"
  | "Pronouns"
  | "Questions"
  | "Interjections"
  | "Determiners"
  | "Prepositions"
  | "Negation";

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

// Core categories with their target percentages
const CORE_CATEGORIES: CoreCategory[] = [
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
    percentage: 0.05,
    required: false,
    gridPercentage: 0.5,
  },
  { name: "Prepositions", percentage: 0.05, required: false },
  { name: "Questions", percentage: 0.05, required: true, gridPercentage: 0.4 },
  { name: "Negation", percentage: 0.02, required: true },
  { name: "Interjections", percentage: 0.08, required: true },
];

// Fixed core words per category that should always be included
const FIXED_CORE_WORDS: FixedCoreWords = {
  Pronouns: ["I", "you", "it", "we", "they", "he", "she"],
  Questions: ["what", "where", "when", "who", "why", "how"],
  Interjections: ["yes", "no", "please", "thank you"],
  Negation: ["not", "don't"],
};

type CategoryColors = {
  [K in CategoryName]: string;
};

const CATEGORY_COLORS: CategoryColors = {
  Actions: "rgb(200, 255, 200)", // green
  "Adjectives/Adverbs": "rgb(135, 206, 250)", // blue
  Pronouns: "rgb(255, 255, 200)", // yellow
  Interjections: "rgb(255, 192, 203)", // pink
  Questions: "rgb(255, 200, 255)", // purple
  Determiners: "rgb(240, 240, 240)", // gray
  Prepositions: "rgb(255, 255, 255)", // white
  Negation: "rgb(255, 140, 140)", // red
};

export class CoreBoardService {
  private openai: OpenAIApi;

  constructor(apiKey: string) {
    this.openai = new OpenAIApi(new Configuration({ apiKey }));
  }

  async generateCoreBoard(
    prompt: string,
    totalButtons: number = 42
  ): Promise<any> {
    // Calculate slots for each category based on percentages
    let categorySlots = CORE_CATEGORIES.map((category) => ({
      name: category.name,
      slots: Math.round(totalButtons * category.percentage),
      required: category.required,
    }));

    // Generate dynamic words from LLM for non-fixed categories
    const dynamicWords = await this.generateDynamicWords(prompt, categorySlots);

    // Combine fixed and dynamic words
    const allWords = this.combineWords(dynamicWords, categorySlots);

    // Create OBF format board
    const board = this.createOBFBoard(allWords, prompt, totalButtons);
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
      const response = await this.openai.createChatCompletion({
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

  private getCategoryColor(category: CategoryName): string {
    return CATEGORY_COLORS[category];
  }

  private createOBFBoard(
    words: CoreWord[],
    prompt: string,
    totalButtons: number
  ): any {
    // Calculate grid dimensions
    const columns = Math.ceil(Math.sqrt(totalButtons));
    const rows = Math.ceil(totalButtons / columns);

    // Create grid order
    const gridOrder = this.createGridOrder(words, rows, columns);

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

  private createGridOrder(
    words: CoreWord[],
    rows: number,
    columns: number
  ): (string | null)[][] {
    const gridOrder: (string | null)[][] = Array(rows)
      .fill(null)
      .map(() => Array(columns).fill(null));

    // Calculate absolute sizes of each category
    const pronounColumnSize = Math.floor(rows * 0.9);
    const actionColumnSize = Math.floor(rows * 0.7);
    const questionRowSize = Math.floor(columns * 0.4);

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

    //Fill bottom rows
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
      const rowVisual = row.map((buttonId: string | null) => {
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
}
