// To run file
// npm run dev
require("dotenv").config();
import { type ContentSafetyConfiguration, initEngine } from "./src/index";
import * as fs from "fs";
import { CoreBoardService } from "./src/coreBoardService";

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

const prompt = "go to the cinema";
const totalButtons = 50;
const symbolSet = "global-symbols";
const globalSymbolsSet = "mulberry";
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

const promptCore = "go to the cinema";
// First check if content is safe
engineInstance.isContentSafe(promptCore).then(async (isSafe) => {
  console.log("Is content safe?", isSafe);

  if (isSafe) {
    try {
      // Generate CORE board with Global Symbols
      console.log("Generating CORE board with Global Symbols...");
      const coreBoard = await engineInstance.generateCoreBoard(
        promptCore,
        totalButtons,
        symbolSet,
        globalSymbolsSet
      );

      // Save to file
      const filename = `${promptCore}_GlobalSymbols_CoreBoard.obf`;
      console.log(`Saving CORE board to file: ${filename}`);
      fs.writeFileSync(filename, JSON.stringify(coreBoard, null, 2));

    } catch (error) {
      console.error("Error generating CORE board:", error);
    }
  } else {
    console.log("Content was flagged as unsafe, aborting board generation");
  }
});
