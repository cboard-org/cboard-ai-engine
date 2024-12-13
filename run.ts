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
  );
