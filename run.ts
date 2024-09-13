// To run file
// npm run dev
require('dotenv').config()
import { type ContentSafetyConfiguration, initEngine } from "./src/index";

const apiKey = process.env.OPENAI_API_KEY;

const openAIConfiguration = {
  apiKey,
  basePath:
    "https://cboard-openai.openai.azure.com/openai/deployments/ToEdit-01",
  baseOptions: {
    headers: { "api-key": apiKey },
    params: {
      "api-version": "2022-12-01",
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

const prompt = "familia";
const maxSuggestions = 15;
const symbolSet = "arasaac";
//const symbolSet = "global-symbols";
const globalSymbolsSymbolSet = "global-symbols";
const language = "es";
//const language = "en";

//Check content safety
//console.log("isPromptSafe: "+ engineInstance.isContentSafe(prompt));
engineInstance.isContentSafe(prompt).then((result) => {
  console.log('Is content safe?', result);
});


// Get suggestions with GlobalSymbols
engineInstance
  .getSuggestions({
    prompt,
    maxSuggestions,
    symbolSet,
    language,
  })
  .then((suggestions) =>
    // console.log(
    //   "\nSuggestions -----------------------------------------------\n"

    //   // suggestions,
    //   // "length: " + suggestions.length
    // )
    console.dir(suggestions, { depth: null })
  );

