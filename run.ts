// To run file
// npm run dev
require('dotenv').config()
import { type ContentSafetyConfiguration, initEngine, type PictonizerConfiguration } from "./src/index";

const apiKey = process.env.OPENAI_API_KEY;

const openAIConfiguration = {
  apiKey,
  basePath: "https://cboard-openai.openai.azure.com/openai/deployments/ToEdit-01",
  baseOptions: {
    headers: { "api-key": apiKey },
    params: {
      "api-version": "2022-12-01",
    },
  },
};

const pictonizerConfiguration = {
  URL: process.env.PICTONIZER_URL,
  token: process.env.PICTONIZER_AUTH_TOKEN,
  keyWords: "arasaac pictograms",
} as PictonizerConfiguration;

const contentSafetyConfiguration = {
  endpoint: process.env.CONTENT_SAFETY_ENDPOINT,
  key: process.env.CONTENT_SAFETY_KEY,
} as ContentSafetyConfiguration;

const engineInstance = initEngine({
  openAIConfiguration,
  pictonizerConfiguration,
  contentSafetyConfiguration,
});

const prompt = "Italian food";
const maxSuggestions = 15;
const symbolSet = "arasaac";
//const language = "spa";
const language = "eng";

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
    console.log(
      "\nSuggestions -----------------------------------------------\n",
      suggestions,
      "length: " + suggestions.length
    )
  );

/*
// Get suggestions with GlobalSymbol and Pictonizer images
engineInstance
  .getSuggestionsAndProcessPictograms({
    prompt,
    maxSuggestions,
    symbolSet,
    language,
  })
  .then((suggestions) =>
    console.log(
      "\nSuggestions with image -----------------------------------------------\n",
      suggestions
    )
  );

//Get Pictonizer image
engineInstance.pictonizer("dog").then((image) => {
  console.log(
    "Pictonizer image -----------------------------------------------\n"
  );
  console.dir(image, { depth: null });
}); */
