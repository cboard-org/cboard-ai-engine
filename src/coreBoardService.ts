import {
  ARASAAC,
  CORE_CATEGORIES,
  FIXED_CORE_WORDS,
  CATEGORY_COLORS,
} from "./constants";
import {
  OBFImage,
  getArasaacOBFImages,
  getGlobalSymbolsOBFImages,
} from "./lib/symbolSets";
import { type SymbolSet } from "./lib/symbolSets";
import {
  CategoryName,
  FixedCoreWords,
  CoreWord,
  Button,
  OBFBoard,
} from "./types/coreboard-types";
import { OpenAIService } from "./utils/openAIservice";
import { BoardVisualizationHelper } from "./utils/board-visualization-helper";
import { BoardLayoutHelper } from "./utils/board-layout-helper";

export class CoreBoardService {
  constructor(
    private openAIService: OpenAIService,
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

    const dynamicWords = await this.openAIService.generateDynamicWords(
      prompt,
      categorySlots
    );
    const allWords = this.combineWords(dynamicWords, categorySlots);
    const images: OBFImage[] = [];
    /*const images = await this.getImages(
      allWords,
      symbolSet,
      globalSymbolsSymbolSet
    );*/
    const board = this.createOBFBoard(allWords, prompt, images, totalButtons);
    BoardVisualizationHelper.visualizeBoard(board);
    return board;
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

  private createOBFBoard(
    words: CoreWord[],
    prompt: string,
    images: OBFImage[],
    totalButtons: number
  ): any {
    const columns = Math.ceil(Math.sqrt(totalButtons));
    const rows = Math.ceil(totalButtons / columns);
    const gridOrder = BoardLayoutHelper.createGridOrder(words, rows, columns);

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
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
