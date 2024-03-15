// To run file
// npm run dev
require('dotenv').config()
import { initEngine, type PictonizerConfiguration } from "./src/index";

const apiKey = process.env.OPENAI_API_KEY;

const openAIConfiguration = {
  apiKey,
  basePath: "https://cboard-openai.openai.azure.com/openai/deployments/ToEdit",
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

const engineInstance = initEngine({
  openAIConfiguration,
  pictonizerConfiguration,
});

const prompt = "good morning";
const maxSuggestions = 5;
const symbolSet = "arasaac";
const language = "eng";

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
      "label: " + suggestions[1].label,
      "images: " + JSON.stringify(suggestions[1].pictogram.images),
    )
  );

/* // Get suggestions with GlobalSymbol and Pictonizer images
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
