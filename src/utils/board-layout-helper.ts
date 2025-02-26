import { CORE_CATEGORIES } from "../constants";
import { CategoryName, CoreWord } from "../types/coreboard-types";

export class BoardLayoutHelper {
  /**
   * Creates grid order for buttons
   * @param words Array of core words
   * @param rows Number of rows in the grid
   * @param columns Number of columns in the grid
   * @returns 2D array of button IDs or null
   */
  static createGridOrder(
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

    // Calculate space allocation
    const usableRows = rows;
    const pronounsEndRow = Math.floor(usableRows * 0.8);
    const middleSection = Math.floor(pronounsEndRow * 0.8);

    // Place words in the grid
    const pronounsResult = this.placeWords(
      CORE_CATEGORIES[0].name, // Pronouns
      wordsByCategory,
      0,
      0,
      pronounsEndRow,
      columns,
      grid,
      true,
      100
    );

    // Calculate available slots for Actions
    let availableSlots =
      middleSection -
      pronounsResult.lastRow +
      (columns - (pronounsResult.lastCol + 1)) * middleSection;

    // Place Actions
    const actionResult = this.placeWords(
      CORE_CATEGORIES[1].name, // Actions
      wordsByCategory,
      pronounsResult.lastRow,
      pronounsResult.lastCol,
      middleSection,
      columns,
      grid,
      true,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );

    // Place Adjectives/Adverbs
    const adjectivesResult = this.placeWords(
      CORE_CATEGORIES[2].name, // Adjectives/Adverbs
      wordsByCategory,
      actionResult.lastRow,
      actionResult.lastCol,
      middleSection,
      columns,
      grid,
      true,
      100
    );

    // Calculate available slots for Determiners
    availableSlots =
      (pronounsEndRow - middleSection) * (columns - pronounsResult.lastCol);

    // Place Determiners
    console.log(
      "Determiners balance:",
      rows * columns,
      availableSlots,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );
    const determinerResult = this.placeWords(
      CORE_CATEGORIES[3].name, // Determiners
      wordsByCategory,
      middleSection,
      pronounsResult.lastCol,
      pronounsEndRow,
      columns,
      grid,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.5, 0.5)
    );

    // Place Prepositions
    const propositionsResult = this.placeWords(
      CORE_CATEGORIES[4].name, // Prepositions
      wordsByCategory,
      middleSection,
      determinerResult.lastCol + 1,
      pronounsEndRow,
      columns,
      grid,
      false,
      100
    );

    // Calculate available slots for Questions
    availableSlots = (usableRows - pronounsEndRow) * columns;

    // Place Questions
    const questionResult = this.placeWords(
      CORE_CATEGORIES[5].name, // Questions
      wordsByCategory,
      pronounsEndRow,
      0,
      rows,
      columns,
      grid,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.3, 0.4)
    );

    // Place Negation
    const negationResult = this.placeWords(
      CORE_CATEGORIES[6].name, // Negation
      wordsByCategory,
      pronounsEndRow,
      questionResult.lastCol + 1,
      rows,
      columns,
      grid,
      false,
      this.calculateBalanceNumber(rows * columns, availableSlots, 0.3, 0.3)
    );

    // Place Interjections
    this.placeWords(
      CORE_CATEGORIES[7].name, // Interjections
      wordsByCategory,
      pronounsEndRow,
      negationResult.lastCol + 1,
      rows,
      columns,
      grid,
      false,
      100
    );

    return grid;
  }

  /**
   * Places words of a specific category in the grid
   * @param category Category name
   * @param wordsByCategory Map of words grouped by category
   * @param startRow Starting row index
   * @param startCol Starting column index
   * @param maxRow Maximum row index
   * @param endCol Maximum column index
   * @param grid The grid being filled
   * @param isTop Whether to start from the top
   * @param balanceNumber Maximum number of words to place
   * @returns Object with the last row and column index
   */
  private static placeWords(
    category: CategoryName,
    wordsByCategory: Record<CategoryName, CoreWord[]>,
    startRow: number,
    startCol: number,
    maxRow: number,
    endCol: number = Number.MAX_SAFE_INTEGER,
    grid: (string | null)[][],
    isTop: boolean = false,
    balanceNumber: number = 0
  ): { lastRow: number; lastCol: number } {
    // Resize category words by balanceNumber
    let categoryWords = wordsByCategory[category] || [];
    console.log(
      `There are ${categoryWords.length} words of category ${category}`
    );
    console.log(`There are ${balanceNumber} words to place`);
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

      if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
        grid[row][col] = word.id;
        row++;
        wordsInCurrentColumn++;
      } else {
        console.warn(
          `Attempted to place word outside grid bounds: word=${word.label}, row=${row}, col=${col}`
        );
        break;
      }
    }

    // Calculate actual last position
    const actualLastCol = col === startCol ? col + 1 : col;
    return { lastRow: row, lastCol: actualLastCol };
  }

  /**
   * Calculates the number of words to be placed based on grid size and available slots
   * @param gridSize Total number of grid cells
   * @param availableSlots Number of available slots
   * @param smallGridPercentage Percentage for small grids
   * @param largeGridPercentage Percentage for large grids
   * @returns Balanced number of words to place
   */
  static calculateBalanceNumber(
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
