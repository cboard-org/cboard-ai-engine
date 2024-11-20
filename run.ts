// To run file
// npm run dev
require("dotenv").config();
import { type ContentSafetyConfiguration, initEngine } from "./src/index";

const apiKey = process.env.OPENAI_API_KEY;
const basePath = process.env.OPENAI_BASE_PATH;

const openAIConfiguration = {
  apiKey,
  basePath,
  baseOptions: {
    headers: { "api-key": apiKey },
    params: {
      "api-version": "2024-08-01-preview",
    },
  },
};

const contentSafetyConfiguration = {
  endpoint: process.env.CONTENT_SAFETY_ENDPOINT,
  key: process.env.CONTENT_SAFETY_KEY,
} as ContentSafetyConfiguration;

const engineInstance = initEngine({
  openAIConfiguration,
  contentSafetyConfiguration,
});

const prompt = "jungle birds";
const maxSuggestions = 15;
const symbolSet = "arasaac";
//const symbolSet = "global-symbols";
const globalSymbolsSymbolSet = "global-symbols";
//const language = "es";
const language = "en";

//Check content safety
//console.log("isPromptSafe: "+ engineInstance.isContentSafe(prompt));
engineInstance.isContentSafe(prompt).then((result) => {
  console.log("Is content safe?", result);
});

/*
// Get suggestions with GlobalSymbols
engineInstance
  .getSuggestions({
    prompt,
    maxSuggestions,
    symbolSet,
    language,
  })
  .then(
    (suggestions) =>
      // console.log(
      //   "\nSuggestions -----------------------------------------------\n"

      //   // suggestions,
      //   // "length: " + suggestions.length
      // )
      console.log(
        "\nSuggestions -----------------------------------------------\n"
      )
    //console.dir(suggestions, { depth: 2 })
  );*/

console.log("Creating a CORE board...");

engineInstance
  .getCoreBoardSuggestions({
    topic: "surfing",
    maxWords: 30,
    language: "en",
  })
  .then((coreBoard) => {
    console.log(
      "\nCore Board Suggestions ------------------------------------\n"
    );

    // Count words per category
    const wordsByCategory = coreBoard.BoardName[0].words.reduce((acc, word) => {
      const category = Object.keys(word)[0];
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate total words
    const totalWords = coreBoard.BoardName[0].words.length;

    // Log word counts
    console.log("\nWord Count Summary:");
    console.log("------------------");
    Object.entries(wordsByCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([category, count]) => {
        console.log(`${category}: ${count} words`);
      });
    console.log("------------------");
    console.log(`Total words: ${totalWords}`);
    console.log("\n");

    // Log the full board
    console.dir(coreBoard, { depth: 5 });
  });
