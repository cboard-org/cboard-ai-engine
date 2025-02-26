// coreboard-types.ts
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

export type FixedCoreWords = {
  Pronouns: string[];
  Questions: string[];
  Interjections: string[];
  Negation: string[];
};

export type Button = {
  id: string;
  label: string;
  background_color: string;
  border_color: string;
};

export type OBFBoard = {
  buttons: Button[];
  grid: {
    rows: number;
    columns: number;
    order: (string | null)[][];
  };
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
