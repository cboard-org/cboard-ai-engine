// To run file
// npm run dev

import { initEngine, type PictonizerConfiguration } from "./src/index";

const apiKey = process.env.AZURE_OPENAI_API_KEY;

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

const prompt = "Modern family";
const maxSuggestions = 5;
const symbolSet = "arasaac";
const language = "eng";

// Get suggestions
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
      suggestions
    )
  );

// Get suggestions with image
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
});