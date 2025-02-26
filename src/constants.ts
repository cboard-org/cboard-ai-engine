// Constants
import {
  CoreCategory,
  FixedCoreWords,
  CategoryName,
} from "./types/coreboard-types";

export const DEFAULT_GLOBAL_SYMBOLS_URL =
  "https://globalsymbols.com/api/v1/labels/search/";
export const DEFAULT_ARASAAC_URL = "https://api.arasaac.org/api/pictograms";
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_MAX_SUGGESTIONS = 10;

export const ARASAAC = "arasaac";
export const GLOBAL_SYMBOLS = "global-symbols";

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

export const FIXED_CORE_WORDS: FixedCoreWords = {
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

export const CATEGORY_COLORS: Record<CategoryName, string> = {
  Actions: "rgb(200, 255, 200)",
  "Adjectives/Adverbs": "rgb(135, 206, 250)",
  Pronouns: "rgb(255, 255, 200)",
  Interjections: "rgb(255, 192, 203)",
  Questions: "rgb(255, 200, 255)",
  Determiners: "rgb(180, 180, 180)",
  Prepositions: "rgb(255, 255, 255)",
  Negation: "rgb(255, 140, 140)",
};
